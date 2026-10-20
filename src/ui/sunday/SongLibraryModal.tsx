import { useMemo, useState } from 'react';
import type { Presentation } from '../../domain/types';
import { deleteSharedSong } from '../../domain/online';
import { ADMIN_KEY, readAdmin } from './SongEditor';

/** The shared 찬양 라이브러리: search, tick songs and delete them (관리자 password, as in the song editor). */
export function SongLibraryModal({ songs, onEdit, reloadOnline, notify, onClose }: {
  songs: Presentation[]; onEdit: (id: string) => void; reloadOnline: () => void; notify: (m: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [admin, setAdmin] = useState(readAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return songs.filter((s) => s.online && (!q || s.title.toLowerCase().includes(q))).sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  }, [songs, query]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const remove = async () => {
    const titles = songs.filter((s) => picked.has(s.id)).map((s) => s.title);
    if (!titles.length) return;
    if (!admin) return setError('관리자 비밀번호를 입력하세요.');
    if (!confirm(`교회 찬양 라이브러리에서 ${titles.length}곡을 삭제할까요? 모든 컴퓨터와 주일예배 생성기에서 사라집니다.\n\n${titles.slice(0, 10).join('\n')}${titles.length > 10 ? '\n…' : ''}`)) return;
    setError(null);
    let done = 0;
    try {
      for (const t of titles) {
        setBusy(`삭제 중 ${done + 1}/${titles.length}: ${t}`);
        await deleteSharedSong(t, admin);
        done++;
      }
      try { sessionStorage.setItem(ADMIN_KEY, admin); } catch { /* private window */ }
    } catch (e) {
      setError(`${done}곡 삭제 후 중단: ${(e as Error).message}`);
    }
    setBusy(null);
    setPicked(new Set());
    if (done) {
      notify(`${done}곡을 교회 찬양 라이브러리에서 삭제했습니다`);
      reloadOnline();
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="찬양 라이브러리">
        <header className="modal-head">
          <h2>☁ 찬양 라이브러리 · {songs.filter((s) => s.online).length}곡</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="wizard-body stack">
          <div className="row gap-s">
            <input className="grow" autoFocus placeholder="제목 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
            <input type="password" placeholder="관리자 비밀번호" value={admin} onChange={(e) => setAdmin(e.target.value)} />
          </div>
          {error && <div className="warn">{error}</div>}
          {busy && <div className="card busy">⏳ {busy}</div>}
          <ol className="file-list" style={{ maxHeight: '50vh', overflow: 'auto' }}>
            {list.map((s) => (
              <li key={s.id}>
                <label className="truncate grow"><input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} /> {s.title}</label>
                <button className="mini-btn" onClick={() => { onClose(); onEdit(s.id); }}>편집</button>
              </li>
            ))}
            {!list.length && <li className="muted">찬양이 없습니다</li>}
          </ol>
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">{picked.size}곡 선택</span>
          <button onClick={() => setPicked(new Set(list.map((s) => s.id)))}>보이는 곡 모두 선택</button>
          <button disabled={!picked.size} onClick={() => setPicked(new Set())}>선택 해제</button>
          <button className="danger" disabled={!picked.size || !!busy} onClick={remove}>선택한 곡 삭제</button>
        </footer>
      </div>
    </div>
  );
}
