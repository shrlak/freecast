// Online content: the 찬양 라이브러리 and Bible texts are read from a server each session
// and kept in memory only — nothing is stored on the computer.
import type { Presentation, Slide } from './types';
import { uid } from './lyrics';
import { songToPresentation, titleKey, type SongDraft } from './sunday/songs';
import { CHURCH_BACKGROUNDS } from './defaults';

/** Default server: the church's GitHub repo (public/ folder). Any server with the same files works. */
export const DEFAULT_SERVER = 'https://raw.githubusercontent.com/shrlak/ppt/main/public/';
const KEY = 'freecast.contentServer';
export const ONLINE_FOLDER = '☁ 찬양 라이브러리';

export function contentServer(): string {
  let url = DEFAULT_SERVER;
  try {
    url = localStorage.getItem(KEY) || DEFAULT_SERVER;
  } catch {
    // storage blocked
  }
  return url.endsWith('/') ? url : `${url}/`;
}

export function setContentServer(url: string | null) {
  const v = url?.trim();
  if (v && !/^https?:\/\//i.test(v)) throw new Error('The server address must start with https://');
  if (v) localStorage.setItem(KEY, v);
  else localStorage.removeItem(KEY);
}

async function getJson<T>(path: string): Promise<T> {
  const url = new URL(path, contentServer()).toString();
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`Server returned ${r.status} for ${path}`);
  return r.json() as Promise<T>;
}

/** Stable id so playlists can keep referring to an online song across sessions. */
export const onlineId = (title: string) => `online:${titleKey(title)}`;

/** One song as the church library stores it (library.json and the Worker's /libraries/lyrics). */
export interface LibrarySong { title: string; key?: string; sections: { label: string; lines: string[] }[]; order?: string[]; verification?: string; updatedAt?: string }
interface RetreatSong { title: string; slides: string[][] }

/**
 * The 찬양 라이브러리 the ppt site registers songs into (the church Worker), through this app's
 * server. Null when it cannot be reached — the bundled library.json is used alone then.
 */
export async function fetchSharedSongs(): Promise<{ entries: LibrarySong[]; deletedTitles: string[] } | null> {
  try {
    const r = await fetch('/api/songs', { headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const d = (await r.json()) as { entries?: LibrarySong[]; deletedTitles?: string[] };
    return { entries: Array.isArray(d.entries) ? d.entries : [], deletedTitles: Array.isArray(d.deletedTitles) ? d.deletedTitles : [] };
  } catch {
    return null;
  }
}

/**
 * The song library as the ppt site sees it: the bundled library.json with the songs registered in the
 * shared library on top (a registered song replaces the bundled one of the same title; deleted titles
 * are left out), plus retreat-songs.json — as read-only presentations.
 */
export async function fetchOnlineSongs(linesPerSlide: number): Promise<Presentation[]> {
  const seen = new Set<string>();
  const out: Presentation[] = [];
  const opts = { themeId: 'theme_sunday', linesPerSlide, folder: ONLINE_FOLDER };
  const background = CHURCH_BACKGROUNDS.watercolor;
  const [bundled, shared] = await Promise.all([getJson<LibrarySong[]>('library.json'), fetchSharedSongs()]);
  const deleted = new Set((shared?.deletedTitles ?? []).map(titleKey));
  const byTitle = new Map<string, LibrarySong>();
  for (const s of bundled) if (s?.title && Array.isArray(s.sections)) byTitle.set(titleKey(s.title), s);
  for (const s of shared?.entries ?? []) if (s?.title && Array.isArray(s.sections)) byTitle.set(titleKey(s.title), s);
  for (const [key, s] of byTitle) {
    if (deleted.has(key)) continue;
    const id = onlineId(s.title);
    if (seen.has(id)) continue;
    seen.add(id);
    const draft: SongDraft = { title: s.title, key: s.key || undefined, sections: s.sections, progression: s.order?.length ? s.order : undefined };
    const stamp = s.updatedAt ? Date.parse(s.updatedAt) : NaN;
    out.push({ ...songToPresentation(draft, opts), id, online: true, background, ...(Number.isFinite(stamp) ? { updatedAt: stamp } : {}), songSource: { sections: s.sections, order: s.order?.length ? s.order : undefined } });
  }
  try {
    for (const s of await getJson<RetreatSong[]>('retreat-songs.json')) {
      const id = s?.title ? onlineId(s.title) : '';
      if (!id || seen.has(id) || !Array.isArray(s.slides)) continue;
      seen.add(id);
      const slides: Slide[] = s.slides.map((lines, i) => ({ id: uid('s'), group: `Slide ${i + 1}`, text: lines.join('\n') }));
      out.push({ id, title: s.title, slides, themeId: 'theme_bold', folder: ONLINE_FOLDER, online: true, background: CHURCH_BACKGROUNDS.nightSky });
    }
  } catch {
    // optional file
  }
  return out;
}

/**
 * Register (or update) a song in the shared 찬양 라이브러리, as the ppt site's 라이브러리 저장 does;
 * needs the 관리자 password.
 */
export async function registerSharedSong(song: LibrarySong, adminPassword: string): Promise<void> {
  const r = await fetch('/api/songs', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminPassword}` },
    body: JSON.stringify({ entry: { ...song, verification: 'verified', updatedAt: new Date().toISOString() } }),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `등록하지 못했습니다 (${r.status})`);
}

/** Delete a song from the shared 찬양 라이브러리 (관리자 password). */
export async function deleteSharedSong(title: string, adminPassword: string): Promise<void> {
  const r = await fetch('/api/songs', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${adminPassword}` },
    body: JSON.stringify({ title }),
  });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `삭제하지 못했습니다 (${r.status})`);
}

/** Fetch one Bible translation file from the server. */
export const fetchBibleFile = (file: string) => getJson<unknown>(`bible-text/${file}`);
