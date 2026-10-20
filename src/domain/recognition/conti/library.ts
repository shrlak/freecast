// The 찬양 라이브러리 as the ppt site's recognition sees it: the bundled library.json with the shared
// library (the church Worker's /libraries/lyrics) merged over it (mergeLibraries — a draft never
// hides a bundled song), plus songs saved on this computer only, for titles neither holds.
import type { Presentation } from '../../types';
import type { LibraryEntry } from '../utils/types';
import { contentServer, fetchSharedSongs } from '../../online';
import { mergeLibraries, normalizeTitle, sanitizeLibraryEntries } from '../storage/library';

async function fetchBundled(): Promise<LibraryEntry[]> {
  try {
    const r = await fetch(new URL('library.json', contentServer()).toString(), { cache: 'no-cache' });
    return r.ok ? sanitizeLibraryEntries(await r.json()) : [];
  } catch {
    return [];
  }
}

/** This computer's own songs (saved from the song editor), as library entries. */
export function localEntries(presentations: Presentation[]): LibraryEntry[] {
  return presentations
    .filter((p) => !p.online && p.songSource?.sections.length)
    .map((p) => ({ title: p.title, key: p.meta?.key, sections: p.songSource!.sections, order: p.songSource!.order ?? [], verification: 'verified' as const }));
}

export async function loadRecognitionLibrary(presentations: Presentation[]): Promise<LibraryEntry[]> {
  const [bundled, shared] = await Promise.all([fetchBundled(), fetchSharedSongs()]);
  const merged = mergeLibraries(bundled, sanitizeLibraryEntries(shared?.entries ?? []));
  const known = new Set(merged.map((e) => normalizeTitle(e.title)));
  return [...merged, ...localEntries(presentations).filter((e) => !known.has(normalizeTitle(e.title)))];
}
