// A 주일예배 is only needed until its Sunday service ends (5 pm). After that its playlist and the
// decks made for it (the folder "MMDD 주일예배") are removed — and, since the library is kept in step
// with the church server, they disappear from the server too.
import { isLibrarySong } from './dedupe';
import { exclusivePresentationMedia } from '../mediaCleanup';
import type { Library } from '../types';
import { SERVICE_END_HOUR } from './notice';

const SERVICE_NAME = /^(\d{2})(\d{2}) 주일예배$/;

/** When the service named "MMDD 주일예배" ends: 5 pm that day, in the year nearest to `now`. */
export function serviceEnd(name: string, now: Date): Date | null {
  const m = SERVICE_NAME.exec(name);
  if (!m) return null;
  const [month, day] = [+m[1], +m[2]];
  let best: Date | null = null;
  for (const year of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const end = new Date(year, month - 1, day, SERVICE_END_HOUR);
    if (end.getMonth() !== month - 1) continue;
    if (!best || Math.abs(end.getTime() - now.getTime()) < Math.abs(best.getTime() - now.getTime())) best = end;
  }
  return best;
}

export interface ServiceCleanup {
  playlistIds: string[];
  presentationIds: string[];
  /** Slide images/videos only the removed decks use. */
  mediaIds: string[];
}

/**
 * The finished 주일예배 playlists and their decks. A deck stays when another (unfinished or
 * ordinary) playlist still uses it, so the shared Front / Back / 기도 decks are never lost.
 */
export function finishedServices(lib: Library, now: Date): ServiceCleanup {
  return deletedServices(lib, lib.playlists.filter((pl) => {
    const end = serviceEnd(pl.name, now);
    return !!end && now.getTime() >= Math.max(end.getTime(), Number.isFinite(pl.autoDeleteAfter) ? pl.autoDeleteAfter! : 0);
  }).map((p) => p.id));
}

export const isServicePlaylist = (name: string): boolean => SERVICE_NAME.test(name);

/** Manual and automatic service deletion share the same ownership rules. */
export function deletedServices(lib: Library, playlistIds: string[]): ServiceCleanup {
  const done = lib.playlists.filter((pl) => playlistIds.includes(pl.id) && isServicePlaylist(pl.name));
  const doneIds = new Set(done.map((pl) => pl.id));
  const folders = new Set(done.map((pl) => pl.name));
  const usedElsewhere = new Set(
    lib.playlists.filter((pl) => !doneIds.has(pl.id)).flatMap((pl) => pl.items.flatMap((i) => (i.kind === 'header' ? [] : [i.presentationId]))),
  );
  const presentationIds = lib.presentations
    .filter((p) => !isLibrarySong(p) && p.folder && folders.has(p.folder) && !usedElsewhere.has(p.id))
    .map((p) => p.id);
  const mediaIds = exclusivePresentationMedia(lib, presentationIds);
  return { playlistIds: done.map((pl) => pl.id), presentationIds, mediaIds };
}

/** One skipped cleanup cycle: the Sunday after this service (or the next Sunday if already over). */
export function nextServiceCleanup(name: string, now: Date): number {
  const end = serviceEnd(name, now);
  if (end && end.getTime() >= now.getTime()) {
    const next = new Date(end); next.setDate(next.getDate() + 7); return next.getTime();
  }
  const next = new Date(now); next.setHours(SERVICE_END_HOUR, 0, 0, 0);
  next.setDate(next.getDate() + ((7 - next.getDay()) % 7));
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 7);
  return next.getTime();
}
