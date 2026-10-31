// Mixer control: map MIDI notes, control changes and program changes, and X32 buttons heard over
// the network (OSC), to console actions. Built for a Behringer X32 / M32 — over Wi-Fi, through the
// X-USB card or the MIDI DIN ports — and works the same with any MIDI controller, keyboard or pedal.
import type { Action } from './reducer';
import type { Macro } from './types';

export type MidiKind = 'note' | 'cc' | 'pc';

/**
 * One button press: note-on, control change going up from 0 or program change (channel 1–16),
 * or an X32 control changing over the network (its OSC address, e.g. /ch/32/mix/on).
 */
export type MidiPress = { kind: MidiKind; channel: number; number: number } | { kind: 'osc'; address: string };

export type MidiCommand = 'next' | 'prev' | 'clearAll' | 'clearText' | 'clearBackground' | 'black' | 'logo';
export type MidiTarget = { type: 'command'; command: MidiCommand } | { type: 'macro'; macroId: string };

export type MidiTrigger =
  /** channel 1–16, or null for any channel. */
  | { kind: MidiKind; channel: number | null; number: number }
  | { kind: 'osc'; address: string };
export type MidiBinding = MidiTrigger & { target: MidiTarget };

export interface MidiSettings {
  enabled: boolean;
  /** Only listen to this MIDI input (its port name); null = every connected input. */
  input: string | null;
  bindings: MidiBinding[];
  /** Notes 36–51 run macros 1–16 (in the order of the Macros list). */
  macroNotes: boolean;
  /** The X32 over Wi-Fi / the network: its IP address (X32 SETUP → network). */
  network: { on: boolean; ip: string };
}

export const MIDI_COMMANDS: { id: MidiCommand; label: string }[] = [
  { id: 'next', label: '다음 슬라이드' },
  { id: 'prev', label: '이전 슬라이드' },
  { id: 'clearAll', label: '모두 지우기' },
  { id: 'clearText', label: '슬라이드 글자 지우기' },
  { id: 'clearBackground', label: '배경 지우기' },
  { id: 'black', label: '검은 화면 켜기/끄기' },
  { id: 'logo', label: '로고 화면 켜기/끄기' },
];

const command = (c: MidiCommand): MidiTarget => ({ type: 'command', command: c });

/** The mapping FreeCast has always had, so an X32 button set to “MIDI Push · Note 60” turns the slide. */
export const DEFAULT_MIDI_BINDINGS: MidiBinding[] = [
  { kind: 'note', channel: null, number: 60, target: command('next') },
  { kind: 'note', channel: null, number: 59, target: command('prev') },
  { kind: 'note', channel: null, number: 58, target: command('clearAll') },
  { kind: 'note', channel: null, number: 57, target: command('clearText') },
  { kind: 'note', channel: null, number: 56, target: command('black') },
  { kind: 'cc', channel: null, number: 64, target: command('next') },
];

export const defaultMidiSettings = (): MidiSettings => ({ enabled: false, input: null, bindings: DEFAULT_MIDI_BINDINGS.map((b) => ({ ...b })), macroNotes: true, network: { on: false, ip: '' } });

/** Port names a Behringer X32 / M32 shows up as (X-USB card, or the console's own name). */
export const isX32Port = (name: string) => /x-?usb|x32|m32|behringer|midas/i.test(name);

/**
 * Turns raw MIDI bytes into presses. Control changes count once when they go up from 0, so an X32
 * “MIDI Push · CC” button (127 on press, 0 on release) or a sustain pedal fires once per press.
 */
export function createMidiDecoder() {
  const held = new Map<number, boolean>();
  return (data: ArrayLike<number>): MidiPress | null => {
    if (!data || data.length < 2) return null;
    const status = data[0];
    const kind = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const a = data[1] & 0x7f;
    if (kind === 0xc0) return { kind: 'pc', channel, number: a };
    if (data.length < 3) return null;
    const b = data[2] & 0x7f;
    if (kind === 0x90) return b > 0 ? { kind: 'note', channel, number: a } : null;
    if (kind === 0xb0) {
      const key = channel * 128 + a;
      const was = held.get(key) ?? false;
      held.set(key, b > 0);
      return b > 0 && !was ? { kind: 'cc', channel, number: a } : null;
    }
    return null;
  };
}

