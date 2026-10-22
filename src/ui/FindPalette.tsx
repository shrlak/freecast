import { useMemo, useState } from 'react';
import type { Library } from '../domain/types';
import { findSlides, type FoundSlide } from '../domain/find';

interface Props {
  library: Library;
  onClose: () => void;
  /** Enter: show it on screen now. */
  onLive: (f: FoundSlide) => void;
  /** Shift+Enter or a click on the arrow: open it for editing. */
  onEdit: (f: FoundSlide) => void;
}

/** ⌘/Ctrl+K: type a lyric line, verse or announcement and jump to it — across every presentation. */
export function FindPalette({ library, onClose, onLive, onEdit }: Props) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const found = useMemo(() => findSlides(library, query), [library, query]);
  const pick = Math.min(at, found.length - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(found.length - 1, pick + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(0, pick - 1)); }
    else if (e.key === 'Enter' && found[pick]) {
      e.preventDefault();
      if (e.shiftKey) onEdit(found[pick]);
      else onLive(found[pick]);
    }
  };

  return (
    <div className="modal-backdrop find-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal find-modal" role="dialog" aria-label="빠른 찾기" onKeyDown={onKeyDown}>
        <input autoFocus className="find-input" value={query} placeholder="가사·성경 구절·광고 검색 — Enter: 화면에 표시 · Shift+Enter: 편집"
          onChange={(e) => { setQuery(e.target.value); setAt(0); }} />
        <ul className="find-list">
          {found.map((f, i) => (
            <li key={`${f.presentationId}:${f.slideId}`} className={i === pick ? 'on' : ''} onMouseEnter={() => setAt(i)}>
              <button className="find-main" onClick={() => onLive(f)}>
                <span className="find-snippet">{f.snippet || '—'}</span>
                <span className="find-where">{f.presentationTitle} · {f.group} · {f.seq + 1}</span>
              </button>
              <button className="find-edit" title="편집" onClick={() => onEdit(f)}>✎</button>
            </li>
          ))}
          {query.trim() && !found.length && <li className="find-none">찾는 슬라이드가 없습니다</li>}
        </ul>
      </div>
    </div>
  );
}
