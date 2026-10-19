import { useEffect, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { obs, obsSettings, saveObsSettings, runObsStep } from '../domain/obs';
import { useObs } from './useObs';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
}

/** Connect to OBS Studio, switch scenes, start/stop the livestream, and get the lyrics-overlay URL. */
export function ObsPanel({ state, dispatch }: Props) {
  const o = useObs();
  const [cfg, setCfg] = useState(obsSettings);
  const [copied, setCopied] = useState<string | null>(null);
  const save = (next: typeof cfg) => {
    setCfg(next);
    saveObsSettings(next);
  };
  useEffect(() => {
    if (cfg.auto && obs.state.status === 'disconnected') obs.connect(cfg.url, cfg.password);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const base = `${location.origin}${location.pathname}`;
  const copy = (url: string) => {
    navigator.clipboard?.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="stack">
      <div className="row gap-xs">
        <span className={`dot ${o.status === 'connected' ? 'on' : ''}`} />
        <strong className="grow">OBS {o.status === 'connected' ? 'connected' : o.status === 'connecting' ? 'connecting…' : 'not connected'}</strong>
        {o.status === 'connected'
          ? <button onClick={() => obs.disconnect()}>Disconnect</button>
          : <button className="primary" onClick={() => obs.connect(cfg.url, cfg.password)}>Connect</button>}
      </div>
      {o.error && <div className="warn small">{o.error}</div>}
      {o.status !== 'connected' && (
        <div className="stack">
          <input value={cfg.url} onChange={(e) => save({ ...cfg, url: e.target.value })} placeholder="ws://127.0.0.1:4455" />
          <input type="password" value={cfg.password} onChange={(e) => save({ ...cfg, password: e.target.value })} placeholder="OBS WebSocket password" />
          <label className="check small"><input type="checkbox" checked={cfg.auto} onChange={(e) => save({ ...cfg, auto: e.target.checked })} /> Connect automatically</label>
          <p className="hint">In OBS: Tools → WebSocket Server Settings → Enable, then copy the password here.</p>
        </div>
      )}
      {o.status === 'connected' && (
        <>
          <div className="row gap-xs">
            <button className={`grow ${o.streaming ? 'active' : ''}`} onClick={() => runObsStep(o.streaming ? 'stopStream' : 'startStream')}>{o.streaming ? '■ Stop stream' : '● Start stream'}</button>
            <button className={`grow ${o.recording ? 'active' : ''}`} onClick={() => runObsStep(o.recording ? 'stopRecord' : 'startRecord')}>{o.recording ? '■ Stop rec' : '● Record'}</button>
          </div>
          <span className="muted small">Scenes</span>
          <div className="macro-grid">
            {o.scenes.map((sc) => (
              <button key={sc} className={`obs-scene ${sc === o.current ? 'live' : ''}`} onClick={() => obs.setScene(sc)}>{sc}</button>
            ))}
          </div>
          <button onClick={() => {
            const name = prompt('Macro name', o.current ? `OBS: ${o.current}` : 'OBS scene');
            if (name && o.current) dispatch({ type: 'macro/upsert', macro: { id: `macro_obs_${Date.now()}`, name, color: '#7c3aed', steps: [{ type: 'obs', action: 'scene', scene: o.current }] } });
          }}>＋ Macro for current scene</button>
        </>
      )}
      <span className="muted small">Lyrics in OBS — add a <b>Browser</b> source (1920×1080) with this URL, on top of your camera:</span>
      {state.library.screens.map((s) => {
        const url = `${base}?view=output&screen=${s.id}`;
        return (
          <div key={s.id} className="row gap-xs small">
            <span className="grow truncate">{s.name}{s.key !== 'transparent' && ' (not transparent)'}</span>
            {s.key !== 'transparent' && <button className="mini-btn" onClick={() => dispatch({ type: 'screen/upsert', screen: { ...s, key: 'transparent' } })}>Make transparent</button>}
            <button className="mini-btn" onClick={() => copy(url)}>{copied === url ? '✓ Copied' : 'Copy URL'}</button>
          </div>
        );
      })}
      <p className="hint">Full-screen slides instead (in place of PowerPoint): open Output ↗ and use a Window Capture of “FreeCast — Audience” in OBS.</p>
    </div>
  );
}
