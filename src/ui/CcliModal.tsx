import { useState, type Dispatch } from 'react';
import type { Library } from '../domain/types';
import type { Action } from '../domain/reducer';
import { ccliCsv, ccliReport, incompleteRows, songsWithoutCreditLine } from '../domain/ccli';

/** ©️ 저작권(CCLI) 보고: the songs shown in a period, ready for the yearly report. */
export function CcliModal({ library, dispatch, notify, onClose }: { library: Library; dispatch: Dispatch<Action>; notify: (m: string) => void; onClose: () => void }) {
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const rows = ccliReport(library, from, to);
  const incomplete = incompleteRows(rows);
  const hidden = songsWithoutCreditLine(library);
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ccliCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = `freecast-ccli-${from}_${to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const showAll = () => {
    for (const p of hidden) dispatch({ type: 'presentation/update', id: p.id, patch: { showCopyright: true } });
    notify(`${hidden.length}곡에 저작권 줄 표시를 켰습니다 (첫·마지막 슬라이드)`);
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal activity-modal" role="dialog" aria-label="저작권 보고">
      <header className="modal-head"><h2>저작권(CCLI) 보고</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <div className="row"><label>시작<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>끝<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
        <p role="status">{rows.length}곡 · 총 {rows.reduce((n, r) => n + r.count, 0)}회 사용</p>
        <div className="row"><button className="primary" disabled={!rows.length} onClick={download}>CSV로 내보내기 (엑셀)</button>
          <button disabled={!hidden.length} onClick={showAll} title="저작권 정보가 있는 곡의 첫·마지막 슬라이드에 저작권 줄을 보여 줍니다">저작권 줄 표시 켜기 ({hidden.length}곡)</button></div>
        {!!incomplete.length && <p className="hint" role="alert">⚠ CCLI 번호나 저작권 정보가 없는 곡 {incomplete.length}개: {incomplete.slice(0, 5).map((r) => r.title).join(', ')}{incomplete.length > 5 ? ' …' : ''}. 곡 편집의 “Song info”에서 채우세요.</p>}
        <div className="activity-table"><table><thead><tr><th>곡</th><th>CCLI</th><th>저작권</th><th>횟수</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.presentationId + r.title}><td>{r.title}<br /><small className="muted">{r.author}</small></td><td>{r.ccli || '—'}</td><td>{r.copyright || '—'}</td><td>{r.count}</td></tr>)}</tbody></table></div>
        {!rows.length && <p className="muted">이 기간에 사용한 찬양 기록이 없습니다.</p>}
      </div>
    </div>
  </div>;
}
