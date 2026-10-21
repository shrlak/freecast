import { useEffect, useState } from 'react';
import type { Background, LiveState, Slide, Theme } from '../domain/types';
import { SlideCanvas } from '../ui/SlideCanvas';
import { liveCanvasProps } from '../ui/liveProps';
import { useRelay } from '../ui/hooks';

/** What the operator shares with remotes: the slides of the selected presentation, drawn the way they look on screen. */
export interface RemoteInfo {
  presentation: {
    id: string;
    title: string;
    theme: Theme;
    bgEffect: { dim: number; blur: number } | null;
    slides: { seq: number; slide: Slide; background: Background | null }[];
  } | null;
  cursorSeq: number | null;
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

  const pres = info?.presentation ?? null;
  // Everything after the live slide; before anything is live, the whole presentation.
  const upcoming = pres ? pres.slides.filter((s) => info!.cursorSeq == null || s.seq > info!.cursorSeq) : [];

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
      <div className="remote-current">
        {live?.slide ? <SlideCanvas {...liveCanvasProps(live)} /> : <div className="remote-empty">Nothing live</div>}
      </div>
      {pres && !!upcoming.length && (
        <section>
          <h3>{pres.title} · Up next</h3>
          <div className="remote-slides">
            {upcoming.map((s) => (
              <button key={s.seq} onClick={() => cmd({ type: 'live/go', presentationId: pres.id, seq: s.seq })}>
                <SlideCanvas slide={s.slide} theme={pres.theme} background={s.background} bgEffect={pres.bgEffect} />
                <span className="remote-slide-num">{s.seq + 1}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
