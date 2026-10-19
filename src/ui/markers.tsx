import { useRef, type Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Macro, MediaMeta, PlaybackMarker } from '../domain/types';
import { uid } from '../domain/lyrics';

/** Fires each marker once when playback crosses its time (seeking backwards re-arms it). */
export function useMarkerTrigger(markers: PlaybackMarker[] | undefined, dispatch: Dispatch<Action>) {
  const last = useRef<number | null>(null);
  return (t: number) => {
    const prev = last.current;
    last.current = t;
    if (prev == null || !markers?.length || t < prev || t - prev > 2) return;
    for (const m of markers) {
      if (m.t > prev && m.t <= t) {
        if (m.macroId) dispatch({ type: 'macro/run', id: m.macroId, now: Date.now() });
        if (m.stageMessage) dispatch({ type: 'live/stageMessage', message: m.stageMessage });
      }
    }
  };
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Marker list + "add marker at the current time" for one media file. */
export function MarkerEditor({ media, t, macros, dispatch }: { media: MediaMeta; t: number; macros: Macro[]; dispatch: Dispatch<Action> }) {
  const markers = media.markers ?? [];
  const save = (next: PlaybackMarker[]) => dispatch({ type: 'media/markers', id: media.id, markers: next });
  const add = () => {
    const choice = prompt(`Marker at ${fmt(t)} — type a stage message, or a macro name to run:\n${macros.map((m) => `• ${m.name}`).join('\n')}`);
    if (!choice) return;
    const macro = macros.find((m) => m.name.toLowerCase() === choice.trim().toLowerCase());
    save([...markers, { id: uid('mk'), t: Math.round(t * 10) / 10, label: choice.trim(), macroId: macro?.id, stageMessage: macro ? undefined : choice.trim() }]);
  };
  return (
    <div className="markers">
      <button className="mini-btn" onClick={add} title="Add a playback marker at the current time">＋ Marker @ {fmt(t)}</button>
      {markers.map((m) => (
        <span key={m.id} className="marker-chip" title={m.macroId ? 'Runs macro' : 'Stage message'}>
          {fmt(m.t)} {m.macroId ? '⚡' : '🎤'} {m.label}
          <button className="mini-btn" onClick={() => save(markers.filter((x) => x.id !== m.id))}>✕</button>
        </span>
      ))}
    </div>
  );
}
