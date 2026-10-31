import { useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Macro, MacroStep } from '../domain/types';
import { uid } from '../domain/lyrics';
import { parseChannels } from '../domain/effects';
import { describeX32Step } from '../domain/x32';
import { X32StepPicker } from './X32StepPicker';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const tokens = (template: string) => [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

export function MessagesPanel({ state, dispatch }: Props) {
  const { messageTemplates } = state.library;
  const [id, setId] = useState(messageTemplates[0]?.id ?? '');
  const [values, setValues] = useState<Record<string, string>>({});
  const tpl = messageTemplates.find((t) => t.id === id);
  const filled = tpl ? tpl.template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '') : '';
  return (
    <div className="stack">
      <div className="row gap-xs">
        <select className="grow" value={id} onChange={(e) => setId(e.target.value)}>
          {messageTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button className="mini-btn" title="New template" onClick={() => {
          const template = prompt('Template text — use {name} for blanks', 'Parent of #{number}, please come to the nursery');
          if (!template) return;
          const t = { id: uid('msg'), name: template.slice(0, 24), template };
          dispatch({ type: 'template/upsert', template: t });
          setId(t.id);
        }}>＋</button>
        {tpl && <button className="mini-btn" title="Delete template" onClick={() => dispatch({ type: 'template/delete', id: tpl.id })}>✕</button>}
      </div>
      {tpl && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'live/message', message: filled }); }}>
          {tokens(tpl.template).map((k) => (
            <label key={k} className="field-inline">{k}<input className="grow" value={values[k] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} /></label>
          ))}
          <div className="muted small">Preview: {filled || '—'}</div>
          <div className="row gap-xs">
            <button type="submit" className="primary grow">Show</button>
            <button type="button" disabled={!state.live.message} onClick={() => dispatch({ type: 'live/message', message: null })}>Hide</button>
          </div>
        </form>
      )}
      {state.live.message && <div className="card card-live small">On screen: {state.live.message}</div>}
      <label className="check small"><input type="checkbox" checked={state.live.messageScroll} onChange={(e) => dispatch({ type: 'live/messageScroll', on: e.target.checked })} /> Scroll as ticker</label>
      <StageMessage state={state} dispatch={dispatch} />
    </div>
  );
}

/** Message only the band / speaker see on the stage display. */
function StageMessage({ state, dispatch }: Props) {
  const [text, setText] = useState('');
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'live/stageMessage', message: text }); }}>
      <span className="muted small">🎤 Stage message (stage displays only)</span>
      <div className="row gap-xs">
        <input className="grow" placeholder="e.g. 2 minutes left · repeat chorus" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit">Send</button>
        <button type="button" disabled={!state.live.stageMessage} onClick={() => dispatch({ type: 'live/stageMessage', message: null })}>Clear</button>
      </div>
    </form>
  );
}

function describe(step: MacroStep, state: AppState): string {
  const pres = (id: string) => state.library.presentations.find((p) => p.id === id)?.title ?? '?';
  switch (step.type) {
    case 'go': return `Go to ${pres(step.presentationId)} #${step.index + 1}`;
    case 'timer': return `${step.op} timer ${state.library.timers.find((t) => t.id === step.timerId)?.name ?? '?'}`;
    case 'prop': return `${step.on ? 'Show' : 'Hide'} prop ${state.library.props.find((p) => p.id === step.propId)?.name ?? '?'}`;
    case 'background': return step.background ? 'Set background' : 'Clear background';
    case 'message': return step.text ? `Message “${step.text}”` : 'Hide message';
    case 'audio': return step.mediaId ? `Play ${state.library.media.find((m) => m.id === step.mediaId)?.name ?? 'audio'}` : 'Stop audio';
    case 'black': return step.on ? 'Black on' : 'Black off';
    case 'dmx': return `DMX u${step.universe}: ${Object.entries(step.channels).map(([c, v]) => `${c}=${v}`).join(', ')}`;
    case 'x32': return describeX32Step(step);
    case 'logo': return step.on ? 'Logo on' : 'Logo off';
    case 'stageMessage': return step.text ? `Stage message “${step.text}”` : 'Clear stage message';
    case 'announce': return step.presentationId ? 'Start announcements' : 'Stop announcements';
    default: return step.type.replace(/([A-Z])/g, ' $1').toLowerCase();
  }
}

