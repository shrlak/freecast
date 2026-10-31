import { useEffect, useRef, useState } from 'react';
import type { Action } from '../domain/reducer';
import type { Macro } from '../domain/types';
import { createMidiDecoder, midiAction, midiTarget, type MidiPress, type MidiSettings } from '../domain/midi';

export interface MidiHubState {
  status: 'off' | 'unsupported' | 'denied' | 'ready';
  /** Names of the connected MIDI inputs (e.g. “X-USB” for an X32 with the USB card). */
  inputs: string[];
  last: { input: string; press: MidiPress; at: number } | null;
}

type PressListener = (input: string, press: MidiPress) => void;

/** One Web MIDI connection for the whole console; follows inputs being plugged in and out. */
class MidiHub {
  state: MidiHubState = { status: 'off', inputs: [], last: null };
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

/** Turn presses from the chosen MIDI input (an X32, a keyboard, a pedal…) into console actions. */
export function useMidi(settings: MidiSettings, dispatch: (a: Action) => void, macros: Macro[]) {
  const latest = useRef({ settings, dispatch, macros });
  latest.current = { settings, dispatch, macros };
  useEffect(() => {
    if (!settings.enabled) return;
    midiHub.start();
    return midiHub.onPress((input, press) => {
      const { settings: s, dispatch: send, macros: list } = latest.current;
      if (s.input && s.input !== input) return;
      const target = midiTarget(s, press, list);
      if (target) send(midiAction(target, Date.now()));
    });
  }, [settings.enabled]);
}
