import { isServicePlaylist, nextServiceCleanup } from '../domain/sunday/cleanup';
import { isSaturdayDawnImage, isSaturdayDawnName } from '../domain/saturdayDawn';
import { useEffect, useRef, useState, type DragEvent, type Dispatch } from 'react';
import type { AppState, Action } from '../domain/reducer';
import { activePlaylist } from '../domain/live';
import { NameDialog } from './NameDialog';
import { uid } from '../domain/lyrics';
import { MaterialProtectionButton } from './MaterialProtection';
import { AddToPlaylistMenu, DRAG_PLAYLIST_ITEM, DRAG_PRESENTATION, PlaylistAdder } from './AddToPlaylist';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onNew: () => void;
  notify: (msg: string) => void;
  online: { status: 'loading' | 'ok' | 'error'; count: number; error?: string };
  onReloadOnline: () => void;
  /** Changes when ⌘/Ctrl+F asks for the search box. */
  focusSearch?: number;
}

type NameRequest = { kind: 'new' | 'rename' | 'duplicate' | 'header' | 'renameHeader'; playlistId?: string; itemId?: string; initialValue: string; title: string };

/**
 * 라이브러리 tab: the open playlist (service order) on top — add to it by searching, by ＋ on any
 * library item, or by dragging — and every presentation below.
 */
