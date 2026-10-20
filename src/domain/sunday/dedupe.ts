import type { Presentation } from '../types';
import { titleKey } from './songs';

/** A deck in the 찬양 라이브러리: a song from the church library, or one kept on this computer. */
export const isLibrarySong = (p: Presentation) => !!p.online || p.folder === 'Songs';

/**
 * Is `a` the newer copy of a song? Two stamped copies compare by time; otherwise a copy edited on
 * this computer beats the church library's, and between equals the later one in the list wins.
 */
function newer(a: Presentation, ai: number, b: Presentation, bi: number): boolean {
  if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  if (!!a.online !== !!b.online) return !a.online;
  return ai > bi;
}

/**
 * Songs with the same title (ignoring spacing, case and punctuation) become one: the newest copy
 * stays, the rest go. `replaced` maps each removed id to the id that stands in for it, so playlists
 * can follow.
 */
export function dedupeSongs(presentations: Presentation[]): { presentations: Presentation[]; replaced: Map<string, string> } {
  const best = new Map<string, number>();
  presentations.forEach((p, i) => {
    if (!isLibrarySong(p)) return;
    const k = titleKey(p.title);
    if (!k) return;
    const at = best.get(k);
    if (at === undefined || newer(p, i, presentations[at], at)) best.set(k, i);
  });
  const replaced = new Map<string, string>();
  const kept = presentations.filter((p, i) => {
    const k = isLibrarySong(p) ? titleKey(p.title) : '';
    const at = k ? best.get(k) : undefined;
    if (at === undefined || at === i) return true;
    replaced.set(p.id, presentations[at].id);
    return false;
  });
  return { presentations: kept, replaced };
}
