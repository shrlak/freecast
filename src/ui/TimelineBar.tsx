import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Presentation } from '../domain/types';

interface Props {
  p: Presentation;
  state: AppState;
  dispatch: Dispatch<Action>;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/**
 * Timeline: record when each slide is triggered (optionally while an audio track plays),
 * then play the presentation back with the same timing.
 */
export function TimelineBar({ p, state, dispatch }: Props) {
  const [mode, setMode] = useState<'idle' | 'recording' | 'playing'>('idle');
  const [audio, setAudio] = useState<string>(p.timeline?.audioMediaId ?? '');
  const start = useRef(0);
  const cues = useRef<{ t: number; seq: number }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const tracks = state.library.media.filter((m) => m.type === 'audio');
  const cursor = state.cursor?.presentationId === p.id ? state.cursor.seq : null;

  // While recording, every slide change of this presentation becomes a cue.
  useEffect(() => {
    if (mode !== 'recording' || cursor == null) return;
    const t = (Date.now() - start.current) / 1000;
    const last = cues.current[cues.current.length - 1];
    if (!last || last.seq !== cursor) cues.current.push({ t: Math.round(t * 10) / 10, seq: cursor });
  }, [cursor, mode]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const record = () => {
    cues.current = [];
    start.current = Date.now();
    setMode('recording');
    if (audio) dispatch({ type: 'audio/play', mediaId: audio });
    dispatch({ type: 'live/go', presentationId: p.id, seq: 0 });
  };

  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (mode === 'recording') dispatch({ type: 'timeline/set', presentationId: p.id, timeline: { audioMediaId: audio || null, cues: cues.current } });
    if (audio) dispatch({ type: 'audio/play', mediaId: null });
    setMode('idle');
  };

  const play = () => {
    const tl = p.timeline;
    if (!tl?.cues.length) return;
    setMode('playing');
    if (tl.audioMediaId) dispatch({ type: 'audio/play', mediaId: tl.audioMediaId });
    timers.current = tl.cues.map((c) => setTimeout(() => dispatch({ type: 'live/go', presentationId: p.id, seq: c.seq }), c.t * 1000));
    const end = tl.cues[tl.cues.length - 1].t * 1000 + 1500;
    timers.current.push(setTimeout(() => setMode('idle'), end));
  };

  return (
    <div className="timeline-bar">
      <span className="muted small">⏱ Timeline</span>
      <select value={audio} disabled={mode !== 'idle'} onChange={(e) => setAudio(e.target.value)} title="Audio track to sync with">
        <option value="">No audio</option>
        {tracks.map((t) => <option key={t.id} value={t.id}>♪ {t.name}</option>)}
      </select>
      {mode === 'idle' && <button onClick={record} title="Start recording: advance slides in time with the song">⏺ Record</button>}
      {mode === 'idle' && <button disabled={!p.timeline?.cues.length} onClick={play}>▶ Play</button>}
      {mode !== 'idle' && <button className="active" onClick={stop}>■ {mode === 'recording' ? 'Stop & save' : 'Stop'}</button>}
      {mode === 'recording' && <span className="small warn">Recording — advance slides with → or clicks</span>}
      {p.timeline?.cues.length ? (
        <span className="muted small truncate">{p.timeline.cues.length} cues · {fmt(p.timeline.cues[p.timeline.cues.length - 1].t)}</span>
      ) : null}
      {p.timeline && mode === 'idle' && <button className="mini-btn" title="Delete timeline" onClick={() => dispatch({ type: 'timeline/set', presentationId: p.id, timeline: undefined })}>✕</button>}
    </div>
  );
}
