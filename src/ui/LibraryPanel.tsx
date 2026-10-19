import { useState, type Dispatch } from 'react';
import type { AppState, Action } from '../domain/reducer';
import { activePlaylist } from '../domain/live';
import { uid } from '../domain/lyrics';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onNew: () => void;
  online: { status: 'loading' | 'ok' | 'error'; count: number; error?: string };
  onReloadOnline: () => void;
}

export function LibraryPanel({ state, dispatch, onNew, online, onReloadOnline }: Props) {
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

  return (
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
            <button className="mini-btn" title="New playlist" onClick={() => {
              const name = prompt('Playlist name', 'New playlist');
              if (name) dispatch({ type: 'playlist/create', playlist: { id: uid('pl'), name, items: [] } });
            }}>＋</button>
            <button className="mini-btn" title="Add section header" onClick={() => {
              const title = prompt('Header title', 'Section');
              if (title) dispatch({ type: 'playlist/addItem', item: { id: uid('pli'), kind: 'header', title } });
            }}>H</button>
            <button className="mini-btn" title="Duplicate as template (e.g. next week's service)" onClick={() => {
              const name = playlist && prompt('Name for the copy', `${playlist.name} copy`);
              if (name && playlist) dispatch({ type: 'playlist/duplicate', id: playlist.id, newId: uid('pl'), name });
            }}>⧉</button>
            <button className="mini-btn" title="Rename playlist" onClick={() => {
              const name = playlist && prompt('Rename playlist', playlist.name);
              if (name && playlist) dispatch({ type: 'playlist/rename', id: playlist.id, name });
            }}>✎</button>
            <button className="mini-btn" title="Delete playlist" disabled={playlists.length <= 1} onClick={() => playlist && confirm(`Delete playlist “${playlist.name}”?`) && dispatch({ type: 'playlist/delete', id: playlist.id })}>🗑</button>
          </div>
        </div>
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
                <span className="truncate">{title}</span>
                <span className="row gap-xs item-actions">
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
  );
}