// Console state the X32 also reports over the network, which a button press never is.
const NOT_BUTTONS = /^\/-(?!stat\/(userpar|solosw)\/)/;

/**
 * Turns X32 changes heard over the network into presses. A mute (0/1) fires on every change, so each
 * press of a spare channel's MUTE button counts; a user-assign button going back to 0 after a value
 * above 1 (127 → 0) is its release. Screen, selection and other UI state is ignored.
 */
export function createOscDecoder() {
  const last = new Map<string, number>();
  return (address: string, value: number): MidiPress | null => {
    if (!address.startsWith('/') || NOT_BUTTONS.test(address) || !Number.isInteger(value)) return null;
    const prev = last.get(address);
    last.set(address, value);
    if (prev === value) return null;
    if (value === 0 && prev != null && prev > 1) return null;
    return { kind: 'osc', address };
  };
}

const matches = (b: MidiTrigger, p: MidiPress) => {
  if (b.kind === 'osc' || p.kind === 'osc') return b.kind === p.kind && (b as { address: string }).address === (p as { address: string }).address;
  return b.kind === p.kind && b.number === p.number && (b.channel == null || b.channel === p.channel);
};
const channelOf = (b: MidiTrigger) => (b.kind === 'osc' ? null : b.channel);

/** What a press should do, or null when nothing is mapped to it. */
export function midiTarget(settings: MidiSettings, press: MidiPress, macros: Macro[]): MidiTarget | null {
  // A channel-specific binding wins over an any-channel one.
  const hits = settings.bindings.filter((b) => matches(b, press)).sort((x, y) => Number(channelOf(y) != null) - Number(channelOf(x) != null));
  const hit = hits.find((b) => b.target.type === 'command' || macros.some((m) => m.id === (b.target as { macroId: string }).macroId));
  if (hit) return hit.target;
  if (settings.macroNotes && press.kind === 'note' && press.number >= 36 && press.number <= 51) {
    const m = macros[press.number - 36];
    if (m) return { type: 'macro', macroId: m.id };
  }
  return null;
}

export function midiAction(target: MidiTarget, now: number): Action {
  if (target.type === 'macro') return { type: 'macro/run', id: target.macroId, now };
  switch (target.command) {
    case 'next': return { type: 'live/next' };
    case 'prev': return { type: 'live/prev' };
    case 'clearAll': return { type: 'live/clearAll' };
    case 'clearText': return { type: 'live/clearText' };
    case 'clearBackground': return { type: 'live/clearBackground' };
    case 'black': return { type: 'live/toggleBlack' };
    case 'logo': return { type: 'live/logo' };
  }
}

const sameTarget = (a: MidiTarget, b: MidiTarget) =>
  a.type === b.type && (a.type === 'command' ? a.command === (b as typeof a).command : a.macroId === (b as typeof a).macroId);

/** Map a learned press to a target. The press is taken away from whatever else it did. */
export function learnBinding(settings: MidiSettings, press: MidiPress, target: MidiTarget): MidiSettings {
  const others = settings.bindings.filter((b) => !matches(b, press));
  const trigger: MidiTrigger = press.kind === 'osc' ? { kind: 'osc', address: press.address } : { kind: press.kind, channel: press.channel, number: press.number };
  return { ...settings, bindings: [...others, { ...trigger, target }] };
}

export const bindingsFor = (settings: MidiSettings, target: MidiTarget) => settings.bindings.filter((b) => sameTarget(b.target, target));

export function removeBinding(settings: MidiSettings, binding: MidiBinding): MidiSettings {
  return { ...settings, bindings: settings.bindings.filter((b) => b !== binding) };
}

