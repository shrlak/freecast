import type { Library, LiveState } from './types';
import type { Action } from './reducer';
import { sequence } from './arrangement';
import type { Cursor } from './live';

/** Where the main computer's screen is in this computer's own copy of the library, matched by title and slide. */
export function locateLive(lib: Library, live: Pick<LiveState, 'title' | 'slide'> | null, playlistId?: string): Cursor | null {
  if (!live?.slide || !live.title) return null;
  const items = lib.playlists.find((p) => p.id === playlistId)?.items ?? [];
  const candidates = lib.presentations.filter((p) => p.title === live.title);
  // A deck in the open playlist is preferred over a copy of the same name elsewhere.
  candidates.sort((a, b) => Number(items.some((i) => i.kind !== 'header' && i.presentationId === b.id)) - Number(items.some((i) => i.kind !== 'header' && i.presentationId === a.id)));
  const slide = live.slide;
  // Same slide id first (libraries kept in step by sync); else the same words, for a computer set up from a file.
  const matches = [(x: { slide: { id: string } }) => x.slide.id === slide.id, (x: { slide: { text: string; title?: string } }) => x.slide.text === slide.text && (x.slide.title ?? '') === (slide.title ?? '')];
  for (const match of matches) {
    for (const p of candidates) {
      const seq = sequence(p).findIndex(match);
      if (seq >= 0) {
        const playlistIndex = items.findIndex((i) => i.kind !== 'header' && i.presentationId === p.id);
        return { presentationId: p.id, seq, playlistIndex: playlistIndex >= 0 ? playlistIndex : null };
      }
    }
  }
  return null;
}

export type StandbyHealth = 'waiting' | 'following' | 'lost';

/** `lostAt` is when the link to the main computer dropped (null while connected). */
export function standbyHealth(connected: boolean, everConnected: boolean, lostAt: number | null, now: number, graceMs = 6000): StandbyHealth {
  if (connected) return 'following';
  if (!everConnected) return 'waiting';
  return lostAt != null && now - lostAt >= graceMs ? 'lost' : 'following';
}

/** What this computer does to carry on exactly where the main one was. */
export function takeoverActions(cursor: Cursor | null, live: Pick<LiveState, 'black'> | null): Action[] {
  if (!cursor) return [];
  const go: Action = { type: 'live/go', presentationId: cursor.presentationId, seq: cursor.seq, playlistIndex: cursor.playlistIndex };
  return live?.black ? [go, { type: 'live/black', on: true }] : [go];
}

/** Turns what a person typed (an address, an IP, or an IP:port) into the relay's WebSocket address. */
export function standbyRelayUrl(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `http://${text}`);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return null;
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    return `${secure ? 'wss' : 'ws'}://${url.host}/freecast-ws`;
  } catch {
    return null;
  }
}
