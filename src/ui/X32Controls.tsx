import { useRef, type KeyboardEvent, type PointerEvent, type WheelEvent } from 'react';
import { CURVE_FREQS } from '../domain/eqCurve';
import { FADER_MARKS } from '../domain/x32';

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Shared drag / wheel / arrow-key handling for faders and knobs (vertical movement changes the value). */
function useDrag(value: number, onChange: (v: number) => void, pixels: number, steps?: number) {
  const start = useRef<{ y: number; value: number } | null>(null);
  const snap = (v: number) => (steps ? Math.round(clamp(v) * (steps - 1)) / (steps - 1) : clamp(v));
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      start.current = { y: e.clientY, value };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (!start.current) return;
      const next = snap(start.current.value + (start.current.y - e.clientY) / pixels);
      if (next !== value) onChange(next);
    },
    onPointerUp: () => { start.current = null; },
    onPointerCancel: () => { start.current = null; },
    onWheel: (e: WheelEvent<HTMLElement>) => {
      const step = steps ? 1 / (steps - 1) : 0.01;
      onChange(snap(value + (e.deltaY < 0 ? step : -step)));
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const step = steps ? 1 / (steps - 1) : e.shiftKey ? 0.05 : 0.01;
      const delta = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (delta == null) return;
      e.preventDefault();
      onChange(snap(value + delta));
    },
  };
}

/** A console fader: long vertical travel with the dB scale printed beside it, as on the X32 surface. */
export function Fader({ value, onChange, label, readout }: { value: number; onChange: (v: number) => void; label: string; readout: string }) {
  const drag = useDrag(value, onChange, 180);
  return (
    <div className="x32-fader" role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={value} aria-valuetext={readout} {...drag}
      onDoubleClick={() => onChange(0.75)} title={`${label} — 더블클릭: 0 dB`}>
      <div className="x32-fader-scale" aria-hidden>
        {FADER_MARKS.map((m) => <span key={m.label} style={{ bottom: `${m.at * 100}%` }}>{m.label}</span>)}
      </div>
      <div className="x32-fader-track" aria-hidden>
        <div className="x32-fader-cap" style={{ bottom: `${value * 100}%` }} />
      </div>
    </div>
  );
}

/** A console encoder with its LED ring; drag up/down, scroll, or use the arrow keys. */
export function Knob({ value, onChange, label, readout, steps, bipolar, disabled }: {
  value: number | undefined; onChange: (v: number) => void; label: string; readout: string; steps?: number; bipolar?: boolean; disabled?: boolean;
}) {
  const v = value ?? 0;
  const drag = useDrag(v, onChange, 150, steps);
  const leds = 13;
  const lit = (i: number) => {
    const at = i / (leds - 1);
    if (value === undefined) return false;
    return bipolar ? (v >= 0.5 ? at >= 0.5 && at <= v + 1e-6 : at <= 0.5 && at >= v - 1e-6) : at <= v + 1e-6;
  };
  // 270° sweep from bottom-left to bottom-right.
  const angle = -135 + v * 270;
  return (
    <div className={`x32-knob ${disabled ? 'off' : ''}`}>
      <div className="x32-knob-dial" role="slider" tabIndex={disabled ? -1 : 0} aria-label={label} aria-valuemin={0} aria-valuemax={1} aria-valuenow={v} aria-valuetext={readout} aria-disabled={disabled}
        {...(disabled ? {} : drag)}>
        <svg viewBox="0 0 64 64" aria-hidden>
          {Array.from({ length: leds }, (_, i) => {
            const a = ((-135 + (i / (leds - 1)) * 270) * Math.PI) / 180;
            return <circle key={i} cx={32 + 27 * Math.sin(a)} cy={32 - 27 * Math.cos(a)} r={2.4} className={lit(i) ? 'led on' : 'led'} />;
          })}
          <circle cx="32" cy="32" r="18" className="cap" />
          <line x1="32" y1="32" x2={32 + 15 * Math.sin((angle * Math.PI) / 180)} y2={32 - 15 * Math.cos((angle * Math.PI) / 180)} className="pointer" />
        </svg>
      </div>
      <span className="x32-knob-label">{label}</span>
      <span className="x32-knob-value">{readout}</span>
    </div>
  );
}

/** A lit console button (MUTE, SEL, ON…). */
export function LitButton({ on, onClick, children, tone = 'green', disabled, title }: {
  on: boolean; onClick: () => void; children: string; tone?: 'red' | 'green' | 'yellow' | 'blue'; disabled?: boolean; title?: string;
}) {
  return <button type="button" className={`x32-btn ${tone} ${on ? 'lit' : ''}`} aria-pressed={on} disabled={disabled} title={title} onClick={onClick}>{children}</button>;
}

/** The EQ screen: response curve over a log frequency grid (±20 dB). */
export function EqGraph({ curve, active }: { curve: number[]; active: boolean }) {
  const W = 600, H = 160;
  const x = (f: number) => (Math.log10(f / 20) / 3) * W;
  const y = (db: number) => H / 2 - (db / 20) * (H / 2 - 6);
  const path = curve.map((db, i) => `${i ? 'L' : 'M'}${x(CURVE_FREQS[i]).toFixed(1)},${y(db).toFixed(1)}`).join(' ');
  return (
    <svg className={`x32-eq-graph ${active ? '' : 'inactive'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="EQ 곡선">
      {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((f) => <line key={f} x1={x(f)} x2={x(f)} y1={0} y2={H} className="grid" />)}
      {[-15, -10, -5, 5, 10, 15].map((db) => <line key={db} x1={0} x2={W} y1={y(db)} y2={y(db)} className="grid" />)}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="zero" />
      {[100, 1000, 10000].map((f) => <text key={f} x={x(f) + 3} y={H - 4} className="label">{f >= 1000 ? `${f / 1000}k` : f}</text>)}
      <path d={`${path} L${W},${H} L0,${H} Z`} className="fill" />
      <path d={path} className="curve" />
    </svg>
  );
}