/** An X32 OSC address in console words: “Ch 32 뮤트”, “뮤트 그룹 1”, “사용자 버튼 13”. */
export function describeX32(address: string): string {
  const n = (s: string) => String(Number(s));
  let m: RegExpExecArray | null;
  if ((m = /^\/(ch|bus|auxin|fxrtn|mtx)\/(\d+)\/mix\/on$/.exec(address))) return `${({ ch: 'Ch', bus: 'Bus', auxin: 'Aux In', fxrtn: 'FX Rtn', mtx: 'Matrix' } as Record<string, string>)[m[1]]} ${n(m[2])} 뮤트`;
  if ((m = /^\/dca\/(\d+)\/on$/.exec(address))) return `DCA ${n(m[1])} 뮤트`;
  if ((m = /^\/config\/mute\/(\d+)$/.exec(address))) return `뮤트 그룹 ${n(m[1])}`;
  if ((m = /^\/-stat\/userpar\/(\d+)\/value$/.exec(address))) return `사용자 버튼 ${n(m[1])}`;
  if ((m = /^\/-stat\/solosw\/(\d+)$/.exec(address))) return `솔로 ${n(m[1])}`;
  if (/^\/main\/st\/mix\/on$/.test(address)) return 'Main LR 뮤트';
  return address;
}

/** “Note 60 · ch 1”, “CC 64”, “PC 3 · ch 16” (program changes 1–128 like on the X32), “X32 Ch 32 뮤트”. */
export function describeMidi(b: MidiTrigger | MidiPress): string {
  if (b.kind === 'osc') return `X32 ${describeX32(b.address)}`;
  const what = b.kind === 'note' ? `Note ${b.number}` : b.kind === 'cc' ? `CC ${b.number}` : `PC ${b.number + 1}`;
  return b.channel == null ? what : `${what} · ch ${b.channel}`;
}

const KEY = 'freecast.midi.v2';
const LEGACY_KEY = 'freecast.midi';

const isKind = (k: unknown): k is MidiKind => k === 'note' || k === 'cc' || k === 'pc';
const isAddress = (a: unknown): a is string => typeof a === 'string' && a.startsWith('/') && a.length <= 64;
const isByte = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 127;
const isTarget = (t: unknown): t is MidiTarget => {
  const x = t as MidiTarget | null;
  return !!x && ((x.type === 'command' && MIDI_COMMANDS.some((c) => c.id === x.command)) || (x.type === 'macro' && typeof x.macroId === 'string'));
};

export function normalizeMidiSettings(value: unknown, legacyOn = false): MidiSettings {
  const base = defaultMidiSettings();
  if (!value || typeof value !== 'object') return { ...base, enabled: legacyOn };
  const v = value as Partial<MidiSettings>;
  const bindings: MidiBinding[] = Array.isArray(v.bindings)
    ? v.bindings.flatMap((b): MidiBinding[] => {
      if (!b || !isTarget(b.target)) return [];
      if (b.kind === 'osc') return isAddress(b.address) ? [{ kind: 'osc', address: b.address, target: b.target }] : [];
      return isKind(b.kind) && isByte(b.number) && (b.channel == null || (Number.isInteger(b.channel) && b.channel >= 1 && b.channel <= 16))
        ? [{ kind: b.kind, channel: b.channel ?? null, number: b.number, target: b.target }] : [];
    })
    : base.bindings;
  const net = (v.network ?? {}) as Partial<MidiSettings['network']>;
  return {
    enabled: v.enabled === true,
    input: typeof v.input === 'string' && v.input ? v.input : null,
    bindings,
    macroNotes: v.macroNotes !== false,
    network: { on: net.on === true, ip: typeof net.ip === 'string' ? net.ip.trim().slice(0, 15) : '' },
  };
}

/** Saved per computer: MIDI gear is plugged into this machine, not shared through the library. */
export function loadMidiSettings(): MidiSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return normalizeMidiSettings(raw ? JSON.parse(raw) : null, localStorage.getItem(LEGACY_KEY) === '1');
  } catch {
    return defaultMidiSettings();
  }
}

export function saveMidiSettings(s: MidiSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: the setting lasts until FreeCast is closed */
  }
}
