import { useState } from 'react';
import type { Library } from '../domain/types';
import { bundleAssets, prepareBundle, type BundleReport, type SafeModeState } from '../domain/safeMode';
import { browserBundleDeps } from '../domain/safeModeDeps';

/** 🛡 예배 당일 안전 모드: keep every file of today's service on this computer, then lock out risky changes. */
export function SafeModeModal({ library, playlistId, safe, onChange, notify, onClose }: {
  library: Library; playlistId: string | null; safe: SafeModeState; onChange: (s: SafeModeState) => void; notify: (m: string) => void; onClose: () => void;
}) {
  const playlist = library.playlists.find((p) => p.id === playlistId);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<BundleReport | null>(null);
  const need = bundleAssets(library, playlistId);
  const prepare = async () => {
    setProgress({ done: 0, total: need.media.length + need.images.length });
    const r = await prepareBundle(library, playlistId, browserBundleDeps, Date.now(), (done, total) => setProgress({ done, total }));
    setReport(r);
    setProgress(null);
    notify(r.missing.length ? `준비 못 한 파일 ${r.missing.length}개가 있습니다` : `예배 자료 ${r.total}개를 모두 이 컴퓨터에 준비했습니다`);
  };
  const toggle = () => {
    if (safe.on) { onChange({ on: false, playlistId: null, at: null }); notify('안전 모드를 껐습니다'); return; }
    if (!playlist) return notify('먼저 예배(재생목록)를 선택하세요');
    onChange({ on: true, playlistId: playlist.id, at: Date.now() });
    notify('🛡 안전 모드를 켰습니다 — 삭제·교체가 막히고 클라우드 동기화가 멈춥니다');
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal" role="dialog" aria-label="예배 당일 안전 모드">
      <header className="modal-head"><h2>🛡 안전 모드 · {playlist?.name ?? '예배를 먼저 선택하세요'}</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <p>예배 한 시간 전에 실행하세요. 이 예배에 쓰는 사진·영상·음악·로고를 모두 이 컴퓨터에 받아 두어, 인터넷이 끊겨도 그대로 나옵니다.</p>
        <p className="hint">필요한 파일: 미디어 {need.media.length}개 · 내장 이미지 {need.images.length}개</p>
        <button className="primary" disabled={!playlist || !!progress} onClick={() => void prepare()}>{progress ? `준비하는 중… ${progress.done}/${progress.total}` : '예배 자료 모두 준비하기'}</button>
        {report && <p role="status">{report.missing.length ? '⚠' : '✅'} {report.ready}/{report.total}개 준비됨{report.downloaded ? ` (새로 받음 ${report.downloaded})` : ''}</p>}
        {!!report?.missing.length && <ul role="alert">{report.missing.map((m) => <li key={m.kind + m.id}>{m.kind === 'media' ? '미디어' : '이미지'}: {m.name} — 인터넷이 되는 곳에서 다시 시도하세요</li>)}</ul>}
        <hr />
        <p>안전 모드를 켜면: 자료·슬라이드·재생목록 삭제, 라이브러리 교체, 휴지통 비우기가 막히고, 클라우드 동기화가 멈춰 예배 중에 자료가 바뀌지 않습니다. 끄면 동기화가 다시 시작됩니다.</p>
        <button className={safe.on ? '' : 'primary'} disabled={!playlist && !safe.on} onClick={toggle}>{safe.on ? '안전 모드 끄기' : '안전 모드 켜기'}</button>
        {safe.on && safe.at && <p className="hint">{new Date(safe.at).toLocaleString()}부터 켜져 있음</p>}
      </div>
    </div>
  </div>;
}
