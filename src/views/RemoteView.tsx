import { Fragment, useEffect, useState } from 'react';
import type { Background, LiveState, Slide, Theme } from '../domain/types';
import { SlideCanvas } from '../ui/SlideCanvas';
import { liveCanvasProps } from '../ui/liveProps';
import { useRelay } from '../ui/hooks';

/** What the operator shares with remotes: every slide still to come (across the playlist), with what it needs to be drawn. */
export interface RemoteInfo {
  upcoming: {
    presentationId: string;
    seq: number;
    playlistIndex: number | null;
    title: string;
    /** First slide of a presentation other than the live one: start of a new section. */
    heading: boolean;
    themeId: string;
    bgEffect: { dim: number; blur: number } | null;
    slide: Slide;
    background: Background | null;
  }[];
  themes: Record<string, Theme>;
}

/** Phone/tablet remote: tap slides, next/prev, clear layers, run macros. Open /?view=remote on the same network, or the internet address from Settings. */
export function RemoteView() {
  const [pin, setPin] = useState(() => {
    // A scanned QR link carries the PIN: keep it, then take it out of the address bar.
    const fromLink = new URLSearchParams(location.search).get('pin');
    if (fromLink) {
      localStorage.setItem('freecast.pin', fromLink);
      history.replaceState(null, '', `${location.pathname}?view=remote`);
      return fromLink;
    }
    return localStorage.getItem('freecast.pin') ?? '';
  });
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
    const submit = (v: string) => {
      localStorage.setItem('freecast.pin', v);
      setError(null);
      setPin(v);
    };
    return (
      <div className="remote-root remote-pin">
        <h3>FreeCast Remote</h3>
        <p>{pin ? `${error}. Enter the PIN shown in FreeCast on the computer.` : 'Enter the PIN shown in FreeCast on the computer.'}</p>
        <input id="remote-pin" inputMode="numeric" autoFocus placeholder="PIN" defaultValue={pin} onKeyDown={(e) => {
          if (e.key === 'Enter') submit((e.target as HTMLInputElement).value.trim());
        }} />
        <button className="primary" onClick={() => submit((document.getElementById('remote-pin') as HTMLInputElement).value.trim())}>Connect</button>
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
      <div className="remote-show">
        <button className="primary" onClick={() => cmd({ type: 'show/start' })}>▶ Start slideshow</button>
        <button className="danger" onClick={() => cmd({ type: 'show/end' })}>■ End slideshow</button>
      </div>
      <div className="remote-nav">
        <button onClick={() => cmd({ type: 'live/prev' })}>◀</button>
        <button className="primary" onClick={() => cmd({ type: 'live/next' })}>▶</button>
      </div>
      <button className={`remote-black ${live?.black ? 'active' : ''}`} onClick={() => cmd({ type: 'live/toggleBlack' })}>
        {live?.black ? '■ Black screen on — tap to show slide' : '■ Black screen'}
      </button>
      <div className="remote-current">
        {live?.slide ? <SlideCanvas {...liveCanvasProps(live)} /> : <div className="remote-empty">Nothing live</div>}
      </div>
      {!!info?.upcoming.length && (
        <section>
          <h3>Up next</h3>
          <div className="remote-slides">
            {info.upcoming.map((u) => (
              <Fragment key={`${u.presentationId}:${u.seq}:${u.playlistIndex}`}>
                {u.heading && <div className="remote-section">{u.title}</div>}
                <button onClick={() => cmd({ type: 'live/go', presentationId: u.presentationId, seq: u.seq, playlistIndex: u.playlistIndex })}>
                  <SlideCanvas slide={u.slide} theme={info.themes[u.themeId]} background={u.background} bgEffect={u.bgEffect} />
                  <span className="remote-slide-num">{u.seq + 1}</span>
                </button>
              </Fragment>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
