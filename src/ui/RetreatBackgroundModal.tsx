import { useState, type Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Library, RetreatLook } from '../domain/types';
import { defaultRetreatLook } from '../domain/motion';
import { RetreatLookEditor } from './RetreatLookEditor';

/** 수련회 배경: change the retreat theme or its moving background at any time; every 수련회 slide follows. */
export function RetreatBackgroundModal({ library, dispatch, onClose, notify }: { library: Library; dispatch: Dispatch<Action>; onClose: () => void; notify: (m: string) => void }) {
  const [look, setLook] = useState<RetreatLook>(() => library.retreat ?? defaultRetreatLook(''));
  const following = library.presentations.filter((p) => p.retreatBg).length;
  const theme = library.themes.find((t) => t.id === 'theme_bold') ?? library.themes[0];
  const apply = () => {
    dispatch({ type: 'retreat/look', look });
    notify(following ? `수련회 슬라이드 ${following}개에 새 배경을 적용했습니다` : '수련회 배경을 저장했습니다 — 수련회 만들기에서 만든 슬라이드에 쓰입니다');
    onClose();
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal retreat-look-modal" role="dialog" aria-modal="true" aria-label="수련회 배경" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <header className="modal-head"><h2>⛺ 수련회 배경 · 주제 바꾸기</h2><button autoFocus aria-label="닫기" onClick={onClose}>✕</button></header>
        <div className="feature-scroll">
          <RetreatLookEditor look={look} theme={theme} onChange={setLook} />
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">수련회 슬라이드 {following}개가 이 배경을 따라갑니다 · 한 번 누르면 모두 바뀝니다 (실행 취소 가능)</span>
          <button onClick={onClose}>닫기</button>
          <button className="primary" onClick={apply}>적용</button>
        </footer>
      </section>
    </div>
  );
}
