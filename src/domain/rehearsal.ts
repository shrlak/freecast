import { createInitialState, type AppState } from './reducer';
import { activePlaylist, goLive, nextCursor, prevCursor } from './live';
import type { Cursor } from './live';

/** Navigation only: never run slide actions, macros, media playback, usage logs or output IPC. */
export function rehearsalCommand(s: AppState, command: Record<string, unknown>): AppState {
  let cursor: Cursor | null = null;
  if (command.type === 'live/go' && typeof command.presentationId === 'string' && Number.isInteger(command.seq)) cursor = { presentationId: command.presentationId, seq: Number(command.seq), playlistIndex: typeof command.playlistIndex === 'number' ? command.playlistIndex : null };
  else if (command.type === 'live/next' && s.cursor) cursor = nextCursor(s, s.cursor);
  else if (command.type === 'live/prev' && s.cursor) cursor = prevCursor(s, s.cursor);
  else if (command.type === 'live/toggleBlack') return { ...s, live: { ...s.live, black: !s.live.black } };
  else if (command.type === 'show/end' || command.type === 'live/clearAll') return { ...s, cursor: null, live: { ...s.live, slide: null, title: null, background: null, nextText: null } };
  else if (command.type === 'show/start' || (command.type === 'live/next' && !s.cursor)) {
    const items = activePlaylist(s)?.items ?? [];
    const index = items.findIndex((i) => i.kind !== 'header');
    const item = items[index];
    const id = item && item.kind !== 'header' ? item.presentationId : s.selectedId;
    if (id) cursor = { presentationId: id, seq: 0, playlistIndex: index >= 0 ? index : null };
  }
  return cursor ? goLive(s, cursor) : s;
}
export function createRehearsal(s: AppState): AppState {
  return rehearsalCommand({ ...createInitialState(s.library), activePlaylistId: s.activePlaylistId, selectedId: s.selectedId }, { type: 'show/start' });
}
