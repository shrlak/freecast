import type { SongDraft } from './sunday/songs';
import type { PrayerTopic } from './sunday/prayer';
import type { Announcement } from './sunday/announcements';

export interface AiServiceInfo {
  date: string;
  scripture: string;
  sermonTitle: string;
  preacher: string;
  confession: string;
}
export interface AiConti extends AiServiceInfo {
  songs: (Omit<SongDraft, 'key'> & { key: string })[];
}
export interface AiNotice extends AiServiceInfo {
  songs: { title: string; key: string }[];
  prayerTopics: PrayerTopic[];
  announcements: Announcement[];
}
export interface AiSlides {
  title: string;
  slides: { group: string; title: string; text: string; subtext: string }[];
}

async function post<T>(name: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/ai/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('Cannot reach the FreeCast server (AI needs `npm run dev` or `npm start`).');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `AI request failed (${res.status})`);
  return data as T;
}

export interface AiRetreat {
  meetings: { name: string; songs: string[] }[];
  songs: { title: string; lyrics: string }[];
}

export const ai = {
  retreat: (pages: { page: number; data: string; text: string }[]) => post<AiRetreat>('retreat', { pages }),
  status: () => fetch('/api/ai/status').then((r) => (r.ok ? r.json() as Promise<{ model: string; configured: boolean }> : null)).catch(() => null),
  conti: (pages: { page: number; data: string; text: string }[], knownTitles: string[]) => post<AiConti>('conti', { pages, knownTitles }),
  notice: (text: string) => post<AiNotice>('notice', { text }),
  translate: (title: string, slides: { id: string; text: string }[], target = 'English') =>
    post<{ lines: { id: string; text: string }[] }>('translate', { title, slides, target }),
  assist: (prompt: string) => post<AiSlides>('assist', { prompt }),
};
