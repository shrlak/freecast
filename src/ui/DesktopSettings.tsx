import { useEffect, useState } from 'react';
import type { Screen } from '../domain/types';
import { desktop, type DesktopInfo } from '../domain/desktop';
import { openOutput } from './LivePanel';
import { UpdateCheck } from './UpdateBanner';
import { qrDataUrl } from '../domain/io/qr';

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
  // The internet address appears a few seconds after switching on, and can change if the connection drops.
  const waiting = info?.internet.on;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [waiting]);

  if (!desktop) return null;
  if (!info) return <p className="hint">Loading desktop settings…</p>;

  const displayFor = (id: string) => info.outputDisplays[id] ?? '';
  const targets = [...screens.map((s) => ({ id: s.id, name: s.name, view: 'output' as const, extra: `&screen=${s.id}` })), { id: 'stage', name: 'Stage display', view: 'stage' as const, extra: '' }];

  return (
    <div className="stack">
      <h3>소프트웨어 업데이트 <span className="muted small">FreeCast {info.version}</span></h3>
      <UpdateCheck />
      <p className="hint">FreeCast는 macOS(또는 Windows)가 업데이트된 뒤 처음 켤 때 새 버전을 확인하고, 앱을 종료할 때 설치합니다. 언제든 “업데이트 확인”으로 직접 확인할 수도 있습니다.</p>
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

      <h3>Remote from anywhere (any Wi-Fi or mobile data)</h3>
      <label className="check">
        <input type="checkbox" checked={info.internet.on} disabled={busy} onChange={async (e) => {
          setBusy(true);
          await desktop!.setInternetRemote(e.target.checked);
          await refresh();
          setBusy(false);
        }} />
        Let a phone or tablet control FreeCast over the internet
      </label>
      {info.internet.on && info.internet.status === 'connecting' && <p className="hint">{info.internet.note ?? 'Connecting…'}</p>}
      {info.internet.on && info.internet.status === 'error' && <p className="hint">{info.internet.error}</p>}
      {info.internet.on && info.internet.url && (
        <div className="stack">
          {/* The permanent link once the church Worker has it; until then the tunnel's own (temporary) address. */}
          {(() => {
            const fixed = info.internet.linkStatus === 'ok' && info.internet.link;
            const shown = fixed ? info.internet.link! : `${info.internet.url}/?view=remote`;
            return (
              <>
                <code className="small selectable">{shown}</code>
                <div className="row gap-xs">
                  <button onClick={async () => { if (!confirm('Make a new link? Phones using the old link will stop working.')) return; await desktop!.newRemoteLink(); refresh(); }}>New Link</button>
                </div>
                <img src={qrDataUrl(shown)} alt="Remote link" width={160} height={160} />
                {fixed
                  ? <p className="hint">This link stays the same every time FreeCast starts — save it on the phone. Anyone with the link can control FreeCast, so only share it with the media team. Press New Link to replace it.</p>
                  : info.internet.linkStatus === 'pending'
                    ? <p className="hint">Setting up the permanent link…</p>
                    : <p className="hint">Temporary link (it changes each time FreeCast starts). {info.internet.linkError ?? ''} The permanent link appears here once the church server (Worker) has the remote-link update — see worker/remote-link.js.</p>}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
