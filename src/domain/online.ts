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

interface LibrarySong { title: string; key?: string; sections: { label: string; lines: string[] }[]; order?: string[] }
interface RetreatSong { title: string; slides: string[][] }

/** The song library from the server (library.json + retreat-songs.json) as read-only presentations. */
export async function fetchOnlineSongs(linesPerSlide: number): Promise<Presentation[]> {
  const seen = new Set<string>();
  const out: Presentation[] = [];
  const opts = { themeId: 'theme_sunday', linesPerSlide, folder: ONLINE_FOLDER };
  const background = CHURCH_BACKGROUNDS.watercolor;
  for (const s of await getJson<LibrarySong[]>('library.json')) {
    if (!s?.title || !Array.isArray(s.sections)) continue;
    const id = onlineId(s.title);
    if (seen.has(id)) continue;
    seen.add(id);
    const draft: SongDraft = { title: s.title, key: s.key || undefined, sections: s.sections, progression: s.order?.length ? s.order : undefined };
    out.push({ ...songToPresentation(draft, opts), id, online: true, background });
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

/** Fetch one Bible translation file from the server. */
export const fetchBibleFile = (file: string) => getJson<unknown>(`bible-text/${file}`);
