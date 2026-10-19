import type { Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Prop, PropKind, PropPosition, Timer, TimerKind } from '../domain/types';
import { formatClock, timerValue } from '../domain/timers';
import { uid } from '../domain/lyrics';
import { useNow } from './hooks';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

export function TimersPanel({ state, dispatch }: Props) {
  const now = useNow(250);
  const { timers } = state.library;
  const update = (t: Timer, patch: Partial<Timer>) => dispatch({ type: 'timer/upsert', timer: { ...t, ...patch } });
  return (
    <div className="stack">
      {timers.map((t) => {
        const v = timerValue(t, now);
        return (
          <div key={t.id} className="card">
            <div className="row gap-xs">
              <input className="grow plain" value={t.name} onChange={(e) => update(t, { name: e.target.value })} />
              <span className={`timer ${v < 0 && t.kind !== 'elapsed' ? 'over' : ''}`}>{formatClock(v)}</span>
            </div>
            <div className="row gap-xs wrap">
              <select value={t.kind} onChange={(e) => update(t, { kind: e.target.value as TimerKind })}>
                <option value="countdown">Countdown</option>
                <option value="countdownTo">Count down to time</option>
                <option value="elapsed">Stopwatch</option>
              </select>
              {t.kind === 'countdown' && (
                <input type="number" min={0} style={{ width: 64 }} value={Math.round(t.durationMs / 60000)} title="minutes"
                  onChange={(e) => update(t, { durationMs: Math.max(0, Number(e.target.value)) * 60000 })} />
              )}
              {t.kind === 'countdownTo' && <input type="time" value={t.target} onChange={(e) => update(t, { target: e.target.value })} />}
              {t.kind !== 'countdownTo' && (
                <>
                  <button onClick={() => dispatch({ type: 'timer/op', id: t.id, op: t.running ? 'stop' : 'start', now: Date.now() })}>{t.running ? '❚❚' : '▶'}</button>
                  <button onClick={() => dispatch({ type: 'timer/op', id: t.id, op: 'reset', now: Date.now() })}>⟲</button>
                </>
              )}
              <button className={state.live.outputTimerId === t.id ? 'active' : ''} title="Show full-screen on the audience output"
                onClick={() => dispatch({ type: 'live/outputTimer', id: state.live.outputTimerId === t.id ? null : t.id })}>On screen</button>
              <button className="mini-btn" title="Delete" onClick={() => dispatch({ type: 'timer/delete', id: t.id })}>✕</button>
            </div>
          </div>
        );
      })}
      <button onClick={() => dispatch({ type: 'timer/upsert', timer: { id: uid('timer'), name: 'Timer', kind: 'countdown', durationMs: 5 * 60000, target: '10:00', running: false, startedAt: null, accumulatedMs: 0 } })}>＋ Timer</button>
      <p className="hint">Running timers always show on the stage display.</p>
      <Schedules state={state} dispatch={dispatch} />
    </div>
  );
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** Run a macro automatically at a time on chosen weekdays (e.g. pre-service loop at 10:45 every Sunday). */
function Schedules({ state, dispatch }: Props) {
  const { schedules, macros } = state.library;
  return (
    <div className="stack">
      <span className="muted small">⏰ Schedule (runs a macro at a set time)</span>
      {schedules.map((sc) => {
        const up = (patch: Partial<typeof sc>) => dispatch({ type: 'schedule/upsert', schedule: { ...sc, ...patch } });
        return (
          <div key={sc.id} className="card">
            <div className="row gap-xs wrap">
              <input type="checkbox" checked={sc.enabled} onChange={(e) => up({ enabled: e.target.checked })} />
              <input type="time" value={sc.time} onChange={(e) => up({ time: e.target.value })} />
              <select className="grow" value={sc.macroId} onChange={(e) => up({ macroId: e.target.value, name: macros.find((m) => m.id === e.target.value)?.name ?? sc.name })}>
                {macros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button className="mini-btn" onClick={() => dispatch({ type: 'schedule/delete', id: sc.id })}>✕</button>
            </div>
            <div className="row gap-xs">
              {DAYS.map((d, i) => (
                <button key={d} className={`mini-btn ${sc.days.includes(i) ? 'active' : ''}`}
                  onClick={() => up({ days: sc.days.includes(i) ? sc.days.filter((x) => x !== i) : [...sc.days, i] })}>{d}</button>
              ))}
            </div>
          </div>
        );
      })}
      <button disabled={!macros.length} onClick={() => dispatch({ type: 'schedule/upsert', schedule: { id: uid('sch'), name: macros[0]?.name ?? '', macroId: macros[0]?.id ?? '', time: '10:45', days: [0], enabled: true } })}>＋ Schedule</button>
    </div>
  );
}

const POSITIONS: PropPosition[] = ['top-left', 'top', 'top-right', 'center', 'bottom-left', 'bottom', 'bottom-right', 'full'];

export function PropsPanel({ state, dispatch }: Props) {
  const { props, timers, media } = state.library;
  const active = state.live.activeProps;
  const update = (p: Prop, patch: Partial<Prop>) => dispatch({ type: 'prop/upsert', prop: { ...p, ...patch } });
  return (
    <div className="stack">
      {props.map((p) => (
        <div key={p.id} className={`card ${active.includes(p.id) ? 'card-live' : ''}`}>
          <div className="row gap-xs">
            <button className={active.includes(p.id) ? 'active' : ''} onClick={() => dispatch({ type: 'prop/toggle', id: p.id })}>{active.includes(p.id) ? 'On' : 'Off'}</button>
            <input className="grow plain" value={p.name} onChange={(e) => update(p, { name: e.target.value })} />
            <button className="mini-btn" title="Delete" onClick={() => dispatch({ type: 'prop/delete', id: p.id })}>✕</button>
          </div>
          <details>
            <summary className="muted small">{p.kind} · {p.position}</summary>
            <div className="form-grid">
              <label>Type
                <select value={p.kind} onChange={(e) => update(p, { kind: e.target.value as PropKind })}>
                  <option value="text">Text</option><option value="image">Image / logo</option><option value="clock">Clock</option><option value="timer">Timer</option>
                </select>
              </label>
              <label>Position
                <select value={p.position} onChange={(e) => update(p, { position: e.target.value as PropPosition })}>
                  {POSITIONS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              {p.kind === 'text' && <label className="span2">Text<input value={p.text ?? ''} onChange={(e) => update(p, { text: e.target.value })} /></label>}
              {p.kind === 'image' && (
                <label className="span2">Image
                  <select value={p.mediaId ?? ''} onChange={(e) => update(p, { mediaId: e.target.value })}>
                    <option value="">Choose from media bin…</option>
                    {media.filter((m) => m.type === 'image').map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
              )}
              {p.kind === 'timer' && (
                <label className="span2">Timer
                  <select value={p.timerId ?? ''} onChange={(e) => update(p, { timerId: e.target.value })}>
                    {timers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              )}
              <label>Size<input type="number" min={10} max={400} value={p.size} onChange={(e) => update(p, { size: Number(e.target.value) })} /></label>
              <label>Colour<input type="color" value={p.color} onChange={(e) => update(p, { color: e.target.value })} /></label>
            </div>
          </details>
        </div>
      ))}
      <button onClick={() => dispatch({ type: 'prop/upsert', prop: { id: uid('prop'), name: 'New prop', kind: 'text', text: 'Text', position: 'bottom-right', size: 36, color: '#ffffff', background: 'rgba(0,0,0,.45)' } })}>＋ Prop</button>
    </div>
  );
}
