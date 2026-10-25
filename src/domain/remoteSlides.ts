import type { Background, Slide, Theme } from './types';
import { activePlaylist, findPres, upcomingCursors, type Cursor, type NavState } from './live';
import { sequence } from './arrangement';
import { resolveBackground } from './autoBackground';
import { uid } from './lyrics';

export interface RemoteSlide extends Cursor {
  playlistIndex: number | null;
  title: string;
  heading: boolean;
  section?: string;
  themeId: string;
  bgEffect: { dim: number; blur: number } | null;
  slide: Slide;
  background: Background | null;
}

/** Full running order as well as the next slides; optional fields accept older hosts. */
export interface RemoteInfo {
  upcoming: RemoteSlide[];
  all?: RemoteSlide[];
  current?: Cursor | null;
  name?: string;
  themes: Record<string, Theme>;
}

export const remoteSlideKey = (c: Cursor) => `${c.presentationId}:${c.seq}:${c.playlistIndex ?? ''}`;

/** Every sequence position in the current playlist, including earlier, hidden and repeated slides. */
export function remoteSlideInfo(state: NavState, selectedId: string | null): RemoteInfo {
  const playlist = activePlaylist(state);
  const focusId = state.cursor?.presentationId ?? selectedId;
  const usePlaylist = !!playlist && (!focusId || playlist.items.some((i) => i.kind !== 'header' && i.presentationId === focusId));
  const all: RemoteSlide[] = [];
  const themes: Record<string, Theme> = {};
  const sequences = new Map<string, ReturnType<typeof sequence>>();
  const describe = (c: Cursor, heading: boolean, section?: string): RemoteSlide | null => {
    const p = findPres(state.library, c.presentationId);
    if (!p) return null;
    let slides = sequences.get(p.id);
    if (!slides) { slides = sequence(p); sequences.set(p.id, slides); }
    const slide = slides[c.seq]?.slide;
    if (!slide) return null;
    themes[p.themeId] ??= state.library.themes.find((t) => t.id === p.themeId) ?? state.library.themes[0];
    return { ...c, playlistIndex: c.playlistIndex ?? null, title: p.title, heading, section, themeId: p.themeId, bgEffect: p.bgEffect ?? null, slide, background: resolveBackground(slide, p) };
  };
  const append = (presentationId: string, playlistIndex: number | null, section?: string) => {
    const p = findPres(state.library, presentationId);
    if (!p) return;
    sequence(p).forEach((_s, seq) => {
      const item = describe({ presentationId, seq, playlistIndex }, seq === 0, section);
      if (item) all.push(item);
    });
  };
  if (usePlaylist) {
    let section: string | undefined;
    playlist.items.forEach((item, index) => {
      if (item.kind === 'header') section = item.title;
      else append(item.presentationId, index, section);
    });
  } else if (focusId) append(focusId, null);
  let previous = state.cursor?.presentationId ?? null;
  const upcoming = upcomingCursors(state, selectedId).flatMap((c) => {
    const item = describe(c, c.presentationId !== previous);
    previous = c.presentationId;
    return item ? [item] : [];
  });
  const current = state.cursor ? { ...state.cursor, playlistIndex: state.cursor.playlistIndex ?? state.playlistIndex ?? null } : null;
  return { all, upcoming, themes, current, name: usePlaylist ? playlist.name : findPres(state.library, focusId ?? '')?.title };
}

export type RemotePositionMessage = { type: 'info-position'; current: Cursor | null; upcoming: { key: string; heading: boolean; section?: string }[] };
export type RemoteInfoMessage = { type: 'info'; info: RemoteInfo } | { type: 'info-chunk'; id: string; index: number; total: number; data: string } | RemotePositionMessage;

/** Cursor updates are tiny; unchanged slide catalogs should not cross a slow WAN on every click. */
export function remotePositionMessage(info: RemoteInfo): RemotePositionMessage | null {
  if (!info.all) return null;
  const available = new Set(info.all.map(remoteSlideKey));
  const upcoming = info.upcoming.map((slide) => ({ key: remoteSlideKey(slide), heading: slide.heading, section: slide.section }));
  return upcoming.every(({ key }) => available.has(key)) ? { type: 'info-position', current: info.current ?? null, upcoming } : null;
}

/** Split large catalogs without losing slides or exceeding the relay's 4 MB UTF-8 frame limit. */
export function remoteInfoMessages(info: RemoteInfo): RemoteInfoMessage[] {
  const message = { type: 'info', info } as const;
  const json = JSON.stringify(message);
  if (new TextEncoder().encode(json).length <= 3_000_000) return [message];
  const data = JSON.stringify(info), size = 180_000, total = Math.ceil(data.length / size), id = uid('remote');
  return Array.from({ length: total }, (_, index) => ({ type: 'info-chunk', id, index, total, data: data.slice(index * size, (index + 1) * size) }));
}

/** Replace the visible list only when all chunks of the new catalog have arrived. */
export class RemoteInfoReader {
  private pending: { id: string; total: number; parts: string[] } | null = null;
  private catalog: RemoteInfo | null = null;
  accept(message: Record<string, unknown>): RemoteInfo | null {
    if (message.type === 'info') { this.pending = null; this.catalog = message.info as RemoteInfo; return this.catalog; }
    if (message.type === 'info-position') {
      if (!this.catalog?.all || !Array.isArray(message.upcoming) || message.upcoming.length > 100 ||
          !message.upcoming.every((item) => item && typeof item.key === 'string' && typeof item.heading === 'boolean' &&
            (item.section === undefined || typeof item.section === 'string'))) return null;
      const slides = new Map(this.catalog.all.map((slide) => [remoteSlideKey(slide), slide]));
      const upcoming = message.upcoming.map((item) => {
        const slide = slides.get(item.key as string);
        return slide ? { ...slide, heading: item.heading as boolean, section: item.section as string | undefined } : undefined;
      });
      if (upcoming.some((slide) => !slide)) return null;
      const current = message.current;
      if (current !== null && (typeof current !== 'object' || !current || typeof (current as Cursor).presentationId !== 'string' ||
          !Number.isInteger((current as Cursor).seq))) return null;
      this.catalog = { ...this.catalog, current: current as Cursor | null, upcoming: upcoming as RemoteSlide[] };
      return this.catalog;
    }
    if (message.type !== 'info-chunk' || typeof message.id !== 'string' || typeof message.data !== 'string' || !Number.isInteger(message.index) || !Number.isInteger(message.total)) return null;
    const { id, data } = message, index = message.index as number, total = message.total as number;
    if (total < 1 || index < 0 || index >= total) return null;
    if (index === 0) this.pending = { id, total, parts: [] };
    const pending = this.pending;
    if (!pending || pending.id !== id || pending.total !== total || pending.parts.length !== index) return null;
    pending.parts.push(data);
    if (pending.parts.length !== total) return null;
    this.pending = null;
    try { this.catalog = JSON.parse(pending.parts.join('')) as RemoteInfo; return this.catalog; } catch { return null; }
  }
}
