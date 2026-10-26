import type { Library } from './types';
import { sequence } from './arrangement';
import { findPres, type Cursor } from './live';
import { stripChords } from './lyrics';

/** Letters and digits only, so spacing, punctuation and chord marks never matter. */
export const followKey = (text: string): string => stripChords(text).replace(/\*\*/g, '').replace(/[^0-9a-zㄱ-ㆎ가-힣]/gi, '').toLowerCase();

function bigrams(key: string): Map<string, number> {
  const out = new Map<string, number>();
  const grams = key.length < 2 ? [key] : Array.from({ length: key.length - 1 }, (_, i) => key.slice(i, i + 2));
  for (const g of grams) if (g) out.set(g, (out.get(g) ?? 0) + 1);
  return out;
}

/** Sørensen–Dice overlap (0–1) of the character pairs in two texts. */
export function dice(a: string, b: string): number {
  const x = bigrams(a), y = bigrams(b);
  let shared = 0, total = 0;
  for (const n of x.values()) total += n;
  for (const n of y.values()) total += n;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  return total ? (2 * shared) / total : 0;
}

/**
 * How well what was just sung matches a slide: the slide's own length of the most recent words is compared,
 * so earlier lines of the song do not drag the score down.
 */
export function matchScore(spoken: string, slideText: string): number {
  const target = followKey(slideText);
  const heard = followKey(spoken);
  if (target.length < 4 || heard.length < 4) return 0;
  const tail = heard.slice(-Math.ceil(target.length * 1.15));
  return dice(tail, target);
}

export interface FollowSuggestion {
  /** Position in the presentation's play sequence. */
  seq: number;
  score: number;
  /** How far ahead of the slide on screen it is (1 = the next slide). */
  ahead: number;
}

export const FOLLOW_MIN_HEARD = 8;
export const FOLLOW_SUGGEST = 0.55;
export const FOLLOW_AUTO = 0.75;
const LOOK_AHEAD = 3;

/**
 * The slide the singing has reached, when it is clearly past the one on screen.
 * Only the next few slides of the same song are considered, and the match must beat the current slide.
 */
export function suggestSlide(library: Library, at: Cursor | null, spoken: string): FollowSuggestion | null {
  if (!at || followKey(spoken).length < FOLLOW_MIN_HEARD) return null;
  const p = findPres(library, at.presentationId);
  if (!p) return null;
  const seq = sequence(p);
  const current = seq[at.seq] ? matchScore(spoken, `${seq[at.seq].slide.title ?? ''}${seq[at.seq].slide.text}`) : 0;
  let best: FollowSuggestion | null = null;
  for (let ahead = 1; ahead <= LOOK_AHEAD; ahead++) {
    const item = seq[at.seq + ahead];
    if (!item || item.slide.disabled) continue;
    const score = matchScore(spoken, `${item.slide.title ?? ''}${item.slide.text}`);
    if (score >= FOLLOW_SUGGEST && score > current + 0.1 && (!best || score > best.score)) best = { seq: at.seq + ahead, score, ahead };
  }
  return best;
}

/** Automatic advance is stricter than a suggestion, and never fires twice within the cooldown. */
export function shouldAutoAdvance(s: FollowSuggestion | null, lastAdvanceAt: number, now: number, cooldownMs = 4000): boolean {
  return !!s && s.score >= FOLLOW_AUTO && s.ahead === 1 && now - lastAdvanceAt >= cooldownMs;
}
