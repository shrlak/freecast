import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { activePlaylist } from '../domain/live';
import { uid } from '../domain/lyrics';

/** Playlists in the order a chooser shows them: the open one first, then by name. */
export function playlistChoices(state: AppState) {
  const active = activePlaylist(state);
  const rest = state.library.playlists.filter((p) => p.id !== active?.id).sort((a, b) => a.name.localeCompare(b.name));
  return active ? [active, ...rest] : rest;
}

/**
 * “재생목록에 추가” chooser: put a presentation into any existing playlist (the open one first)
 * or into a new one, without switching playlists first.
 */
export function AddToPlaylistMenu({ state, dispatch, presentationId, x, y, notify, onClose }: {
  state: AppState;
  dispatch: Dispatch<Action>;
  presentationId: string;
  x: number;
  y: number;
  notify: (msg: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [naming, setNaming] = useState<string | null>(null);
  const title = state.library.presentations.find((p) => p.id === presentationId)?.title ?? '자료';
  const active = activePlaylist(state);
  const choices = playlistChoices(state);

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const ny = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    setPos({ x: nx, y: ny });
  }, [x, y, naming !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const away = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true); };
  }, [onClose]);

  const add = (playlistId: string, name: string) => {
    dispatch({ type: 'playlist/addItem', playlistId, item: { id: uid('pli'), presentationId } });
    notify(`“${title}”을(를) “${name}” 끝에 넣었습니다`);
    onClose();
  };
  const create = () => {
    const name = naming?.trim();
    if (!name) return;
    dispatch({ type: 'playlist/create', playlist: { id: uid('pl'), name, items: [{ id: uid('pli'), presentationId }] } });
    notify(`새 재생목록 “${name}”에 “${title}”을(를) 넣었습니다`);
    onClose();
  };

  return (
    <div ref={ref} className="ctx-menu add-menu" role="menu" aria-label="재생목록에 추가" style={{ left: pos.x, top: pos.y }} onClick={(e) => e.stopPropagation()}>
      <div className="add-menu-title truncate" title={title}>“{title}” 넣을 재생목록</div>
      <div className="add-menu-list">
        {choices.map((pl) => {
          const count = pl.items.filter((i) => i.kind !== 'header' && i.presentationId === presentationId).length;
          return (
            <button key={pl.id} role="menuitem" onClick={() => add(pl.id, pl.name)} autoFocus={pl.id === active?.id}>
              <span className="truncate">{pl.name}</span>
              <span className="add-menu-meta">{pl.id === active?.id && <b>지금 열림</b>}{count > 0 && <em title="이미 들어 있습니다 — 한 번 더 넣습니다">✓ 있음</em>}</span>
            </button>
          );
        })}
      </div>
      {naming === null ? (
        <button className="add-menu-new" role="menuitem" onClick={() => setNaming('')}>＋ 새 재생목록 만들어 넣기</button>
      ) : (
        <form className="add-menu-form" onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input autoFocus placeholder="새 재생목록 이름" value={naming} onChange={(e) => setNaming(e.target.value)} />
          <button type="submit" className="primary" disabled={!naming.trim()}>만들기</button>
        </form>
      )}
    </div>
  );
}

/**
 * Search box that adds presentations straight into a playlist: type a song or file name,
 * then click a result (or press Enter for the first one).
 */
export function PlaylistAdder({ state, dispatch, playlistId, notify, autoFocus, onDone }: {
  state: AppState;
  dispatch: Dispatch<Action>;
  playlistId: string;
  notify: (msg: string) => void;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const hitsRef = useRef<HTMLUListElement>(null);
  const playlist = state.library.playlists.find((p) => p.id === playlistId);
  const inList = useMemo(() => new Set(playlist?.items.flatMap((i) => (i.kind === 'header' ? [] : [i.presentationId])) ?? []), [playlist]);
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return [];
    const all = state.library.presentations;
    const byTitle = all.filter((p) => p.title.toLowerCase().includes(q));
    const byText = all.filter((p) => !byTitle.includes(p) && p.slides.some((s) => s.text.toLowerCase().includes(q)));
    const rank = (t: string) => (t.toLowerCase().startsWith(q) ? 0 : 1);
    return [...byTitle.sort((a, b) => rank(a.title) - rank(b.title) || a.title.localeCompare(b.title)), ...byText].slice(0, 8);
  }, [q, state.library.presentations]);
  // Keep the results in view (the 슬라이드 pane puts the box at the very bottom of a scrolling list).
  useEffect(() => { hitsRef.current?.scrollIntoView({ block: 'nearest' }); }, [q, hits.length]);
  if (!playlist) return null;

  const add = (id: string) => {
    const p = state.library.presentations.find((x) => x.id === id);
    dispatch({ type: 'playlist/addItem', playlistId, item: { id: uid('pli'), presentationId: id } });
    notify(`“${p?.title ?? '자료'}”을(를) “${playlist.name}” 끝에 넣었습니다`);
    setQuery('');
    setHi(0);
  };

  return (
    <div className="pl-adder">
      <input
        className="search"
        autoFocus={autoFocus}
        placeholder={`＋ “${playlist.name}”에 넣을 곡·자료 검색`}
        aria-label={`${playlist.name}에 넣을 자료 검색`}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setHi(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(hits.length - 1, h + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
          else if (e.key === 'Enter' && hits[hi]) { e.preventDefault(); add(hits[hi].id); }
          else if (e.key === 'Escape') { e.stopPropagation(); if (query) setQuery(''); else onDone?.(); }
        }}
      />
      {q && (
        <ul ref={hitsRef} className="pl-adder-hits" role="listbox">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onMouseDown={(e) => { e.preventDefault(); add(p.id); }}>
              <span className="truncate">{p.title}</span>
              <span className="pl-adder-meta">{inList.has(p.id) && <em>✓ 있음</em>}{p.meta?.key && <span className="key-badge">{p.meta.key}</span>}<b>넣기</b></span>
            </li>
          ))}
          {!hits.length && <li className="empty">“{query.trim()}” 자료가 없습니다</li>}
        </ul>
      )}
    </div>
  );
}

/** Drag data: a presentation dragged from the library, or a playlist row being reordered. */
export const DRAG_PRESENTATION = 'application/x-freecast-presentation';
export const DRAG_PLAYLIST_ITEM = 'application/x-freecast-playlist-item';
