import type { Library, Presentation } from './types';
import { isSong } from './templates/fill';
import { parseKey, playKeyOf } from './chordChart';

const WEEK = 7 * 24 * 3600 * 1000;

export interface SongStat {
  id: string;
  title: string;
  key: string | null;
  total: number;
  /** Times shown in the last `weeks` weeks. */
  recent: number;
  lastAt: number | null;
  weeksSince: number | null;
}

export function songStats(lib: Library, now: number, weeks = 8): SongStat[] {
  // The online library (hundreds of songs this church never chose) would drown out its own songs.
  const songs = lib.presentations.filter((p) => isSong(p) && !p.online);
  const stats = new Map<string, SongStat>(songs.map((p) => [p.id, { id: p.id, title: p.title, key: playKeyOf(p), total: 0, recent: 0, lastAt: null, weeksSince: null }]));
  for (const u of lib.usage) {
    const s = stats.get(u.presentationId);
    if (!s) continue;
    s.total++;
    if (now - u.at <= weeks * WEEK) s.recent++;
    if (s.lastAt == null || u.at > s.lastAt) s.lastAt = u.at;
  }
  for (const s of stats.values()) s.weeksSince = s.lastAt == null ? null : Math.max(0, Math.floor((now - s.lastAt) / WEEK));
  return [...stats.values()].sort((a, b) => b.total - a.total || a.title.localeCompare(b.title));
}

export interface Recommendation { stat: SongStat; score: number; reason: string }

/**
 * Songs worth putting in the next set: well-loved ones that have rested a while, then songs never used.
 * Anything sung within `restWeeks` is left out, as is anything already in `exclude` (the set being built).
 */
export function recommendSongs(lib: Library, now: number, opts: { restWeeks?: number; limit?: number; exclude?: Iterable<string> } = {}): Recommendation[] {
  const rest = opts.restWeeks ?? 4;
  const skip = new Set(opts.exclude ?? []);
  const maxTotal = Math.max(1, ...songStats(lib, now).map((s) => s.total));
  const out: Recommendation[] = [];
  for (const stat of songStats(lib, now, rest)) {
    if (skip.has(stat.id) || stat.recent > 0) continue;
    if (stat.weeksSince == null) out.push({ stat, score: 0.4, reason: '아직 한 번도 부르지 않은 곡' });
    else out.push({ stat, score: 0.5 + 0.3 * (stat.total / maxTotal) + 0.2 * Math.min(stat.weeksSince, 26) / 26, reason: `${stat.weeksSince}주 쉬었고 지금까지 ${stat.total}번 불렀어요` });
  }
  return out.sort((a, b) => b.score - a.score || a.stat.title.localeCompare(b.stat.title)).slice(0, opts.limit ?? 10);
}

export interface KeyIssue { index: number; from: string; to: string; kind: 'same' | 'far' }

/** Distance in semitones between two keys, going the shorter way round. */
export function keyDistance(a: string, b: string): number | null {
  const x = parseKey(a), y = parseKey(b);
  if (!x || !y) return null;
  const d = Math.abs(x.root - y.root) % 12;
  return Math.min(d, 12 - d);
}

/** Songs back to back in the same key, or a jump the singers will feel (more than 5 semitones). */
export function keyFlowIssues(lib: Library, playlistId: string | null): KeyIssue[] {
  const pl = lib.playlists.find((p) => p.id === playlistId);
  if (!pl) return [];
  const songs: Presentation[] = [];
  for (const item of pl.items) {
    if (item.kind === 'header') continue;
    const p = lib.presentations.find((x) => x.id === item.presentationId);
    if (p && isSong(p)) songs.push(p);
  }
  const issues: KeyIssue[] = [];
  for (let i = 1; i < songs.length; i++) {
    const a = playKeyOf(songs[i - 1]), b = playKeyOf(songs[i]);
    const d = a && b ? keyDistance(a, b) : null;
    if (a && b && d === 0) issues.push({ index: i, from: songs[i - 1].title, to: songs[i].title, kind: 'same' });
    else if (a && b && d != null && d > 5) issues.push({ index: i, from: songs[i - 1].title, to: songs[i].title, kind: 'far' });
  }
  return issues;
}
