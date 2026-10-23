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
  const [copyStatus, setCopyStatus] = useState('');
  const refresh = () => desktop?.info().then(setInfo);

  useEffect(() => { setCopyStatus(''); }, [info?.internet.connectionCode]);

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
      <div className="stack">
        <h3>FreeCast Remote 웹앱 · 고정 주소</h3>
        <code className="small selectable">{info.internet.webAppUrl ?? `${info.ai.proxyUrl.replace(/\/+$/, '')}/freecast/remote/`}</code>
        <p className="hint">Windows·Mac 어느 컴퓨터를 사용하든 웹앱 주소는 같습니다. iPhone Safari에서 열고 공유 → 홈 화면에 추가를 선택하세요.</p>
        {info.internet.on && info.internet.linkStatus === 'ok' && info.internet.link && <>
          <h4>이 컴퓨터 연결</h4>
          {info.internet.connectionCode && <>
            <label className="stack small">연결 코드
              <input className="selectable" readOnly value={info.internet.connectionCode} onFocus={(e) => e.currentTarget.select()} spellCheck={false} />
            </label>
            <button onClick={async () => {
              try {
                if (!await desktop!.copyRemoteCode()) throw new Error('Code unavailable');
                setCopyStatus('연결 코드를 복사했습니다.');
              } catch {
                setCopyStatus('복사하지 못했습니다. 위 연결 코드를 선택한 뒤 직접 복사해 주세요.');
              }
            }}>연결 코드 복사</button>
            <p className="hint">웹앱에서 ‘컴퓨터 변경’ → ‘연결 코드’에 붙여 넣으세요. QR 코드 대신 텍스트로 연결할 수 있습니다.</p>
            <p className="hint" role="status">{copyStatus}</p>
          </>}
          <img src={qrDataUrl(info.internet.pairingUrl ?? info.internet.link)} alt="FreeCast Remote 컴퓨터 연결 QR 코드" width={160} height={160} />
          <code className="small selectable">{info.internet.pairingUrl ?? info.internet.link}</code>
          <p className="hint">QR 코드를 한 번 스캔하면 이 컴퓨터가 웹앱에 저장됩니다. 이후 고정 웹앱 주소에서 저장한 컴퓨터를 선택하세요. 컴퓨터에서 FreeCast와 인터넷 리모컨이 켜져 있어야 합니다.</p>
          <button onClick={async () => { if (!confirm('연결 키를 재발급할까요? 기존에 연결한 휴대폰은 새 QR 코드를 스캔해야 합니다. 웹앱 주소는 그대로 유지됩니다.')) return; await desktop!.newRemoteLink(); refresh(); }}>연결 키 재발급</button>
        </>}
        {info.internet.on && info.internet.linkStatus === 'pending' && <p className="hint">이 컴퓨터의 고정 연결을 등록하고 있습니다…</p>}
        {info.internet.on && (info.internet.linkStatus === 'error' || info.internet.linkStatus === 'unavailable') && <p className="hint">{info.internet.linkError ?? '연결 등록을 다시 시도하고 있습니다.'}</p>}
        <p className="hint">연결 QR 코드는 컴퓨터를 조작할 수 있는 개인 연결 정보입니다. 미디어팀에만 공유하세요.</p>
      </div>
    </div>
  );
}
