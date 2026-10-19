import { useEffect, useState } from 'react';
import type { Screen } from '../domain/types';
import { desktop, type DesktopInfo } from '../domain/desktop';
import { openOutput } from './LivePanel';
import { UpdateCheck } from './UpdateBanner';

/** Desktop-app only: which display each screen opens on, the AI key, and network access for phones. */
export function DesktopSettings({ screens }: { screens: Screen[] }) {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [key, setKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => desktop?.info().then(setInfo);

  useEffect(() => {
    refresh();
    return desktop?.onDisplays(() => refresh());
  }, []);

  if (!desktop) return null;
  if (!info) return <p className="hint">Loading desktop settings…</p>;

  const displayFor = (id: string) => info.outputDisplays[id] ?? '';
  const targets = [...screens.map((s) => ({ id: s.id, name: s.name, view: 'output' as const, extra: `&screen=${s.id}` })), { id: 'stage', name: 'Stage display', view: 'stage' as const, extra: '' }];

  return (
    <div className="stack">
      <h3>Software update <span className="muted small">FreeCast {info.version}</span></h3>
      <UpdateCheck />
      <p className="hint">FreeCast checks for updates at launch, every 4 hours, on wake, and right after a macOS / Windows update, then installs on restart.</p>
      <h3>Displays</h3>
      <p className="hint">Pick a display for each output and it opens full-screen there; FreeCast remembers it next time.</p>
      {targets.map((t) => (
        <div key={t.id} className="row gap-xs">
          <span className="grow truncate">{t.name}</span>
          <select value={displayFor(t.id)} onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            openOutput(t.view, t.extra, v);
            setTimeout(refresh, 300);
          }}>
            <option value="">Window</option>
            {info.displays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button onClick={() => openOutput(t.view, t.extra)}>Open</button>
        </div>
      ))}
      <button onClick={() => desktop!.closeOutputs()}>Close all outputs</button>

      <h3>AI (Gemini · OpenRouter — 주일예배 생성기와 같은 설정)</h3>
      <p className="hint">기본: 교회 Cloudflare Worker(lyrics-ai-proxy)를 통해 관리자가 정한 모델 순서로 요청합니다. 키가 없어도 됩니다. 자신의 키를 넣으면 Google / OpenRouter로 바로 요청합니다.</p>
      <label className="stack small">Worker 주소 (비우면 기본값)
        <div className="row gap-xs">
          <input className="grow" placeholder="https://lyrics-ai-proxy.spencerkim1235.workers.dev" defaultValue={info.ai.proxyUrl} onBlur={async (e) => { await desktop!.setAiConfig({ proxyUrl: e.target.value }); refresh(); }} />
        </div>
      </label>
      <div className="row gap-xs">
        <input className="grow" type="password" autoComplete="off" placeholder={info.ai.hasGeminiKey ? '✓ Gemini 키 저장됨' : 'Gemini API 키 (선택)'} value={key} onChange={(e) => setKey(e.target.value)} />
        <button disabled={!key.trim()} onClick={async () => { await desktop!.setAiConfig({ geminiKey: key }); setKey(''); refresh(); }}>저장</button>
        {info.ai.hasGeminiKey && <button className="danger" onClick={async () => { await desktop!.setAiConfig({ geminiKey: '' }); refresh(); }}>삭제</button>}
      </div>
      <div className="row gap-xs">
        <input className="grow" type="password" autoComplete="off" placeholder={info.ai.hasOpenrouterKey ? '✓ OpenRouter 키 저장됨' : 'OpenRouter API 키 (선택)'} value={orKey} onChange={(e) => setOrKey(e.target.value)} />
        <button disabled={!orKey.trim()} onClick={async () => { await desktop!.setAiConfig({ openrouterKey: orKey }); setOrKey(''); refresh(); }}>저장</button>
        {info.ai.hasOpenrouterKey && <button className="danger" onClick={async () => { await desktop!.setAiConfig({ openrouterKey: '' }); refresh(); }}>삭제</button>}
      </div>

      <h3>Phones & tablets</h3>
      <label className="check">
        <input type="checkbox" checked={info.networkRemote} disabled={busy} onChange={async (e) => {
          setBusy(true);
          await desktop!.setNetworkRemote(e.target.checked);
          await refresh();
          setBusy(false);
        }} />
        Allow remote control and stage displays from other devices on this network
      </label>
      {info.lanUrls.map((u) => <code key={u} className="small selectable">{u}/?view=remote</code>)}
      {!info.networkRemote && <p className="hint">Off: FreeCast is only reachable from this computer.</p>}
    </div>
  );
}
