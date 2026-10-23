import { useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { TRASH_DAYS } from '../domain/trash';

export function TrashModal({ state, dispatch, onClose }: { state: AppState; dispatch: Dispatch<Action>; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const entries = [...(state.library.trash ?? [])].filter((e) => e.expiresAt > Date.now() && e.presentation.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.deletedAt - a.deletedAt);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="modal trash-modal" role="dialog" aria-modal="true" aria-label="휴지통" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <header className="modal-head"><h2>휴지통</h2><button aria-label="닫기" onClick={onClose}>✕</button></header>
      <p>삭제한 찬양·자료·슬라이드를 {TRASH_DAYS}일 동안 미디어와 함께 보관합니다. 필요한 항목만 복원할 수 있으며, 보관 기간에는 서버 저장 공간을 사용합니다.</p>
      <input autoFocus aria-label="휴지통 검색" placeholder="찬양·자료 제목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="feature-scroll">{entries.map((e) => <article className="trash-row" key={e.id}>
        <div className="grow"><strong>{e.presentation.title}</strong><div className="muted small">{e.kind === 'slides' ? `슬라이드 ${e.slides?.length ?? 0}장` : '찬양·자료 전체'} · {new Date(e.deletedAt).toLocaleString()} · {Math.ceil((e.expiresAt - Date.now()) / 86400000)}일 후 자동 삭제</div>
          {e.slides && <p className="small">{e.slides.map((s) => s.slide.text || s.slide.label || s.slide.group).join(' / ').slice(0, 180)}</p>}</div>
        {e.slides && e.slides.length > 1 && <details className="trash-pages"><summary>슬라이드별 복원</summary>{e.slides.map((s) => <div className="row gap-s" key={s.seq}><span className="grow">{s.seq + 1} · {(s.slide.text || s.slide.label || s.slide.group).slice(0, 60)}</span><button onClick={() => dispatch({ type: 'trash/restore', id: e.id, seq: s.seq })}>이 슬라이드 복원</button></div>)}</details>}
        <button onClick={() => dispatch({ type: 'trash/restore', id: e.id })}>{e.slides && e.slides.length > 1 ? '모두 복원' : '복원'}</button>
        <button className="danger" onClick={() => { if (confirm('이 항목과 다른 곳에서 사용하지 않는 전용 미디어를 영구 삭제할까요?')) dispatch({ type: 'trash/purge', ids: [e.id] }); }}>영구 삭제</button>
      </article>)}{!entries.length && <p className="empty">휴지통이 비어 있습니다.</p>}</div>
      <footer className="modal-foot"><span className="muted small grow">복원하면 현재의 다른 편집 내용은 유지됩니다.</span><button onClick={onClose}>닫기</button></footer>
    </section>
  </div>;
}
