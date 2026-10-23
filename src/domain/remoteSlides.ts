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

export type RemoteInfoMessage = { type: 'info'; info: RemoteInfo } | { type: 'info-chunk'; id: string; index: number; total: number; data: string };

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
  accept(message: Record<string, unknown>): RemoteInfo | null {
    if (message.type === 'info') { this.pending = null; return message.info as RemoteInfo; }
    if (message.type !== 'info-chunk' || typeof message.id !== 'string' || typeof message.data !== 'string' || !Number.isInteger(message.index) || !Number.isInteger(message.total)) return null;
    const { id, data } = message, index = message.index as number, total = message.total as number;
    if (total < 1 || index < 0 || index >= total) return null;
    if (index === 0) this.pending = { id, total, parts: [] };
    const pending = this.pending;
    if (!pending || pending.id !== id || pending.total !== total || pending.parts.length !== index) return null;
    pending.parts.push(data);
    if (pending.parts.length !== total) return null;
    this.pending = null;
    try { return JSON.parse(pending.parts.join('')) as RemoteInfo; } catch { return null; }
  }
}
