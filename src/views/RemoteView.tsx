import { useEffect, useState } from 'react';
import type { LiveState } from '../domain/types';
import { useRelay } from '../ui/hooks';
import { stripChords } from '../domain/lyrics';

/** What the operator shares with remotes: the playlist and the slides of what is selected. */
export interface RemoteInfo {
  playlist: { index: number; title: string; header: boolean }[];
  playlistIndex: number | null;
  presentation: { id: string; title: string; slides: { seq: number; group: string; text: string }[] } | null;
  cursorSeq: number | null;
  macros: { id: string; name: string; color: string }[];
}

/** Phone/tablet remote: tap slides, next/prev, clear layers, run macros. Open /?view=remote on the same network. */
export function RemoteView() {
  const [pin, setPin] = useState(() => localStorage.getItem('freecast.pin') ?? '');
  const [live, setLive] = useState<LiveState | null>(null);
  const [info, setInfo] = useState<RemoteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { send, connected } = useRelay({ type: 'hello', role: 'remote', pin }, (m) => {
    if (m.type === 'state') setLive(m.state as LiveState);
    if (m.type === 'info') setInfo(m.info as RemoteInfo);
    if (m.type === 'error') setError(String(m.error));
  });
  useEffect(() => {
    document.title = 'FreeCast Remote';
  }, []);
  const cmd = (command: Record<string, unknown>) => send({ type: 'command', command });

  if (error) {
    return (
      <div className="remote-root remote-pin">
        <p>{error}</p>
        <input inputMode="numeric" placeholder="PIN" defaultValue={pin} onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const v = (e.target as HTMLInputElement).value;
            localStorage.setItem('freecast.pin', v);
            setError(null);
            setPin(v);
          }
        }} />
      </div>
    );
  }

  return (
    <div className="remote-root">
      <header className="remote-head">
        <strong>FreeCast</strong>
        <span className={`dot ${connected ? 'on' : ''}`} />
        <span className="muted small truncate">{live?.title ?? 'Nothing live'}</span>
      </header>
      <div className="remote-live">{live?.slide ? stripChords([live.slide.title, live.slide.text.replace(/\*\*/g, '')].filter(Boolean).join('\n')) : '—'}</div>
      <div className="remote-nav">
        <button onClick={() => cmd({ type: 'live/prev' })}>◀</button>
        <button className="primary" onClick={() => cmd({ type: 'live/next' })}>▶</button>
      </div>
      <div className="remote-clear">
        <button onClick={() => cmd({ type: 'live/clearAll' })}>Clear all</button>
        <button onClick={() => cmd({ type: 'live/clearText' })}>Text</button>
        <button onClick={() => cmd({ type: 'live/clearBackground' })}>BG</button>
        <button className={live?.black ? 'active' : ''} onClick={() => cmd({ type: 'live/toggleBlack' })}>Black</button>
      </div>
      {!!info?.macros.length && (
        <div className="remote-macros">
          {info.macros.map((m) => <button key={m.id} style={{ borderColor: m.color }} onClick={() => cmd({ type: 'macro/run', id: m.id })}>{m.name}</button>)}
        </div>
      )}
      {info?.presentation && (
        <section>
          <h3>{info.presentation.title}</h3>
          <div className="remote-slides">
            {info.presentation.slides.map((s) => (
              <button key={s.seq} className={s.seq === info.cursorSeq ? 'live' : ''} onClick={() => cmd({ type: 'live/go', presentationId: info.presentation!.id, seq: s.seq })}>
                <small>{s.group}</small>
                <span>{s.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {info && (
        <section>
          <h3>Playlist</h3>
          <div className="remote-playlist">
            {info.playlist.map((p) =>
              p.header ? <div key={p.index} className="remote-header">{p.title}</div> : (
                <button key={p.index} className={p.index === info.playlistIndex ? 'live' : ''} onClick={() => cmd({ type: 'playlist/select', index: p.index })}>{p.title}</button>
              ),
            )}
          </div>
        </section>
      )}
    </div>
  );
}
