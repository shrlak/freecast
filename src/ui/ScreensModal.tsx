import type { Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Screen, ScreenLayers } from '../domain/types';
import { uid } from '../domain/lyrics';
import { openOutput } from './LivePanel';
import { DesktopSettings } from './DesktopSettings';
import { desktop } from '../domain/desktop';
import { contentServer, DEFAULT_SERVER, setContentServer } from '../domain/online';
import { dmxSettings, saveDmxSettings, sendDmx } from '../domain/effects';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  relayConnected: boolean;
  midi: boolean;
  onMidi: (on: boolean) => void;
  onClose: () => void;
}

const LAYERS: (keyof ScreenLayers)[] = ['background', 'slide', 'announcements', 'props', 'messages', 'timer'];

/** Outputs (screens), stage display layouts, remote control and MIDI. */
export function ScreensModal({ state, dispatch, relayConnected, midi, onMidi, onClose }: Props) {
  const { screens, themes } = state.library;
  const save = (s: Screen) => dispatch({ type: 'screen/upsert', screen: s });
  const base = `${location.origin}${location.pathname}`;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Screens">
        <header className="modal-head">
          <h2>Screens, stage & remote</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="screens-body">
          <section>
            <h3>Output screens</h3>
            <p className="hint">Each screen is its own window: drag it to a projector, TV or a second monitor and press F for fullscreen. A livestream screen on chroma green (or transparent, for an OBS browser source) carries only the lyrics.</p>
            {screens.map((s) => (
              <div key={s.id} className="card">
                <div className="row gap-xs wrap">
                  <input className="plain grow" value={s.name} onChange={(e) => save({ ...s, name: e.target.value })} />
                  <select value={s.themeId ?? ''} onChange={(e) => save({ ...s, themeId: e.target.value || null })} title="Theme override">
                    <option value="">Presentation theme</option>
                    {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={s.key} onChange={(e) => save({ ...s, key: e.target.value as Screen['key'] })} title="Empty areas">
                    <option value="black">Black</option><option value="green">Chroma green</option><option value="transparent">Transparent</option><option value="matte">Key (matte)</option>
                  </select>
                  <button onClick={() => openOutput('output', `&screen=${s.id}`)}>Open ↗</button>
                  <button className="mini-btn" disabled={screens.length <= 1} onClick={() => dispatch({ type: 'screen/delete', id: s.id })}>✕</button>
                </div>
                <div className="row gap-s wrap small">
                  {LAYERS.map((l) => (
                    <label key={l} className="check"><input type="checkbox" checked={s.layers[l] ?? true} onChange={(e) => save({ ...s, layers: { ...s.layers, [l]: e.target.checked } })} /> {l}</label>
                  ))}
                </div>
                <div className="row gap-s wrap small">
                  <span className="muted">Mask</span>
                  <select value={s.mask?.kind ?? 'none'} onChange={(e) => save({ ...s, mask: { kind: e.target.value as 'none' | 'rect' | 'oval', inset: s.mask?.inset ?? 60 } })}>
                    <option value="none">None</option><option value="rect">Rectangle</option><option value="oval">Oval</option>
                  </select>
                  <span className="muted">Edge blend</span>
                  <select value={s.edge?.part ?? 'none'} onChange={(e) => save({ ...s, edge: { part: e.target.value as 'none' | 'left' | 'right', overlap: s.edge?.overlap ?? 200 } })}>
                    <option value="none">Off</option><option value="left">Left projector</option><option value="right">Right projector</option>
                  </select>
                  {s.edge && s.edge.part !== 'none' && (
                    <label className="field-inline">overlap <input type="range" min={40} max={600} step={10} value={s.edge.overlap} onChange={(e) => save({ ...s, edge: { ...s.edge!, overlap: Number(e.target.value) } })} /> {s.edge.overlap}px</label>
                  )}
                  {s.mask && s.mask.kind !== 'none' && (
                    <label className="field-inline">inset <input type="range" min={0} max={400} value={s.mask.inset} onChange={(e) => save({ ...s, mask: { ...s.mask!, inset: Number(e.target.value) } })} /> {s.mask.inset}px</label>
                  )}
                </div>
                <code className="small selectable">{base}?view=output&screen={s.id}</code>
              </div>
            ))}
            <div className="row gap-xs wrap">
              <button onClick={() => save({ id: uid('screen'), name: 'New screen', themeId: null, key: 'black', layers: { background: true, slide: true, props: true, messages: true, timer: true } })}>＋ Screen</button>
              <button onClick={() => window.open(`${base}?view=multiview`, 'freecast-multiview', 'popup,width=1280,height=760')}>Operator multiview ↗</button>
            </div>
            <p className="hint">Key (matte) + a normal screen = separate key and fill outputs for a video switcher.</p>
            <h3>Looks</h3>
            <p className="hint">A Look remembers which layers every screen shows. Save the current setup, then switch with one click.</p>
            <div className="row gap-xs wrap">
              {state.library.looks.map((l) => (
                <span key={l.id} className="look-chip">
                  <button onClick={() => dispatch({ type: 'look/apply', id: l.id })}>{l.name}</button>
                  <button className="mini-btn" onClick={() => dispatch({ type: 'look/delete', id: l.id })}>✕</button>
                </span>
              ))}
              <button onClick={() => {
                const name = prompt('Look name', 'Worship');
                if (name) dispatch({ type: 'look/save', look: { id: uid('look'), name, screens: Object.fromEntries(screens.map((sc) => [sc.id, { ...sc.layers }])) } });
              }}>＋ Save current as Look</button>
            </div>
          </section>
          <section>
            {desktop && <DesktopSettings screens={screens} />}
            <h3>Stage display layouts</h3>
            {state.library.stageLayouts.map((l) => {
              const up = (patch: Partial<typeof l>) => dispatch({ type: 'stageLayout/upsert', layout: { ...l, ...patch } });
              const flags: [keyof typeof l, string][] = [['clock', 'Clock'], ['timers', 'Timers'], ['current', 'Current'], ['next', 'Next'], ['notes', 'Notes'], ['preview', 'Live preview'], ['chords', 'Chords'], ['videoCountdown', 'Video countdown']];
              return (
                <div key={l.id} className="card">
                  <div className="row gap-xs">
                    <input className="plain grow" value={l.name} onChange={(e) => up({ name: e.target.value })} />
                    <label className="field-inline small">size <input type="range" min={0.6} max={2} step={0.1} value={l.scale} onChange={(e) => up({ scale: Number(e.target.value) })} /></label>
                    <button onClick={() => openOutput('stage', `&layout=${l.id}`)}>Open ↗</button>
                    <button className="mini-btn" onClick={() => dispatch({ type: 'stageLayout/delete', id: l.id })}>✕</button>
                  </div>
                  <div className="row gap-s wrap small">
                    {flags.map(([k, label]) => <label key={k} className="check"><input type="checkbox" checked={!!l[k]} onChange={(e) => up({ [k]: e.target.checked } as Partial<typeof l>)} /> {label}</label>)}
                  </div>
                </div>
              );
            })}
            <button onClick={() => dispatch({ type: 'stageLayout/upsert', layout: { id: uid('stage'), name: 'Custom', clock: true, timers: true, current: true, next: true, notes: false, preview: false, chords: true, videoCountdown: true, scale: 1 } })}>＋ Stage layout</button>
            {!desktop && <>
            <h3>Remote control & other devices</h3>
            <p className="hint">
              <span className={`dot ${relayConnected ? 'on' : ''}`} /> {relayConnected ? 'Network relay connected.' : 'Network relay offline — start FreeCast with npm run dev or npm start.'}
              {' '}On a phone or tablet on the same Wi-Fi, open this computer's address with <code>?view=remote</code> (control), <code>?view=stage</code> or <code>?view=output</code>. Set <code>FREECAST_REMOTE_PIN</code> to require a PIN.
            </p>
            <code className="small selectable">{base}?view=remote</code>
            <p className="hint">🎤 목사님 태블릿(무대 화면 + 조작): <code className="small selectable">{base}?view=remote&amp;mode=stage</code> — 리모컨과 같은 연결·PIN·조작권을 씁니다.</p>
            </>}
            <h3>Online library server</h3>
            <p className="hint">Songs (library.json) and Bibles (bible-text/*.json) are read from this address every session.</p>
            <form className="row gap-xs" onSubmit={(e) => {
              e.preventDefault();
              const v = (new FormData(e.currentTarget).get('server') as string) ?? '';
              try {
                setContentServer(v === DEFAULT_SERVER ? null : v);
                if (confirm('Server saved. Reload FreeCast now to use it?')) location.reload();
              } catch (err) {
                alert((err as Error).message);
              }
            }}>
              <input name="server" className="grow" defaultValue={contentServer()} />
              <button type="submit">Save</button>
              <button type="button" onClick={() => { setContentServer(null); location.reload(); }}>Default</button>
            </form>
            <h3>DMX lighting (Art-Net)</h3>
            <p className="hint">Macros and slide actions can set DMX channels. Enter your Art-Net node or lighting console's IP (255.255.255.255 = broadcast).</p>
            <div className="row gap-xs">
              <input className="grow" defaultValue={dmxSettings().ip} onBlur={(e) => saveDmxSettings({ ip: e.target.value.trim() || '255.255.255.255' })} />
              <button onClick={() => sendDmx(0, { 1: 255 })}>Test ch1 full</button>
              <button onClick={() => sendDmx(0, { 1: 0 })}>ch1 off</button>
            </div>
            <h3>MIDI control</h3>
            <label className="check"><input type="checkbox" checked={midi} onChange={(e) => onMidi(e.target.checked)} /> Listen to MIDI controllers</label>
            <p className="hint">Note 60 (C4) next · 59 previous · 58 clear all · 57 clear text · 56 black · notes 36–51 run macros 1–16 · any CC above 64 on CC 64 = next.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