export function LibraryPanel({ state, dispatch, onNew, notify, online, onReloadOnline, focusSearch = 0 }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusSearch) return;
    const t = setTimeout(() => { searchRef.current?.focus(); searchRef.current?.select(); }, 0);
    return () => clearTimeout(t);
  }, [focusSearch]);
  const [nameRequest, setNameRequest] = useState<NameRequest | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addMenu, setAddMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [plMenu, setPlMenu] = useState(false);
  /** Where a dragged item would land in the playlist (index before which it goes). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  const { presentations, playlists } = state.library;
  const playlist = activePlaylist(state);
  const cleanupPlaylist = isServicePlaylist(playlist?.name ?? '') || isSaturdayDawnName(playlist?.name ?? '');
  const q = query.trim().toLowerCase();
  const filtered = presentations
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.slides.some((s) => `${s.title ?? ''} ${s.text}`.toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title));
  const folders = new Map<string, typeof filtered>();
  for (const p of filtered) {
    const f = p.folder || 'Library';
    folders.set(f, [...(folders.get(f) ?? []), p]);
  }
  const byId = new Map(presentations.map((p) => [p.id, p]));
  const saturdayImages = playlist?.items.some((i) => i.kind !== 'header' && byId.has(i.presentationId) && isSaturdayDawnImage(state.library, byId.get(i.presentationId)!, playlist.name));
  const liveId = state.cursor?.presentationId;
  const inPlaylist = new Set(playlist?.items.flatMap((i) => (i.kind === 'header' ? [] : [i.presentationId])) ?? []);

  const saveName = (name: string): string | void => {
    if (!nameRequest) return;
    if (nameRequest.kind === 'new') { dispatch({ type: 'playlist/create', playlist: { id: uid('pl'), name, items: [] } }); return; }
    const target = playlists.find((p) => p.id === nameRequest.playlistId);
    if (!target) return '재생목록이 삭제되었거나 더 이상 존재하지 않습니다.';
    if (nameRequest.kind === 'rename') dispatch({ type: 'playlist/rename', id: target.id, name });
    else if (nameRequest.kind === 'duplicate') dispatch({ type: 'playlist/duplicate', id: target.id, newId: uid('pl'), name });
    else if (nameRequest.kind === 'header') dispatch({ type: 'playlist/set', playlist: { ...target, items: [...target.items, { id: uid('pli'), kind: 'header', title: name }] } });
    else {
      if (!target.items.some((i) => i.id === nameRequest.itemId && i.kind === 'header')) return '섹션 제목이 삭제되었습니다.';
      dispatch({ type: 'playlist/set', playlist: { ...target, items: target.items.map((i) => i.id === nameRequest.itemId && i.kind === 'header' ? { ...i, title: name } : i) } });
    }
  };
  const deletePlaylist = () => {
    if (!playlist) return;
    const ask = cleanupPlaylist || saturdayImages
      ? `“${playlist.name}” 재생목록과 전용 예배 자료를 삭제할까요? 토요새벽 예배 이미지도 함께 휴지통으로 이동합니다. 전용 미디어는 30일 후 삭제되며 찬양 목록·라이브러리와 공유 미디어는 보존됩니다.`
      : `“${playlist.name}” 재생목록을 삭제할까요? (안에 든 자료는 라이브러리에 그대로 남습니다)`;
    if (confirm(ask)) dispatch({ type: 'playlist/delete', id: playlist.id });
  };

  // Drag a library item into the playlist, or drag playlist rows to reorder them.
  const dragKind = (e: DragEvent) => (e.dataTransfer.types.includes(DRAG_PRESENTATION) ? 'pres' : e.dataTransfer.types.includes(DRAG_PLAYLIST_ITEM) ? 'item' : null);
  const over = (e: DragEvent, at: number) => {
    if (!dragKind(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dragKind(e) === 'pres' ? 'copy' : 'move';
    if (dropAt !== at) setDropAt(at);
  };
  const drop = (e: DragEvent, at: number) => {
    setDropAt(null);
    if (!playlist) return;
    const pres = e.dataTransfer.getData(DRAG_PRESENTATION);
    const from = e.dataTransfer.getData(DRAG_PLAYLIST_ITEM);
    e.preventDefault();
    if (pres) {
      dispatch({ type: 'playlist/addItem', playlistId: playlist.id, index: at, item: { id: uid('pli'), presentationId: pres } });
      notify(`“${byId.get(pres)?.title ?? '자료'}”을(를) “${playlist.name}”에 넣었습니다`);
    } else if (from !== '') {
      const i = Number(from);
      const to = at > i ? at - 1 : at;
      if (Number.isInteger(i) && to !== i) dispatch({ type: 'playlist/move', from: i, to });
    }
  };
  const count = playlist?.items.filter((i) => i.kind !== 'header').length ?? 0;

  return (
    <>
    <aside className="panel sidebar lib-panel">
      <section className="side-section grow pl-section">
        <div className="section-head">
          <select className="playlist-select" value={playlist?.id} aria-label="재생목록 고르기" onChange={(e) => dispatch({ type: 'playlist/activate', id: e.target.value })}>
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="pl-menu-wrap">
            <button className="mini-btn pl-more" title="재생목록 메뉴" aria-haspopup="menu" aria-expanded={plMenu} onClick={() => setPlMenu((v) => !v)}>⋯</button>
            {plMenu && (
              <div className="ctx-menu pl-menu" role="menu" onMouseLeave={() => setPlMenu(false)}>
                <button role="menuitem" onClick={() => { setPlMenu(false); setNameRequest({ kind: 'new', initialValue: '새 재생목록', title: '새 재생목록' }); }}>＋ 새 재생목록</button>
                <button role="menuitem" disabled={!playlist} onClick={() => { setPlMenu(false); if (playlist) setNameRequest({ kind: 'header', playlistId: playlist.id, initialValue: '섹션', title: '섹션 제목' }); }}>📑 섹션 제목 넣기</button>
                <button role="menuitem" disabled={!playlist} onClick={() => { setPlMenu(false); if (playlist) setNameRequest({ kind: 'rename', playlistId: playlist.id, initialValue: playlist.name, title: '재생목록 이름 바꾸기' }); }}>✎ 이름 바꾸기</button>
                <button role="menuitem" disabled={!playlist} onClick={() => { setPlMenu(false); if (playlist) setNameRequest({ kind: 'duplicate', playlistId: playlist.id, initialValue: `${playlist.name} 사본`, title: '복사해서 새로 만들기 (예: 다음 주 예배)' }); }}>⧉ 복사해서 새로 만들기</button>
                <button role="menuitem" className="danger" disabled={playlists.length <= 1 && !cleanupPlaylist} onClick={() => { setPlMenu(false); deletePlaylist(); }}>🗑 재생목록 삭제</button>
              </div>
            )}
          </div>
        </div>
        {playlist && <PlaylistAdder state={state} dispatch={dispatch} playlistId={playlist.id} notify={notify} />}
        {playlist && isServicePlaylist(playlist.name) && <div className="playlist-retention">
          <label><input type="checkbox" checked={!!playlist.autoDeleteAfter && playlist.autoDeleteAfter > Date.now()} onChange={(e) => dispatch({ type: 'playlist/retention', id: playlist.id, until: e.target.checked ? nextServiceCleanup(playlist.name, new Date()) : undefined })} /> 다음 자동 삭제까지 보관</label>
          <p className="hint">{playlist.autoDeleteAfter && playlist.autoDeleteAfter > Date.now() ? `${new Date(playlist.autoDeleteAfter).toLocaleString()}까지 예배 자료와 미디어를 보관합니다.` : '예배 종료 후 자료는 휴지통으로 옮기고, 전용 미디어는 30일 후 삭제합니다.'}</p>
        </div>}
        {playlist && (isSaturdayDawnName(playlist.name) || saturdayImages) && <p className="hint">이미지 항목의 ✕ 또는 재생목록 삭제 시 전용 이미지 자료도 휴지통으로 옮깁니다. 30일간 복원할 수 있으며, 다른 재생목록에서 사용하는 자료는 유지합니다.</p>}
        <ol className="list pl-list" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null); }}>
          {playlist?.items.map((item, i) => {
            const isHeader = item.kind === 'header';
            const title = isHeader ? item.title : byId.get(item.presentationId)?.title ?? '(삭제된 자료)';
            const rename = () => playlist && isHeader && setNameRequest({ kind: 'renameHeader', playlistId: playlist.id, itemId: item.id, initialValue: item.title, title: '섹션 제목' });
            return (
              <li
                key={item.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_PLAYLIST_ITEM, String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { const r = e.currentTarget.getBoundingClientRect(); over(e, e.clientY > r.top + r.height / 2 ? i + 1 : i); }}
                onDrop={(e) => { const r = e.currentTarget.getBoundingClientRect(); drop(e, e.clientY > r.top + r.height / 2 ? i + 1 : i); }}
                onDragEnd={() => setDropAt(null)}
                className={`${isHeader ? 'playlist-header' : `list-item ${state.playlistIndex === i ? 'selected' : ''} ${state.cursor?.playlistIndex === i ? 'is-live' : ''}`} ${dropAt === i ? 'drop-before' : ''} ${dropAt === i + 1 && i === playlist.items.length - 1 ? 'drop-after' : ''}`}
                onClick={() => !isHeader && dispatch({ type: 'playlist/select', index: i })}
              >
                <span className="pl-grip" aria-hidden>⋮⋮</span>
                <span className="truncate pl-title" onDoubleClick={rename}>{title}</span>
                <span className="row gap-xs item-actions">
                  {isHeader && <button className="mini-btn" title="섹션 제목 바꾸기" onClick={(e) => { e.stopPropagation(); rename(); }}>✎</button>}
                  <button className="mini-btn" title="위로" disabled={i === 0} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/move', from: i, to: i - 1 }); }}>↑</button>
                  <button className="mini-btn" title="아래로" disabled={i === playlist.items.length - 1} onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/move', from: i, to: i + 1 }); }}>↓</button>
                  <button className="mini-btn" title="재생목록에서 빼기 (자료는 라이브러리에 남습니다)" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/removeItem', index: i }); }}>✕</button>
                </span>
              </li>
            );
          })}
          {playlist && (
            <li className={`pl-drop-end ${dropAt === playlist.items.length && !playlist.items.length ? 'on' : ''}`}
              onDragOver={(e) => over(e, playlist.items.length)} onDrop={(e) => drop(e, playlist.items.length)}>
              {playlist.items.length ? `${count}개 · 아래 라이브러리에서 끌어다 놓아도 됩니다` : '비어 있습니다 — 위에서 검색하거나, 아래 라이브러리의 ＋ 또는 끌어다 놓기로 넣으세요'}
            </li>
          )}
        </ol>
      </section>

      <section className="side-section grow">
        <div className="section-head">
          <h2>라이브러리 <span className="muted small">{presentations.length}</span></h2>
          <span className="row gap-xs">
            <button className="mini-btn" title={online.error ?? `온라인 찬양 ${online.count}곡 — 다시 불러오기`} onClick={onReloadOnline}>
              <span className={`online-dot ${online.status}`} />{online.status === 'ok' ? `온라인 ${online.count}` : online.status === 'loading' ? '불러오는 중' : '오프라인'} ⟳
            </button>
            <button className="icon-btn accent" title="새 프레젠테이션" onClick={onNew}>＋</button>
          </span>
        </div>
        <input ref={searchRef} id="library-search" className="search" placeholder="제목·가사 검색 (⌘/Ctrl+F)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="list">
          {[...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => (
            <div key={folder}>
              <button className="folder" onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}>
                {collapsed[folder] && !q ? '▸' : '▾'} {folder === 'Library' ? '기본' : folder} <span className="muted small">{items.length}</span>
              </button>
              {(!collapsed[folder] || q) && items.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData(DRAG_PRESENTATION, p.id); e.dataTransfer.effectAllowed = 'copy'; }}
                  className={`list-item ${state.selectedId === p.id && state.playlistIndex == null ? 'selected' : ''} ${liveId === p.id ? 'is-live' : ''}`}
                  onClick={() => dispatch({ type: 'select', id: p.id })}
                  title="클릭: 열기 · 끌어서 위 재생목록에 놓기"
                >
                  <span className="truncate">{p.title}</span>
                  <span className="row gap-xs item-actions">
                    <MaterialProtectionButton presentation={p} dispatch={dispatch} compact />
                    {p.meta?.key && <span className="key-badge">{p.meta.key}</span>}
                    {inPlaylist.has(p.id) && <span className="in-pl" title={`“${playlist?.name}”에 들어 있습니다`}>✓</span>}
                    <button
                      className="mini-btn add-btn"
                      title="재생목록에 넣기 (어느 재생목록인지 고릅니다)"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        setAddMenu({ id: p.id, x: r.right + 4, y: r.top });
                      }}
                    >
                      ＋
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {!filtered.length && <div className="empty">찾는 자료가 없습니다</div>}
        </div>
      </section>
    </aside>
    {addMenu && <AddToPlaylistMenu state={state} dispatch={dispatch} presentationId={addMenu.id} x={addMenu.x} y={addMenu.y} notify={notify} onClose={() => setAddMenu(null)} />}
    {nameRequest && <NameDialog title={nameRequest.title} initialValue={nameRequest.initialValue} onSave={saveName} onClose={() => setNameRequest(null)} />}
    </>
  );
}
