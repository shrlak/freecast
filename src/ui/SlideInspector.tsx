import type { Background, Library, MediaMeta, Slide, SlideAction, TransitionKind } from '../domain/types';
import { parseChannels } from '../domain/effects';
import { obs } from '../domain/obs';
import { AutoTextarea } from './AutoTextarea';

interface Props {
  slide: Slide;
  library: Library;
  onChange: (patch: Partial<Omit<Slide, 'id'>>) => void;
  onDesign: () => void;
  onClose: () => void;
  /** Inside the PowerPoint Format pane: skip the fields it already shows (text, background). */
  compact?: boolean;
}

function describe(a: SlideAction, lib: Library): string {
  const name = (list: { id: string; name?: string; title?: string }[], id: string | null | undefined) =>
    list.find((x) => x.id === id)?.name ?? list.find((x) => x.id === id)?.title ?? '?';
  switch (a.type) {
    case 'runMacro': return `Run macro “${name(lib.macros, a.macroId)}”`;
    case 'background': return a.background ? 'Set background' : 'Clear background';
    case 'audio': return a.mediaId ? `Play ${name(lib.media, a.mediaId)}` : 'Stop audio';
    case 'timer': return `${a.op} timer “${name(lib.timers, a.timerId)}”`;
    case 'prop': return `${a.on ? 'Show' : 'Hide'} prop “${name(lib.props, a.propId)}”`;
    case 'stageMessage': return a.text ? `Stage message “${a.text}”` : 'Clear stage message';
    case 'message': return a.text ? `Message “${a.text}”` : 'Hide message';
    case 'announce': return a.presentationId ? `Start announcements “${name(lib.presentations, a.presentationId)}”` : 'Stop announcements';
    case 'logo': return a.on ? 'Show logo' : 'Hide logo';
    case 'black': return a.on ? 'Black screen' : 'Black off';
    case 'obs': return a.action === 'scene' ? `OBS scene “${a.scene}”` : `OBS ${a.action}`;
    case 'dmx': return `DMX u${a.universe}: ${Object.entries(a.channels).map(([c, v]) => `${c}=${v}`).join(', ')}`;
    default: return a.type.replace(/([A-Z])/g, ' $1').toLowerCase();
  }
}