/** Captures the current live look (background, props, selected slide) as macro steps. */
function snapshot(state: AppState): MacroStep[] {
  const steps: MacroStep[] = [{ type: 'clearProps' }, { type: 'background', background: state.live.background }];
  for (const id of state.live.activeProps) steps.push({ type: 'prop', propId: id, on: true });
  if (state.cursor) steps.push({ type: 'go', presentationId: state.cursor.presentationId, index: state.cursor.seq });
  else steps.push({ type: 'clearText' });
  return steps;
}

export function MacrosPanel({ state, dispatch }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const { macros } = state.library;
  const save = (m: Macro) => dispatch({ type: 'macro/upsert', macro: m });
  return (
    <div className="stack">
      <div className="macro-grid">
        {macros.map((m) => (
          <button key={m.id} className="macro" style={{ background: m.color }} onClick={() => dispatch({ type: 'macro/run', id: m.id, now: Date.now() })}
            onContextMenu={(e) => { e.preventDefault(); setEditing(editing === m.id ? null : m.id); }} title="Click to run · right-click to edit">
            {m.name}
          </button>
        ))}
      </div>
      <button onClick={() => {
        const name = prompt('Macro name (captures the current background, props and slide)', 'My look');
        if (name) save({ id: uid('macro'), name, color: '#0891b2', steps: snapshot(state) });
      }}>＋ Macro from current look</button>
      {editing && (() => {
        const m = macros.find((x) => x.id === editing);
        if (!m) return null;
        return (
          <div className="card">
            <div className="row gap-xs">
              <input className="grow plain" value={m.name} onChange={(e) => save({ ...m, name: e.target.value })} />
              <input type="color" value={m.color} onChange={(e) => save({ ...m, color: e.target.value })} />
            </div>
            <ol className="steps">
              {m.steps.map((s, i) => (
                <li key={i}>{describe(s, state)} <button className="mini-btn" onClick={() => save({ ...m, steps: m.steps.filter((_, k) => k !== i) })}>✕</button></li>
              ))}
            </ol>
            <div className="row gap-xs wrap">
              <select value="" onChange={(e) => {
                const v = e.target.value;
                const add: Record<string, MacroStep> = {
                  clearAll: { type: 'clearAll' }, clearText: { type: 'clearText' }, clearBackground: { type: 'clearBackground' }, clearProps: { type: 'clearProps' },
                  black: { type: 'black', on: true }, look: { type: 'background', background: state.live.background },
                  stopAudio: { type: 'audio', mediaId: null },
                };
                if (add[v]) save({ ...m, steps: [...m.steps, add[v]] });
                else if (v === 'dmx') {
                  const uni = Number(prompt('DMX universe (0 = first)', '0') ?? 'x');
                  const ch = parseChannels(prompt('Channels, e.g. 1=255, 2=128, 3=0') ?? '');
                  if (Number.isInteger(uni) && Object.keys(ch).length) save({ ...m, steps: [...m.steps, { type: 'dmx', universe: uni, channels: ch }] });
                }
              }}>
                <option value="">Add step…</option>
                <option value="clearAll">Clear all</option><option value="clearText">Clear text</option>
                <option value="clearBackground">Clear background</option><option value="clearProps">Clear props</option>
                <option value="black">Black screen</option><option value="look">Set current background</option><option value="stopAudio">Stop audio</option>
                <option value="dmx">DMX lighting…</option>
              </select>
              <button onClick={() => save({ ...m, steps: snapshot(state) })}>Re-capture look</button>
              <button className="danger" onClick={() => { dispatch({ type: 'macro/delete', id: m.id }); setEditing(null); }}>Delete</button>
            </div>
            <X32StepPicker onAdd={(step) => save({ ...m, steps: [...m.steps, step] })} />
          </div>
        );
      })()}
    </div>
  );
}
