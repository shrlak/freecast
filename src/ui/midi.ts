import { useEffect, useRef, useState } from 'react';
import type { Action } from '../domain/reducer';
import type { Macro } from '../domain/types';
import { createMidiDecoder, createOscDecoder, midiAction, midiTarget, type MidiPress, type MidiSettings } from '../domain/midi';

/** Name presses heard from the X32 over the network carry (MIDI ones carry their port name). */
export const X32_NETWORK_INPUT = 'X32 (Wi-Fi)';

export interface X32NetState {
  status: 'off' | 'connecting' | 'connected' | 'lost' | 'unavailable';
  ip: string | null;
  name: string | null;
  model: string | null;
  error?: string;
}

export interface MidiHubState {
  status: 'off' | 'unsupported' | 'denied' | 'ready';
  /** Names of the connected MIDI inputs (e.g. “X-USB” for an X32 with the USB card). */
  inputs: string[];
  last: { input: string; press: MidiPress; at: number } | null;
  /** The X32 over Wi-Fi, through the FreeCast server on this computer (browsers cannot speak OSC). */
  net: X32NetState;
}

type PressListener = (input: string, press: MidiPress) => void;

/** One Web MIDI connection for the whole console; follows inputs being plugged in and out. */
class MidiHub {
  state: MidiHubState = { status: 'off', inputs: [], last: null, net: { status: 'off', ip: null, name: null, model: null } };
  private events: EventSource | null = null;
  private access: MIDIAccess | null = null;
  private attached = new WeakSet<MIDIInput>();
  private listeners = new Set<(s: MidiHubState) => void>();
  private presses = new Set<PressListener>();
  private capture: PressListener | null = null;
  private started = false;

  private set(patch: Partial<MidiHubState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  subscribe(fn: (s: MidiHubState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  onPress(fn: PressListener) {
    this.presses.add(fn);
    return () => { this.presses.delete(fn); };
  }

  /** The next press goes to `fn` only (MIDI learn), so learning a button does not also turn the slide. */
  learn(fn: PressListener | null) {
    this.capture = fn;
  }

  start() {
    if (this.started) return;
    this.started = true;
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      this.set({ status: 'unsupported' });
      return;
    }
    navigator.requestMIDIAccess().then((access) => {
      this.access = access;
      this.set({ status: 'ready' });
      access.onstatechange = () => this.attach();
      this.attach();
    }).catch(() => this.set({ status: 'denied' }));
  }

  private attach() {
    const names: string[] = [];
    this.access?.inputs.forEach((input) => {
      if (input.state !== 'connected') return;
      names.push(input.name ?? input.id);
      if (this.attached.has(input)) return;
      this.attached.add(input);
      const decode = createMidiDecoder();
      input.addEventListener('midimessage', (e) => {
        const press = decode((e as MIDIMessageEvent).data ?? []);
        if (press) this.press(input.name ?? input.id, press);
      });
      input.open?.().catch(() => undefined);
    });
    this.set({ inputs: names });
  }

  /** Follow the server's X32 link (status and button changes) — once, for as long as the console is open. */
  listenNetwork() {
    if (this.events || typeof EventSource === 'undefined') return;
    const decode = createOscDecoder();
    const events = new EventSource('/api/x32/events');
    this.events = events;
    events.onmessage = (e) => {
      let msg: { type: string; status?: X32NetState['status']; ip?: string | null; name?: string | null; model?: string | null; address?: string; value?: number };
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'status') this.set({ net: { status: msg.status ?? 'off', ip: msg.ip ?? null, name: msg.name ?? null, model: msg.model ?? null } });
      else if (msg.type === 'osc' && typeof msg.address === 'string' && typeof msg.value === 'number') {
        const press = decode(msg.address, msg.value);
        if (press) this.press(X32_NETWORK_INPUT, press);
      }
    };
    // The desktop app (and `npm start`) serve the X32 link; a plain static host does not.
    events.onerror = () => { if (events.readyState === EventSource.CLOSED) this.set({ net: { ...this.state.net, status: 'unavailable' } }); };
  }

  async connectNetwork(ip: string | null) {
    this.listenNetwork();
    try {
      const res = await fetch(ip ? '/api/x32/connect' : '/api/x32/disconnect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ip }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) this.set({ net: { ...this.state.net, status: res.status === 404 ? 'unavailable' : 'off', error: body.error ?? `HTTP ${res.status}` } });
    } catch (e) {
      this.set({ net: { ...this.state.net, status: 'unavailable', error: (e as Error).message } });
    }
  }

  /** X32s that answer on this computer's networks. */
  async scanNetwork(): Promise<{ ip: string; name: string | null; model: string | null }[]> {
    const res = await fetch('/api/x32/scan', { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
    return (await res.json()).found ?? [];
  }

  private press(input: string, press: MidiPress) {
    this.set({ last: { input, press, at: Date.now() } });
    const capture = this.capture;
    if (capture) {
      this.capture = null;
      capture(input, press);
      return;
    }
    this.presses.forEach((fn) => fn(input, press));
  }
}

export const midiHub = new MidiHub();

export function useMidiHub(): MidiHubState {
  const [s, setS] = useState(midiHub.state);
  useEffect(() => midiHub.subscribe(setS), []);
  return s;
}

/** Turn presses from the X32 (Wi-Fi or USB) or another MIDI input into console actions. */
export function useMidi(settings: MidiSettings, dispatch: (a: Action) => void, macros: Macro[]) {
  const latest = useRef({ settings, dispatch, macros });
  latest.current = { settings, dispatch, macros };
  const netIp = settings.enabled && settings.network.on && settings.network.ip ? settings.network.ip : null;
  useEffect(() => {
    if (!netIp && midiHub.state.net.status === 'off') return;
    midiHub.connectNetwork(netIp);
  }, [netIp]);
  useEffect(() => {
    if (!settings.enabled) return;
    midiHub.start();
    return midiHub.onPress((input, press) => {
      const { settings: s, dispatch: send, macros: list } = latest.current;
      // The input choice is about MIDI ports; the X32 over Wi-Fi always counts while it is connected.
      if (press.kind !== 'osc' && s.input && s.input !== input) return;
      const target = midiTarget(s, press, list);
      if (target) send(midiAction(target, Date.now()));
    });
  }, [settings.enabled]);
}