/** Per-slide settings: text, notes, actions, timing, hotkey, transition, background, QR links. */
export function SlideInspector({ slide, library: lib, onChange, onDesign, onClose, compact }: Props) {
  const bgValue = slide.background?.kind === 'media' ? slide.background.mediaId : '';
  const visual = lib.media.filter((m) => m.type !== 'audio');
  const actions = slide.actions ?? [];
  const setActions = (next: SlideAction[]) => onChange({ actions: next.length ? next : undefined });

  const addAction = (value: string) => {
    const [kind, id] = value.split(':');
    let a: SlideAction | null = null;
    if (kind === 'macro') a = { type: 'runMacro', macroId: id };
    else if (kind === 'bg') {
      const m = visual.find((x) => x.id === id) as MediaMeta | undefined;
      a = { type: 'background', background: m ? { kind: 'media', mediaId: m.id, mediaType: m.type === 'video' ? 'video' : 'image' } : null };
    } else if (kind === 'audio') a = { type: 'audio', mediaId: id || null };
    else if (kind === 'timer') a = { type: 'timer', timerId: id, op: 'start' };
    else if (kind === 'timerReset') a = { type: 'timer', timerId: id, op: 'reset' };
    else if (kind === 'propOn') a = { type: 'prop', propId: id, on: true };
    else if (kind === 'propOff') a = { type: 'prop', propId: id, on: false };
    else if (kind === 'clearProps') a = { type: 'clearProps' };
    else if (kind === 'announce') a = { type: 'announce', presentationId: id || null };
    else if (kind === 'logo') a = { type: 'logo', on: id === 'on' };
    else if (kind === 'stage') {
      const text = prompt('Stage message (shown to the band/speaker only)');
      if (text) a = { type: 'stageMessage', text };
    } else if (kind === 'obs') {
      a = id === 'startStream' || id === 'stopStream' ? { type: 'obs', action: id } : { type: 'obs', action: 'scene', scene: id };
    } else if (kind === 'dmx') {
      const uni = Number(prompt('DMX universe (0 = first)', '0') ?? 'x');
      const ch = parseChannels(prompt('Channels, e.g. 1=255, 2=128') ?? '');
      if (Number.isInteger(uni) && Object.keys(ch).length) a = { type: 'dmx', universe: uni, channels: ch };
    } else if (kind === 'message') {
      const text = prompt('Audience message');
      if (text) a = { type: 'message', text };
    }
    if (a) setActions([...actions, a]);
  };

  return (
    <div className="inspector">
      {!compact && (
        <>
      <div className="section-head">
        <h2>Slide · {slide.group || 'Slide'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <button className="primary" onClick={onDesign}>✎ Open slide editor ({slide.elements?.length ?? 0} objects)</button>
      <label>Heading<input value={slide.title ?? ''} onChange={(e) => onChange({ title: e.target.value || undefined })} /></label>
      <label>Text <span className="muted small">— chords inline like [G]Amazing [C]grace (stage only)</span><AutoTextarea rows={4} value={slide.text} onChange={(e) => onChange({ text: e.target.value })} /></label>
      <label>Second line (translation)<AutoTextarea rows={3} value={slide.subtext ?? ''} onChange={(e) => onChange({ subtext: e.target.value || undefined })} /></label>
        </>
      )}
      <label>Corner caption<input value={slide.caption ?? ''} placeholder="한글 제목 | English Title" onChange={(e) => onChange({ caption: e.target.value || undefined })} /></label>
      <div className="form-grid">
        <label>Group<input value={slide.group} onChange={(e) => onChange({ group: e.target.value })} /></label>
        <label>Label<input value={slide.label ?? ''} onChange={(e) => onChange({ label: e.target.value || undefined })} /></label>
        <label>Auto-advance (sec)<input type="number" min={0} value={slide.autoAdvance ?? ''} onChange={(e) => onChange({ autoAdvance: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} /></label>
        <label>Hotkey<input maxLength={1} value={slide.hotkey ?? ''} placeholder="e.g. c" onChange={(e) => onChange({ hotkey: e.target.value.toLowerCase() || undefined })} /></label>
        <label className="span2">Transition
          <select value={slide.transition?.kind ?? ''} onChange={(e) => onChange({ transition: e.target.value ? { kind: e.target.value as TransitionKind, duration: slide.transition?.duration ?? 1 } : undefined })}>
            <option value="">Presentation default</option>
            <option value="cut">Cut</option><option value="fade">Fade</option><option value="slide">Slide</option><option value="zoom">Zoom</option>
          </select>
        </label>
      </div>
      <div className="stack">
        <span className="muted small">Slide actions (run when this slide goes live)</span>
        {actions.map((a, i) => (
          <div key={i} className="action-row">
            <span className="grow">⚡ {describe(a, lib)}</span>
            <button className="mini-btn" onClick={() => setActions(actions.filter((_, k) => k !== i))}>✕</button>
          </div>
        ))}
        <select value="" onChange={(e) => e.target.value && addAction(e.target.value)}>
          <option value="">＋ Add action…</option>
          <optgroup label="Macros">{lib.macros.map((m) => <option key={m.id} value={`macro:${m.id}`}>Run “{m.name}”</option>)}</optgroup>
          <optgroup label="Media">
            {visual.map((m) => <option key={m.id} value={`bg:${m.id}`}>Background: {m.name}</option>)}
            {lib.media.filter((m) => m.type === 'audio').map((m) => <option key={m.id} value={`audio:${m.id}`}>Play: {m.name}</option>)}
            <option value="audio:">Stop audio</option>
          </optgroup>
          <optgroup label="Timers">
            {lib.timers.map((t) => <option key={t.id} value={`timer:${t.id}`}>Start “{t.name}”</option>)}
            {lib.timers.map((t) => <option key={`r${t.id}`} value={`timerReset:${t.id}`}>Reset “{t.name}”</option>)}
          </optgroup>
          <optgroup label="Props">
            {lib.props.map((p) => <option key={p.id} value={`propOn:${p.id}`}>Show “{p.name}”</option>)}
            {lib.props.map((p) => <option key={`o${p.id}`} value={`propOff:${p.id}`}>Hide “{p.name}”</option>)}
            <option value="clearProps">Clear all props</option>
          </optgroup>
          <optgroup label="Layers">
            {lib.presentations.filter((p) => p.loop).map((p) => <option key={p.id} value={`announce:${p.id}`}>Announcements: {p.title}</option>)}
            <option value="announce:">Stop announcements</option>
            <option value="logo:on">Show logo</option><option value="logo:off">Hide logo</option>
            <option value="stage:">Stage message…</option><option value="message:">Audience message…</option>
          </optgroup>
          <optgroup label="OBS & lighting">
            {obs.state.scenes.map((sc) => <option key={sc} value={`obs:${sc}`}>OBS scene: {sc}</option>)}
            <option value="obs:startStream">OBS start stream</option><option value="obs:stopStream">OBS stop stream</option>
            <option value="dmx:">DMX lighting…</option>
          </optgroup>
        </select>
      </div>
      <label>Stage notes<AutoTextarea rows={3} value={slide.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} /></label>
      <label>QR links (one per line)<AutoTextarea rows={2} value={(slide.qr ?? []).join('\n')} onChange={(e) => {
        const qr = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
        onChange({ qr: qr.length ? qr : undefined });
      }} /></label>
      {!compact && (
      <label>Background
        <select value={bgValue} onChange={(e) => {
          const m = visual.find((x) => x.id === e.target.value);
          const bg: Background | undefined = m ? { kind: 'media', mediaId: m.id, mediaType: m.type === 'video' ? 'video' : 'image', fit: 'contain' } : undefined;
          onChange({ background: bg });
        }}>
          <option value="">Presentation / live background</option>
          {visual.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      )}
      <label className="check"><input type="checkbox" checked={!!slide.disabled} onChange={(e) => onChange({ disabled: e.target.checked || undefined })} /> Skip this slide when advancing</label>
    </div>
  );
}
