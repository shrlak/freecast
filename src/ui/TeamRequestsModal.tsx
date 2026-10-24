import { useState } from 'react';
import type { TeamRequest } from '../domain/teamRequests';
import { requestStatus } from '../domain/teamRequests';

export function TeamRequestsModal({ requests, send, onClose }: { requests: TeamRequest[]; send: (m: unknown) => void; onClose: () => void }) {
  const [all, setAll] = useState(false);
  const visible = [...requests].filter((r) => all || r.status !== 'done').reverse();
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="modal team-requests-modal" role="dialog" aria-modal="true" aria-label="무대팀 비공개 요청" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <header className="modal-head"><h2>무대팀 비공개 요청</h2><button autoFocus aria-label="닫기" onClick={onClose}>✕</button></header>
    <p className="hint">실제 송출·무대 화면에는 표시되지 않습니다. 요청은 현재 서버에서 최대 1시간 보관하며, 서버 재시작 시 지워집니다.</p>
    <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />처리 완료도 보기</label>
    <div className="feature-scroll">{visible.map((r) => <article key={r.id} className={`team-request ${r.status}`}><div className="grow"><strong>{r.text}</strong><div className="muted small">{r.name} · {new Date(r.at).toLocaleTimeString()} · {requestStatus[r.status]}</div></div><button disabled={r.status !== 'pending'} onClick={() => send({ type: 'team-request', action: 'status', id: r.id, status: 'acknowledged' })}>확인</button><button disabled={r.status === 'done'} onClick={() => send({ type: 'team-request', action: 'status', id: r.id, status: 'done' })}>처리 완료</button></article>)}{!visible.length && <p className="empty">대기 중인 요청이 없습니다.</p>}</div>
    <footer className="modal-foot"><button onClick={onClose}>닫기</button></footer>
  </section></div>;
}
