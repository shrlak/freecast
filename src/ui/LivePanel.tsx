import { useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { SlideCanvas } from './SlideCanvas';
import { liveCanvasProps } from './liveProps';
import { TimersPanel, PropsPanel } from './TimersProps';
import { MessagesPanel, MacrosPanel } from './MessagesMacros';
import { AudioPanel } from './AudioPanel';
import { desktop } from '../domain/desktop';
import { MarkerEditor, useMarkerTrigger } from './markers';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

/** Open an output/stage window — on its saved display in the desktop app, as a popup in a browser. */
export function openOutput(view: 'output' | 'stage', extra = '', displayId?: number | null) {
  const url = `${location.origin}${location.pathname}?view=${view}${extra}`;
  if (desktop) desktop.openView(url, displayId);
  else window.open(url, `freecast-${view}${extra}`, 'popup,width=960,height=540');
}

/** Slide show output: fullscreen on the connected screen straight away in the desktop app. */
export function presentOutput() {
  if (desktop) desktop.present(`${location.origin}${location.pathname}?view=output`);
  else openOutput('output');
}

const TABS = ['Macros', 'Messages', 'Timers', 'Props', 'Audio'] as const;

export function LivePanel({ state, dispatch }: Props) {
  const { live } = state;
  const [tab, setTab] = useState<(typeof TABS)[number]>('Macros');
  const [vt, setVt] = useState({ t: 0, d: 0 });
  const videoMedia = live.background?.kind === 'media' ? state.library.media.find((m) => m.id === (live.background as { mediaId: string }).mediaId) : undefined;
  const fireMarkers = useMarkerTrigger(videoMedia?.markers, dispatch);
  const onVideoTime = (t: number, d: number) => {
    setVt({ t, d });
    fireMarkers(t);
    // Keep the stage display's video countdown in step (only when it drifts).
    const endsAt = live.video.playing && d ? Date.now() + (d - t) * 1000 : null;
    const cur = live.video.endsAt ?? null;
    if ((endsAt == null) !== (cur == null) || (endsAt != null && cur != null && Math.abs(endsAt - cur) > 1500)) dispatch({ type: 'live/videoClock', endsAt });
  };
  const hasVideo = live.background?.kind === 'media' && live.background.mediaType === 'video';

  return (
    <aside className="panel live-panel">
      <div className="section-head">
        <h2><span className={`dot ${live.slide || live.background ? 'on' : ''}`} /> Live</h2>
        <div className="row gap-xs">
          <button onClick={() => openOutput('output')}>Output ↗</button>
          <button onClick={() => openOutput('stage')}>Stage ↗</button>
        </div>
      </div>

      <SlideCanvas {...liveCanvasProps(live)} onVideoTime={onVideoTime} className="live-preview" />
      <div className="live-meta muted small truncate">
        {live.title ? `${live.title}${live.slide?.group ? ` · ${live.slide.group}` : ''}` : 'Nothing live'}
      </div>

      <div className="layer-bar">
        <button className="clear-all" onClick={() => dispatch({ type: 'live/clearAll' })} title="Clear all (F1)"><span className="ti">✕</span>Clear All</button>
        <button onClick={() => dispatch({ type: 'live/clearText' })} title="Clear slide (F2)"><span className="ti">T</span>Slide</button>
        <button onClick={() => dispatch({ type: 'live/clearBackground' })} title="Clear media (F3)"><span className="ti">▣</span>Media</button>
        <button onClick={() => dispatch({ type: 'prop/clearAll' })} title="Clear props (F4)"><span className="ti">◈</span>Props</button>
        <button onClick={() => dispatch({ type: 'live/message', message: null })} title="Clear messages"><span className="ti">✉</span>Msg</button>
        <button disabled={!live.announcement} onClick={() => dispatch({ type: 'announce/stop' })} title="Stop announcements (F6)"><span className="ti">📣</span>Announce</button>
        <button onClick={() => dispatch({ type: 'audio/play', mediaId: null })} title="Stop audio"><span className="ti">♪</span>Audio</button>
        <button className={live.logo ? 'active' : ''} onClick={() => dispatch({ type: 'live/logo' })} title="Logo (L)"><span className="ti">◆</span>Logo</button>
        <button className={live.black ? 'active' : ''} onClick={() => dispatch({ type: 'live/toggleBlack' })} title="Black (B)"><span className="ti">■</span>Black</button>
      </div>
      {live.announcement && <div className="card card-live small">📣 Announcements: {live.announcement.title}</div>}
      {live.stageMessage && <div className="card small">🎤 Stage: {live.stageMessage} <button className="mini-btn" onClick={() => dispatch({ type: 'live/stageMessage', message: null })}>✕</button></div>}
      <div className="row gap-xs">
        <button className="grow" onClick={() => dispatch({ type: 'live/prev' })}>◀ Prev</button>
        <button className="grow primary" onClick={() => dispatch({ type: 'live/next', now: Date.now() })}>Next ▶</button>
      </div>
      {hasVideo && (
        <div className="row gap-xs">
          <span className="muted small">Video</span>
          <button onClick={() => dispatch({ type: 'live/video', playing: !live.video.playing })}>{live.video.playing ? '❚❚ Pause' : '▶ Play'}</button>
          <button onClick={() => dispatch({ type: 'live/video', restart: true, playing: true })}>⟲</button>
          <input type="range" className="grow" min={0} max={vt.d || 1} step={0.1} value={vt.t} title="Seek"
            onChange={(e) => dispatch({ type: 'live/videoSeek', t: Number(e.target.value) })} />
          <span className="muted small">{Math.floor(vt.t / 60)}:{String(Math.floor(vt.t % 60)).padStart(2, '0')}/{Math.floor(vt.d / 60)}:{String(Math.floor(vt.d % 60)).padStart(2, '0')}</span>
          <label className="check small"><input type="checkbox" checked={live.video.loop !== false} onChange={(e) => dispatch({ type: 'live/videoLoop', on: e.target.checked })} /> loop</label>
        </div>
      )}
      {hasVideo && videoMedia && <MarkerEditor media={videoMedia} t={vt.t} macros={state.library.macros} dispatch={dispatch} />}

      <div className="side-block">
        <h3>Next up</h3>
        <div className="next-text pre">{live.nextText?.replace(/\*\*/g, '') ?? <span className="muted">—</span>}</div>
      </div>

      <div className="tabs">
        {TABS.map((t) => <button key={t} className={t === tab ? 'tab active' : 'tab'} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="tab-body">
        {tab === 'Timers' && <TimersPanel state={state} dispatch={dispatch} />}
        {tab === 'Props' && <PropsPanel state={state} dispatch={dispatch} />}
        {tab === 'Messages' && <MessagesPanel state={state} dispatch={dispatch} />}
        {tab === 'Macros' && <MacrosPanel state={state} dispatch={dispatch} />}
        {tab === 'Audio' && <AudioPanel state={state} dispatch={dispatch} />}
      </div>
    </aside>
  );
}
