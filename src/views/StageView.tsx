import { useEffect } from 'react';
import type { StageLayout } from '../domain/types';
import { useLiveFeed, useNow } from '../ui/hooks';
import { formatClock, timerValue } from '../domain/timers';
import { chordRows, hasChords, stripChords } from '../domain/lyrics';
import { DEFAULT_STAGE_LAYOUTS } from '../domain/defaults';
import { SlideCanvas } from '../ui/SlideCanvas';
import { liveCanvasProps } from '../ui/liveProps';

/** Lyrics with chords drawn above each line (ChordPro-style inline chords). */
function ChordText({ text }: { text: string }) {
  if (!hasChords(text)) return <>{text}</>;
  return (
    <div className="chord-text">
      {text.split('\n').map((line, i) => {
        const r = chordRows(line);
        return <div key={i}><div className="chord-row">{r.chords || ' '}</div><div>{r.lyric}</div></div>;
      })}
    </div>
  );
}

/**
 * Confidence monitor. `?layout=<id>` picks a stage layout (edit them in 🖥 Screens):
 * clock, timers, current/next slide, notes, live screen preview, chords, video countdown.
 */
export function StageView() {
  const live = useLiveFeed();
  const now = useNow(250);
  const id = new URLSearchParams(location.search).get('layout') ?? 'lyrics';
  useEffect(() => {
    document.title = 'FreeCast — Stage';
  }, []);

  const layouts = (live as { stageLayouts?: StageLayout[] } | null)?.stageLayouts ?? DEFAULT_STAGE_LAYOUTS;
  const L = layouts.find((l) => l.id === id) ?? DEFAULT_STAGE_LAYOUTS.find((l) => l.id === id) ?? DEFAULT_STAGE_LAYOUTS[0];
  const clock = new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const running = (live?.timers ?? []).filter((t) => t.running || t.kind === 'countdownTo');
  const slide = live?.slide;
  const current = slide ? [slide.title, slide.text.replace(/\*\*/g, '')].filter(Boolean).join('\n') : null;
  const videoLeft = live?.video.endsAt ? live.video.endsAt - now : null;
  const onlyClock = !L.current && !L.next && !L.notes && !L.preview;

  return (
    <div className="stage-root" style={{ fontSize: `${L.scale * 100}%` }}>
      <header className="stage-top">
        {L.clock && <span className="stage-clock">{clock}</span>}
        <span className="stage-title">{live?.title ?? ''}{slide?.group ? ` · ${slide.group}` : ''}</span>
        {L.videoCountdown && videoLeft != null && videoLeft > 0 && <span className="stage-timer"><small>Video</small> {formatClock(-videoLeft)}</span>}
        {L.timers && running.slice(0, 3).map((t) => {
          const v = timerValue(t, now);
          return <span key={t.id} className={`stage-timer ${v < 0 && t.kind !== 'elapsed' ? 'over' : ''}`}><small>{t.name}</small> {formatClock(v)}</span>;
        })}
      </header>
      {onlyClock ? (
        <section className="stage-big-clock">
          <div>{clock}</div>
          {running[0] && <div className="stage-big-timer">{formatClock(timerValue(running[0], now))}</div>}
        </section>
      ) : (
        <div className={`stage-body ${L.preview ? 'with-preview' : ''}`}>
          {L.preview && live && <div className="stage-preview"><SlideCanvas {...liveCanvasProps(live)} /></div>}
          <div className="stage-text">
            {L.current && <section className="stage-current">{current ? (L.chords ? <ChordText text={current} /> : stripChords(current)) : <span className="dim">—</span>}</section>}
            {L.notes && <section className="stage-next stage-notes"><label>Notes</label><div>{slide?.notes || <span className="dim">No notes</span>}</div></section>}
            {L.next && <section className="stage-next"><label>Next</label><div>{live?.nextText ? stripChords(live.nextText.replace(/\*\*/g, '')) : <span className="dim">End</span>}</div></section>}
          </div>
        </div>
      )}
      {live?.stageMessage && <footer className="stage-message stage-only">🎤 {live.stageMessage}</footer>}
      {live?.message && <footer className="stage-message">{live.message}</footer>}
    </div>
  );
}
