// The EQ curve drawn on the strip editor, like the X32's EQ screen: the summed response of the low cut
// and the EQ bands, from the mixer's own 0–1 values. Bands are standard biquads (peaking, shelving,
// 2nd-order high/low pass) at 48 kHz; the low cut is a 12/18/24 dB/oct Butterworth high-pass.
import type { X32Values } from './x32';

const FS = 48000;
const logScale = (min: number, max: number, raw: number) => min * Math.pow(max / min, raw);

/** Frequencies the curve is evaluated at (log-spaced, 20 Hz – 20 kHz). */
export const CURVE_FREQS = Array.from({ length: 121 }, (_, i) => 20 * Math.pow(1000, i / 120));

type Biquad = [number, number, number, number, number, number];

/** RBJ cookbook biquad for an X32 band type (0 low cut, 1 low shelf, 2 PEQ, 3 VEQ, 4 high shelf, 5 high cut). */
function biquad(type: number, f: number, gainDb: number, q: number): Biquad {
  const w = (2 * Math.PI * Math.min(f, FS / 2 - 1)) / FS;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = Math.pow(10, gainDb / 40);
  const sq = 2 * Math.sqrt(A) * alpha;
  switch (type) {
    case 0: return [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    case 5: return [(1 - cos) / 2, 1 - cos, (1 - cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
    case 1: return [A * (A + 1 - (A - 1) * cos + sq), 2 * A * (A - 1 - (A + 1) * cos), A * (A + 1 - (A - 1) * cos - sq), A + 1 + (A - 1) * cos + sq, -2 * (A - 1 + (A + 1) * cos), A + 1 + (A - 1) * cos - sq];
    case 4: return [A * (A + 1 + (A - 1) * cos + sq), -2 * A * (A - 1 + (A + 1) * cos), A * (A + 1 + (A - 1) * cos - sq), A + 1 - (A - 1) * cos + sq, 2 * (A - 1 - (A + 1) * cos), A + 1 - (A - 1) * cos - sq];
    default: return [1 + alpha * A, -2 * cos, 1 - alpha * A, 1 + alpha / A, -2 * cos, 1 - alpha / A];
  }
}

/** |H(f)| of a biquad, in dB. */
function biquadDb([b0, b1, b2, a0, a1, a2]: Biquad, f: number): number {
  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);

/**
 * The response of a strip's low cut and EQ in dB at each of CURVE_FREQS (0 dB where nothing is on).
 * `bands` is 4 for channels and aux in, 6 for buses and main.
 */
export function eqCurve(id: string, values: X32Values, bands: number): number[] {
  const at = (k: string) => values[`/${id}/${k}`];
  const filters: Biquad[] = [];
  if (at('eq/on') === 1) {
    for (let b = 1; b <= bands; b++) {
      const type = num(at(`eq/${b}/type`), 2);
      const f = logScale(20, 20000, num(at(`eq/${b}/f`), 0.5));
      const g = -15 + 30 * num(at(`eq/${b}/g`), 0.5);
      const q = logScale(10, 0.3, num(at(`eq/${b}/q`), 0.5));
      if ((type === 2 || type === 3 || type === 1 || type === 4) && Math.abs(g) < 0.05) continue;
      filters.push(biquad(type, f, g, q));
    }
  }
  const lowCut = at('preamp/hpon') === 1;
  const hpf = logScale(20, 400, num(at('preamp/hpf'), 0));
  const order = [2, 3, 4][num(at('preamp/hpslope'), 0)] ?? 2;
  return CURVE_FREQS.map((f) => {
    let db = filters.reduce((sum, bq) => sum + biquadDb(bq, f), 0);
    if (lowCut) db += -10 * Math.log10(1 + Math.pow(hpf / f, 2 * order));
    return Math.max(-40, Math.min(20, db));
  });
}
