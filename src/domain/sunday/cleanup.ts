// A 주일예배 is only needed until its Sunday service ends (5 pm). After that its playlist and the
// decks made for it (the folder "MMDD 주일예배") are removed — and, since the library is kept in step
// with the church server, they disappear from the server too.
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
  const done = lib.playlists.filter((pl) => {
    const end = serviceEnd(pl.name, now);
    return !!end && now.getTime() >= end.getTime();
  });
  const doneIds = new Set(done.map((pl) => pl.id));
  const folders = new Set(done.map((pl) => pl.name));
  const usedElsewhere = new Set(
    lib.playlists.filter((pl) => !doneIds.has(pl.id)).flatMap((pl) => pl.items.flatMap((i) => (i.kind === 'header' ? [] : [i.presentationId]))),
  );
  const presentationIds = lib.presentations
    .filter((p) => !p.online && p.folder && folders.has(p.folder) && !usedElsewhere.has(p.id))
    .map((p) => p.id);
  // Media only the removed decks use (anything else — other decks, themes, props — still needs it).
  const gone = new Set(presentationIds);
  const mentions = (text: string, id: string) => text.includes(`"${id}"`);
  const removedText = JSON.stringify(lib.presentations.filter((p) => gone.has(p.id)));
  const keptText = JSON.stringify({ ...lib, media: [], playlists: [], presentations: lib.presentations.filter((p) => !gone.has(p.id)) });
  const mediaIds = lib.media.filter((m) => mentions(removedText, m.id) && !mentions(keptText, m.id)).map((m) => m.id);
  return { playlistIds: done.map((pl) => pl.id), presentationIds, mediaIds };
}
