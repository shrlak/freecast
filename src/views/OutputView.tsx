import { useEffect } from 'react';
import { SlideCanvas } from '../ui/SlideCanvas';
import { CANVAS_W } from '../domain/canvas';
import { useLiveFeed } from '../ui/hooks';
import { liveCanvasProps } from '../ui/liveProps';
import { openLiveChannel } from '../domain/sync';

/**
 * Audience output. Open it on the projector screen and press F (or double-click) for fullscreen.
 * Keys pressed here (arrows, Space, Esc…) are passed to the console, so a show on a single screen still runs.
 * `?screen=<id>` picks a screen configuration (e.g. lyrics only on chroma green).
 */
export function OutputView() {
  const live = useLiveFeed();
  const screenId = new URLSearchParams(location.search).get('screen');
  const screen = live?.screens.find((s) => s.id === screenId) ?? live?.screens[0];

  useEffect(() => {
    document.title = `FreeCast — ${screen?.name ?? 'Output'}`;
    document.body.classList.toggle('transparent', screen?.key === 'transparent');
  }, [screen?.name, screen?.key]);

  useEffect(() => {
    const toggle = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => undefined);
    };
    const ch = openLiveChannel(() => undefined);
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 'f') return toggle();
      // Every other key drives the show from the console, like PowerPoint's slide show window.
      e.preventDefault();
      ch.post({ type: 'key', key: e.key, shiftKey: e.shiftKey });
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dblclick', toggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dblclick', toggle);
      ch.close();
    };
  }, []);

  if (!live) return <div className="output-root waiting">Waiting for the FreeCast console…</div>;
  const bg = screen?.key === 'transparent' ? 'transparent' : screen?.key === 'green' ? '#00b140' : '#000';
  const edge = screen?.edge && screen.edge.part !== 'none' ? screen.edge : null;
  if (edge) {
    // Each projector shows half the picture plus the overlap; the overlap fades out so the two blend.
    const half = CANVAS_W / 2;
    const regionW = half + edge.overlap / 2;
    const x = edge.part === 'left' ? 0 : half - edge.overlap / 2;
    const scale = CANVAS_W / regionW;
    return (
      <div className="output-root edge-root" style={{ background: bg }}>
        <div className="edge-view">
          <div style={{ width: `${scale * 100}%`, transform: `translateX(${(-x / CANVAS_W) * 100}%)` }}>
            <SlideCanvas {...liveCanvasProps(live, screen)} />
          </div>
          <div className={`edge-fade ${edge.part}`} style={{ width: `${(edge.overlap / regionW) * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <div className="output-root" style={{ background: bg }}>
      <SlideCanvas {...liveCanvasProps(live, screen)} className="output-canvas" />
    </div>
  );
}
