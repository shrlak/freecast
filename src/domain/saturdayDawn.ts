import type { Background, Library, Presentation } from './types';
import { isLibrarySong } from './sunday/dedupe';
import { isProtected } from './materialProtection';

/** Dates, spaces and file-name separators may surround the service name. */
export const isSaturdayDawnName = (name: string): boolean => /토요(?:일)?[\s_-]*새벽/.test(name.normalize('NFC'));

function imageIds(p: Presentation): Set<string> {
  const ids = new Set<string>();
  const background = (b: Background | undefined) => { if (b?.kind === 'media' && b.mediaType === 'image') ids.add(b.mediaId); };
  background(p.background);
  for (const s of p.slides) {
    background(s.background);
    for (const e of s.elements ?? []) if (e.kind === 'image' && e.mediaId) ids.add(e.mediaId);
  }
  return ids;
}

export function isSaturdayDawnImage(lib: Library, p: Presentation, playlistName: string): boolean {
  if (isProtected(p) || isLibrarySong(p) || p.songSource?.sections.length) return false;
  const images = imageIds(p);
  if (!images.size) return false;
  if (p.cleanupOnPlaylistRemoval === 'saturday-dawn') return true;
  if ([p.title, p.folder ?? '', ...p.slides.flatMap((s) => [s.group, s.importSource?.name ?? '']),
    ...lib.media.filter((m) => images.has(m.id)).map((m) => m.name)].some(isSaturdayDawnName)) return true;
  // An unnamed image in this service belongs to it; ordinary text/template decks do not.
  return isSaturdayDawnName(playlistName) && p.slides.length > 0 && p.slides.every((s) =>
    !s.text.trim() && !s.title?.trim() && !s.subtext?.trim() &&
    !s.elements?.some((e) => e.kind === 'text' && e.text?.trim()) &&
    ((s.background ?? p.background)?.kind === 'media' || s.elements?.some((e) => e.kind === 'image')));
}

/** Delete only images whose final playlist occurrence was just removed, including duplicated items. */
export function saturdayDawnImageCleanup(before: Library, after: Library): { remove: string[]; keep: string[] } {
  const used = new Set(after.playlists.flatMap((pl) => pl.items.flatMap((i) => i.kind === 'header' ? [] : [i.presentationId])));
  const presentations = new Map(after.presentations.map((p) => [p.id, p]));
  const removed = new Set<string>();
  const keep = new Set<string>();
  for (const pl of before.playlists) for (const item of pl.items) {
    if (item.kind === 'header') continue;
    const p = presentations.get(item.presentationId);
    if (p && isSaturdayDawnImage(before, p, pl.name)) (used.has(p.id) ? keep : removed).add(p.id);
  }
  return { remove: [...removed], keep: [...keep] };
}
