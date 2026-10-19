import { useEffect } from 'react';
import { SlideCanvas } from '../ui/SlideCanvas';
import { useLiveFeed } from '../ui/hooks';
import { liveCanvasProps } from '../ui/liveProps';

/** Operator multiview: every screen's output side by side, plus what is live and next. */
export function MultiView() {
  const live = useLiveFeed();
  useEffect(() => {
    document.title = 'FreeCast — Multiview';
  }, []);
  if (!live) return <div className="output-root waiting">Waiting for the FreeCast console…</div>;
  return (
    <div className="multiview">
      {live.screens.map((s) => (
        <figure key={s.id}>
          <div className={s.key === 'transparent' ? 'checker' : ''}><SlideCanvas {...liveCanvasProps(live, s)} /></div>
          <figcaption>{s.name}</figcaption>
        </figure>
      ))}
      <figure className="multiview-info">
        <div>
          <strong>{live.title ?? 'Nothing live'}</strong>
          <p>{live.slide?.text.replace(/\*\*/g, '') ?? '—'}</p>
          <small>Next</small>
          <p className="muted">{live.nextText ?? '—'}</p>
          {live.stageMessage && <p>🎤 {live.stageMessage}</p>}
        </div>
        <figcaption>Status</figcaption>
      </figure>
    </div>
  );
}
