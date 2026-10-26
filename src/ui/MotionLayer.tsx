import { useEffect, useRef } from 'react';
import { motionFallback, safeColors, type MotionBackground } from '../domain/motion';
import { drawMotion, MOTION_H, MOTION_W } from '../domain/motionDraw';

const FRAME_MS = 33;

/**
 * A generated moving background. The still gradient shows at once (and is all that thumbnails get);
 * live windows draw the animation on a half-size canvas that the slide scales up. Time is the wall
 * clock, so the console preview and the output window move together.
 */
export function MotionLayer({ bg, animate }: { bg: MotionBackground; animate: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colors = safeColors(bg.style, bg.colors);
  const key = `${bg.style}|${colors.join()}|${bg.speed ?? 1}`;
  useEffect(() => {
    if (!animate) return;
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const spec: MotionBackground = { kind: 'motion', style: bg.style, colors, speed: bg.speed };
    let raf = 0, last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < FRAME_MS) return;
      last = now;
      drawMotion(ctx, MOTION_W, MOTION_H, (Date.now() % 86_400_000) / 1000, spec);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, key]);
  return (
    <div className="layer" style={{ background: motionFallback(bg) }}>
      {animate && <canvas ref={ref} className="layer media" width={MOTION_W} height={MOTION_H} />}
    </div>
  );
}
