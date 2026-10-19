import { useEffect, useRef } from 'react';
import type { Action } from '../domain/reducer';
import type { Macro } from '../domain/types';

const NOTES: Record<number, Action> = {
  60: { type: 'live/next' },
  59: { type: 'live/prev' },
  58: { type: 'live/clearAll' },
  57: { type: 'live/clearText' },
  56: { type: 'live/toggleBlack' },
};

/** Map MIDI note-on messages (and CC 64) to console actions; notes 36–51 run macros 1–16. */
export function useMidi(enabled: boolean, dispatch: (a: Action) => void, macros: Macro[]) {
  const latest = useRef({ dispatch, macros });
  latest.current = { dispatch, macros };
  useEffect(() => {
    if (!enabled || !('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | null = null;
    const onMessage = (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 3) return;
      const [status, a, b] = data;
      const kind = status & 0xf0;
      const { dispatch: send, macros: list } = latest.current;
      if (kind === 0x90 && b > 0) {
        if (NOTES[a]) send(NOTES[a]);
        else if (a >= 36 && a <= 51 && list[a - 36]) send({ type: 'macro/run', id: list[a - 36].id, now: Date.now() });
      } else if (kind === 0xb0 && a === 64 && b > 64) {
        send({ type: 'live/next' });
      }
    };
    navigator.requestMIDIAccess().then((m) => {
      access = m;
      m.inputs.forEach((input) => input.addEventListener('midimessage', onMessage as EventListener));
    }).catch(() => undefined);
    return () => access?.inputs.forEach((input) => input.removeEventListener('midimessage', onMessage as EventListener));
  }, [enabled]);
}
