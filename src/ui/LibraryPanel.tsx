import { isServicePlaylist, nextServiceCleanup } from '../domain/sunday/cleanup';
import { useState, type Dispatch } from 'react';
import type { AppState, Action } from '../domain/reducer';
import { activePlaylist } from '../domain/live';
import { NameDialog } from './NameDialog';
import { uid } from '../domain/lyrics';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onNew: () => void;
  online: { status: 'loading' | 'ok' | 'error'; count: number; error?: string };
  onReloadOnline: () => void;
}

export function LibraryPanel({ state, dispatch, onNew, online, onReloadOnline }: Props) {
  const [nameRequest, setNameRequest] = useState<{ kind: 'new' | 'rename' | 'duplicate' | 'header' | 'renameHeader'; playlistId?: string; itemId?: string; initialValue: string; title: string } | null>(null);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { presentations, playlists } = state.library;
  const playlist = activePlaylist(state);
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
  const liveId = state.cursor?.presentationId;

  const saveName = (name: string): string | void => {
    if (!nameRequest) return;
    if (nameRequest.kind === 'new') { dispatch({ type: 'playlist/create', playlist: { id: uid('pl'), name, items: [] } }); return; }
    const target = playlists.find((p) => p.id === nameRequest.playlistId);
    if (!target) return '재생목록이 삭제되었거나 더 이상 존재하지 않습니다.';
    if (nameRequest.kind === 'rename') dispatch({ type: 'playlist/rename', id: target.id, name });
    else if (nameRequest.kind === 'duplicate') dispatch({ type: 'playlist/duplicate', id: target.id, newId: uid('pl'), name });
    else if (nameRequest.kind === 'header') dispatch({ type: 'playlist/set', playlist: { ...target, items: [...target.items, { id: uid('pli'), kind: 'header', title: name }] } });
    else {
      if (!target.items.some((i) => i.id === nameRequest.itemId && i.kind === 'header')) return '헤더가 삭제되었습니다.';
      dispatch({ type: 'playlist/set', playlist: { ...target, items: target.items.map((i) => i.id === nameRequest.itemId && i.kind === 'header' ? { ...i, title: name } : i) } });
    }
  };

  return (
    <>
    <aside className="panel sidebar">
      <section className="side-section grow">
        <div className="section-head">
          <h2>Library</h2>
          <button className="icon-btn accent" title="New presentation" onClick={onNew}>＋</button>
        </div>
        <div className={`online-status ${online.status}`} title={online.error ?? 'Songs and Bibles are read from the online server'}>
          {online.status === 'loading' ? '☁ Loading online library…' : online.status === 'ok' ? `☁ ${online.count} songs online` : '☁ Offline — online library unavailable'}
          <button className="mini-btn" title="Reload from server" onClick={onReloadOnline}>⟳</button>
        </div>
        <input id="library-search" className="search" placeholder="Search titles & lyrics  (⌘/Ctrl+F)" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="list">
          {[...folders.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => (
            <div key={folder}>
              <button className="folder" onClick={() => setCollapsed((c) => ({ ...c, [folder]: !c[folder] }))}>
                {collapsed[folder] && !q ? '▸' : '▾'} {folder} <span className="muted small">{items.length}</span>
              </button>
              {(!collapsed[folder] || q) && items.map((p) => (
                <div
                  key={p.id}
                  className={`list-item ${state.selectedId === p.id && state.playlistIndex == null ? 'selected' : ''} ${liveId === p.id ? 'is-live' : ''}`}
                  onClick={() => dispatch({ type: 'select', id: p.id })}
                >
                  <span className="truncate">{p.title}</span>
                  <span className="row gap-xs item-actions">
                    {p.meta?.key && <span className="key-badge">{p.meta.key}</span>}
                    <button
                      className="mini-btn"
                      title="Add to playlist"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'playlist/addItem', item: { id: uid('pli'), presentationId: p.id } });
                      }}
                    >
                      ＋
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ))}
          {!filtered.length && <div className="empty">No matches</div>}
        </div>
      </section>

      <section className="side-section grow">
        <div className="section-head">
          <select className="playlist-select" value={playlist?.id} onChange={(e) => dispatch({ type: 'playlist/activate', id: e.target.value })}>
            {playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="row gap-xs">
            <button className="mini-btn" title="New playlist" onClick={() => setNameRequest({ kind: 'new', initialValue: 'New playlist', title: '새 재생목록' })}>＋</button>
            <button className="mini-btn" title="Add section header" disabled={!playlist} onClick={() => playlist && setNameRequest({ kind: 'header', playlistId: playlist.id, initialValue: 'Section', title: '헤더 이름' })}>H</button>
            <button className="mini-btn" title="Duplicate as template (e.g. next week's service)" disabled={!playlist} onClick={() => playlist && setNameRequest({ kind: 'duplicate', playlistId: playlist.id, initialValue: `${playlist.name} copy`, title: '템플릿으로 복제' })}>⧉</button>
            <button className="mini-btn" title="Rename playlist" disabled={!playlist} onClick={() => playlist && setNameRequest({ kind: 'rename', playlistId: playlist.id, initialValue: playlist.name, title: '재생목록 이름 변경' })}>✎</button>
            <button className="mini-btn" title="Delete playlist" disabled={playlists.length <= 1 && !isServicePlaylist(playlist?.name ?? "")} onClick={() => playlist && confirm(isServicePlaylist(playlist.name) ? `“${playlist.name}” 예배 자료를 휴지통으로 옮길까요? 전용 미디어는 30일 후 삭제되며 찬양 목록·라이브러리와 공유 미디어는 보존됩니다.` : `Delete playlist “${playlist.name}”?`) && dispatch({ type: 'playlist/delete', id: playlist.id })}>🗑</button>
          </div>
        </div>
        {playlist && isServicePlaylist(playlist.name) && <div className="playlist-retention">
          <label><input type="checkbox" checked={!!playlist.autoDeleteAfter && playlist.autoDeleteAfter > Date.now()} onChange={(e) => dispatch({ type: 'playlist/retention', id: playlist.id, until: e.target.checked ? nextServiceCleanup(playlist.name, new Date()) : undefined })} /> 다음 자동 삭제까지 보관</label>
          <p className="hint">{playlist.autoDeleteAfter && playlist.autoDeleteAfter > Date.now() ? `${new Date(playlist.autoDeleteAfter).toLocaleString()}까지 예배 자료와 미디어를 보관합니다.` : '예배 종료 후 자료는 휴지통으로 옮기고, 전용 미디어는 30일 후 삭제합니다.'}</p>
        </div>}
        <ol className="list">
          {playlist?.items.map((item, i) => {
            const isHeader = item.kind === 'header';
            const title = isHeader ? item.title : byId.get(item.presentationId)?.title ?? 'Missing';
            return (
              <li
                key={item.id}
                className={isHeader ? 'playlist-header' : `list-item ${state.playlistIndex === i ? 'selected' : ''} ${state.cursor?.playlistIndex === i ? 'is-live' : ''}`}
                onClick={() => !isHeader && dispatch({ type: 'playlist/select', index: i })}
              >
                <span className="truncate" onDoubleClick={() => isHeader && playlist && setNameRequest({ kind: 'renameHeader', playlistId: playlist.id, itemId: item.id, initialValue: item.title, title: '헤더 이름' })}>{title}</span>
                <span className="row gap-xs item-actions">
                  {isHeader && <button className="mini-btn" title="Name header" onClick={(e) => { e.stopPropagation(); if (playlist) setNameRequest({ kind: 'renameHeader', playlistId: playlist.id, itemId: item.id, initialValue: item.title, title: '헤더 이름' }); }}>✎</button>}
                  <button className="mini-btn" title="Move up" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/move', from: i, to: i - 1 }); }}>↑</button>
                  <button className="mini-btn" title="Move down" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/move', from: i, to: i + 1 }); }}>↓</button>
                  <button className="mini-btn" title="Remove" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'playlist/removeItem', index: i }); }}>✕</button>
                </span>
              </li>
            );
          })}
          {!playlist?.items.length && <li className="empty">Use ＋ in the library to build a service order</li>}
        </ol>
      </section>
    </aside>
    {nameRequest && <NameDialog title={nameRequest.title} initialValue={nameRequest.initialValue} onSave={saveName} onClose={() => setNameRequest(null)} />}
    </>
  );
}
