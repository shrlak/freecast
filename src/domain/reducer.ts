import type {
  Arrangement, Background, Library, MacroStep, MediaMeta, MessageTemplate, Macro, Playlist, PlaylistItem,
  Presentation, Prop, Schedule, Screen, Slide, SlideAction, SundaySettings, Theme, Timer,
} from './types';
import { sequence } from './arrangement';
import { extraReducer, isExtra, type ExtraAction } from './reducerExtra';
import { createEmptyLive } from './defaults';
import { activePlaylist, findPres, goLive, nextCursor, prevCursor, themeFor, type Cursor, type NavState } from './live';
import { resetTimer, startTimer, stopTimer } from './timers';

export type { Cursor } from './live';

export interface AppState extends NavState {
  selectedId: string | null;
  audio: { mediaId: string | null; nonce: number };
  /** Position in the looping announcements layer. */
  announce: { presentationId: string; seq: number } | null;
  past: Library[];
  future: Library[];
  lastKey: string | null;
}

export type Action =
  | { type: 'select'; id: string | null }
  | { type: 'presentation/create'; presentation: Presentation }
  | { type: 'presentation/createMany'; presentations: Presentation[]; playlist?: Playlist }
  | { type: 'presentation/update'; id: string; patch: Partial<Omit<Presentation, 'id'>> }
  | { type: 'presentation/delete'; id: string }
  | { type: 'slide/update'; presentationId: string; slideId: string; patch: Partial<Omit<Slide, 'id'>> }
  | { type: 'arrangement/upsert'; presentationId: string; arrangement: Arrangement }
  | { type: 'arrangement/delete'; presentationId: string; id: string }
  | { type: 'arrangement/select'; presentationId: string; id: string | null }
  | { type: 'theme/upsert'; theme: Theme }
  | { type: 'theme/delete'; id: string }
  | { type: 'playlist/create'; playlist: Playlist }
  | { type: 'playlist/delete'; id: string }
  | { type: 'playlist/rename'; id: string; name: string }
  | { type: 'playlist/activate'; id: string }
  | { type: 'playlist/addItem'; item: PlaylistItem }
  | { type: 'playlist/removeItem'; index: number }
  | { type: 'playlist/move'; from: number; to: number }
  | { type: 'playlist/select'; index: number }
  | { type: 'media/add'; media: MediaMeta }
  | { type: 'media/remove'; id: string }
  | { type: 'timer/upsert'; timer: Timer }
  | { type: 'timer/delete'; id: string }
  | { type: 'timer/op'; id: string; op: 'start' | 'stop' | 'reset'; now: number }
  | { type: 'prop/upsert'; prop: Prop }
  | { type: 'prop/delete'; id: string }
  | { type: 'prop/toggle'; id: string; on?: boolean }
  | { type: 'prop/clearAll' }
  | { type: 'template/upsert'; template: MessageTemplate }
  | { type: 'template/delete'; id: string }
  | { type: 'macro/upsert'; macro: Macro }
  | { type: 'macro/delete'; id: string }
  | { type: 'macro/run'; id: string; now: number }
  | { type: 'screen/upsert'; screen: Screen }
  | { type: 'screen/delete'; id: string }
  | { type: 'sunday/settings'; patch: Partial<SundaySettings> }
  | { type: 'library/replace'; library: Library }
  | { type: 'usage/clear' }
  | { type: 'live/go'; presentationId: string; seq: number; now?: number }
  | { type: 'live/next'; now?: number }
  | { type: 'live/prev' }
  | { type: 'live/clearAll' }
  | { type: 'live/clearText' }
  | { type: 'live/clearBackground' }
  | { type: 'live/toggleBlack' }
  | { type: 'live/black'; on: boolean }
  | { type: 'live/background'; background: Background | null }
  | { type: 'live/message'; message: string | null }
  | { type: 'live/outputTimer'; id: string | null }
  | { type: 'live/video'; playing?: boolean; restart?: boolean }
  | { type: 'audio/play'; mediaId: string | null }
  | { type: 'live/logo'; on?: boolean }
  | { type: 'library/logo'; mediaId: string | null }
  | { type: 'live/stageMessage'; message: string | null }
  | { type: 'live/messageScroll'; on: boolean }
  | { type: 'live/videoSeek'; t: number }
  | { type: 'live/videoLoop'; on: boolean }
  | { type: 'announce/start'; presentationId: string }
  | { type: 'announce/next' }
  | { type: 'announce/stop' }
  | { type: 'schedule/upsert'; schedule: Schedule }
  | { type: 'schedule/delete'; id: string }
  | { type: 'schedule/ran'; id: string; slot: string; now: number }
  | { type: 'slide/runActions'; actions: SlideAction[]; now: number }
  | { type: 'online/songs'; presentations: Presentation[] }
  | { type: 'noop' }
  | ExtraAction
  | { type: 'undo' }
  | { type: 'redo' };

export function createInitialState(library: Library): AppState {
  const pl = library.playlists[0];
  const first = pl?.items.find((i): i is Extract<PlaylistItem, { presentationId: string }> => i.kind !== 'header');
  return {
    library,
    selectedId: first?.presentationId ?? library.presentations[0]?.id ?? null,
    activePlaylistId: pl?.id ?? '',
    playlistIndex: null,
    cursor: null,
    live: createEmptyLive(library),
    audio: { mediaId: null, nonce: 0 },
    announce: null,
    past: [],
    future: [],
    lastKey: null,
  };
}

const setLib = (s: AppState, patch: Partial<Library>): AppState => ({ ...s, library: { ...s.library, ...patch } });
const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
const mapPres = (s: AppState, id: string, fn: (p: Presentation) => Presentation) =>
  setLib(s, { presentations: s.library.presentations.map((p) => (p.id === id ? fn(p) : p)) });
const mapPlaylist = (s: AppState, fn: (p: Playlist) => Playlist) => {
  const active = activePlaylist(s);
  return active ? setLib(s, { playlists: s.library.playlists.map((p) => (p.id === active.id ? fn(p) : p)) }) : s;
};
const usesMedia = (b: Background | null | undefined, id: string) => b?.kind === 'media' && b.mediaId === id;

function live(s: AppState, c: Cursor, now?: number): AppState {
  const prevPres = s.cursor?.presentationId;
  let next = goLive(s, c);
  if (next === s) return s;
  if (next.playlistIndex !== s.playlistIndex && next.cursor) next = { ...next, selectedId: next.cursor.presentationId };
  const actions = next.live.slide?.actions;
  if (actions?.length) next = runActions(next, actions, now ?? 0);
  if (now != null && next.cursor && next.cursor.presentationId !== prevPres) {
    const p = findPres(next.library, next.cursor.presentationId)!;
    const entry = { at: now, presentationId: p.id, title: p.title, ccli: p.meta?.ccli };
    next = setLib(next, { usage: [...next.library.usage, entry].slice(-5000) });
  }
  return next;
}

function runActions(s: AppState, actions: SlideAction[], now: number, depth = 0): AppState {
  return actions.reduce((acc, a) => {
    if (a.type === 'runMacro') {
      const m = acc.library.macros.find((x) => x.id === a.macroId);
      // Macros may not start another presentation from a slide action, to avoid loops.
      return m && depth < 1 ? runActions(acc, m.steps.filter((st) => st.type !== 'go'), now, depth + 1) : acc;
    }
    if (a.type === 'go') return acc;
    return core(acc, stepToAction(a, now));
  }, s);
}

function announceAt(s: AppState, presentationId: string, seq: number): AppState {
  const p = findPres(s.library, presentationId);
  const items = p ? sequence(p).filter((x) => !x.slide.disabled) : [];
  if (!p || !items.length) return { ...s, announce: null, live: { ...s.live, announcement: null } };
  const i = ((seq % items.length) + items.length) % items.length;
  return {
    ...s,
    announce: { presentationId, seq: i },
    live: { ...s.live, announcement: { slide: items[i].slide, theme: themeFor(s.library, p), title: p.title } },
  };
}

/** Live editing: when the presentation on screen changes, redraw the live slide in place. */
function refreshLive(s: AppState, presentationId: string): AppState {
  if (s.cursor?.presentationId !== presentationId) return s;
  const next = goLive(s, s.cursor);
  if (next === s) return s;
  return { ...next, live: { ...next.live, black: s.live.black, logo: s.live.logo, copyright: s.live.copyright } };
}

function stepToAction(step: MacroStep, now: number): Action {
  switch (step.type) {
    case 'logo': return { type: 'live/logo', on: step.on };
    case 'obs': return { type: 'noop' };
    case 'dmx': return { type: 'noop' };
    case 'stageMessage': return { type: 'live/stageMessage', message: step.text };
    case 'announce': return step.presentationId ? { type: 'announce/start', presentationId: step.presentationId } : { type: 'announce/stop' };
    case 'clearAll': return { type: 'live/clearAll' };
    case 'clearText': return { type: 'live/clearText' };
    case 'clearBackground': return { type: 'live/clearBackground' };
    case 'clearProps': return { type: 'prop/clearAll' };
    case 'black': return { type: 'live/black', on: step.on };
    case 'background': return { type: 'live/background', background: step.background };
    case 'go': return { type: 'live/go', presentationId: step.presentationId, seq: step.index, now };
    case 'timer': return { type: 'timer/op', id: step.timerId, op: step.op, now };
    case 'prop': return { type: 'prop/toggle', id: step.propId, on: step.on };
    case 'message': return { type: 'live/message', message: step.text };
    case 'audio': return { type: 'audio/play', mediaId: step.mediaId };
  }
}

function core(s: AppState, a: Action): AppState {
  if (isExtra(a)) return extraReducer(s, a);
  const lib = s.library;
  switch (a.type) {
    case 'select':
      return { ...s, selectedId: a.id, playlistIndex: null };
    case 'presentation/create':
      return { ...setLib(s, { presentations: [...lib.presentations, a.presentation] }), selectedId: a.presentation.id, playlistIndex: null };
    case 'presentation/createMany': {
      const next = setLib(s, {
        presentations: [...lib.presentations, ...a.presentations],
        playlists: a.playlist ? [...lib.playlists, a.playlist] : lib.playlists,
      });
      return a.playlist ? { ...next, activePlaylistId: a.playlist.id, playlistIndex: null } : next;
    }
    case 'presentation/update':
      // Editing an online song makes it this computer's own copy (saved locally from then on).
      return refreshLive(mapPres(s, a.id, (p) => ({ ...p, ...a.patch, online: undefined })), a.id);
    case 'presentation/delete': {
      const playlists = lib.playlists.map((pl) => ({ ...pl, items: pl.items.filter((i) => i.kind === 'header' || i.presentationId !== a.id) }));
      return {
        ...setLib(s, { presentations: lib.presentations.filter((p) => p.id !== a.id), playlists }),
        selectedId: s.selectedId === a.id ? null : s.selectedId,
        playlistIndex: null,
        cursor: s.cursor?.presentationId === a.id ? null : s.cursor,
      };
    }
    case 'slide/update':
      return refreshLive(mapPres(s, a.presentationId, (p) => ({ ...p, online: undefined, slides: p.slides.map((sl) => (sl.id === a.slideId ? { ...sl, ...a.patch } : sl)) })), a.presentationId);
    case 'online/songs': {
      const local = lib.presentations.filter((p) => !p.online);
      const localIds = new Set(local.map((p) => p.id));
      return setLib(s, { presentations: [...local, ...a.presentations.filter((p) => !localIds.has(p.id))] });
    }
    case 'arrangement/upsert':
      return mapPres(s, a.presentationId, (p) => ({ ...p, arrangements: upsert(p.arrangements ?? [], a.arrangement), arrangementId: a.arrangement.id }));
    case 'arrangement/delete':
      return mapPres(s, a.presentationId, (p) => ({
        ...p, arrangements: (p.arrangements ?? []).filter((x) => x.id !== a.id), arrangementId: p.arrangementId === a.id ? null : p.arrangementId,
      }));
    case 'arrangement/select':
      return { ...mapPres(s, a.presentationId, (p) => ({ ...p, arrangementId: a.id })), cursor: s.cursor?.presentationId === a.presentationId ? null : s.cursor };
    case 'theme/upsert': {
      const next = setLib(s, { themes: upsert(lib.themes, a.theme) });
      return s.live.theme.id === a.theme.id ? { ...next, live: { ...next.live, theme: a.theme } } : next;
    }
    case 'theme/delete': {
      if (lib.themes.length <= 1) return s;
      const themes = lib.themes.filter((t) => t.id !== a.id);
      return setLib(s, { themes, presentations: lib.presentations.map((p) => (p.themeId === a.id ? { ...p, themeId: themes[0].id } : p)) });
    }
    case 'playlist/create':
      return { ...setLib(s, { playlists: [...lib.playlists, a.playlist] }), activePlaylistId: a.playlist.id, playlistIndex: null };
    case 'playlist/delete': {
      if (lib.playlists.length <= 1) return s;
      const playlists = lib.playlists.filter((p) => p.id !== a.id);
      return { ...setLib(s, { playlists }), activePlaylistId: s.activePlaylistId === a.id ? playlists[0].id : s.activePlaylistId, playlistIndex: null };
    }
    case 'playlist/rename':
      return setLib(s, { playlists: lib.playlists.map((p) => (p.id === a.id ? { ...p, name: a.name } : p)) });
    case 'playlist/activate':
      return { ...s, activePlaylistId: a.id, playlistIndex: null };
    case 'playlist/addItem':
      return mapPlaylist(s, (p) => ({ ...p, items: [...p.items, a.item] }));
    case 'playlist/removeItem':
      return { ...mapPlaylist(s, (p) => ({ ...p, items: p.items.filter((_, i) => i !== a.index) })), playlistIndex: null };
    case 'playlist/move': {
      const items = activePlaylist(s)?.items ?? [];
      if (a.to < 0 || a.to >= items.length) return s;
      const moved = mapPlaylist(s, (p) => {
        const next = [...p.items];
        const [item] = next.splice(a.from, 1);
        next.splice(a.to, 0, item);
        return { ...p, items: next };
      });
      return { ...moved, playlistIndex: s.playlistIndex === a.from ? a.to : s.playlistIndex };
    }
    case 'playlist/select': {
      const item = activePlaylist(s)?.items[a.index];
      if (!item || item.kind === 'header') return s;
      return { ...s, playlistIndex: a.index, selectedId: item.presentationId };
    }
    case 'media/add':
      return setLib(s, { media: [...lib.media, a.media] });
    case 'media/remove': {
      const next = setLib(s, {
        media: lib.media.filter((m) => m.id !== a.id),
        presentations: lib.presentations.map((p) => ({
          ...p,
          background: usesMedia(p.background, a.id) ? undefined : p.background,
          slides: p.slides.map((sl) => (usesMedia(sl.background, a.id) ? { ...sl, background: undefined } : sl)),
        })),
        props: lib.props.filter((p) => p.mediaId !== a.id),
      });
      return {
        ...next,
        live: usesMedia(s.live.background, a.id) ? { ...next.live, background: null } : next.live,
        audio: s.audio.mediaId === a.id ? { mediaId: null, nonce: s.audio.nonce + 1 } : s.audio,
      };
    }
    case 'timer/upsert':
      return setLib(s, { timers: upsert(lib.timers, a.timer) });
    case 'timer/delete':
      return setLib(s, { timers: lib.timers.filter((t) => t.id !== a.id) });
    case 'timer/op': {
      const op = a.op === 'start' ? (t: Timer) => startTimer(t, a.now) : a.op === 'stop' ? (t: Timer) => stopTimer(t, a.now) : resetTimer;
      return setLib(s, { timers: lib.timers.map((t) => (t.id === a.id ? op(t) : t)) });
    }
    case 'prop/upsert':
      return setLib(s, { props: upsert(lib.props, a.prop) });
    case 'prop/delete':
      return { ...setLib(s, { props: lib.props.filter((p) => p.id !== a.id) }), live: { ...s.live, activeProps: s.live.activeProps.filter((id) => id !== a.id) } };
    case 'prop/toggle': {
      const isOn = s.live.activeProps.includes(a.id);
      const on = a.on ?? !isOn;
      if (on === isOn) return s;
      return { ...s, live: { ...s.live, activeProps: on ? [...s.live.activeProps, a.id] : s.live.activeProps.filter((id) => id !== a.id) } };
    }
    case 'prop/clearAll':
      return { ...s, live: { ...s.live, activeProps: [] } };
    case 'template/upsert':
      return setLib(s, { messageTemplates: upsert(lib.messageTemplates, a.template) });
    case 'template/delete':
      return setLib(s, { messageTemplates: lib.messageTemplates.filter((t) => t.id !== a.id) });
    case 'macro/upsert':
      return setLib(s, { macros: upsert(lib.macros, a.macro) });
    case 'macro/delete':
      return setLib(s, { macros: lib.macros.filter((m) => m.id !== a.id) });
    case 'macro/run': {
      const macro = lib.macros.find((m) => m.id === a.id);
      return macro ? macro.steps.reduce((acc, step) => core(acc, stepToAction(step, a.now)), s) : s;
    }
    case 'screen/upsert':
      return setLib(s, { screens: upsert(lib.screens, a.screen) });
    case 'screen/delete':
      return lib.screens.length > 1 ? setLib(s, { screens: lib.screens.filter((x) => x.id !== a.id) }) : s;
    case 'sunday/settings':
      return setLib(s, { sunday: { ...lib.sunday, ...a.patch } });
    case 'library/replace':
      return { ...createInitialState(a.library), past: [...s.past, s.library].slice(-60) };
    case 'usage/clear':
      return setLib(s, { usage: [] });
    case 'live/go':
      return live(s, { presentationId: a.presentationId, seq: a.seq, playlistIndex: s.playlistIndex }, a.now);
    case 'live/next': {
      if (!s.cursor) return s.selectedId ? live(s, { presentationId: s.selectedId, seq: 0 }, a.now) : s;
      const n = nextCursor(s, s.cursor);
      return n ? live(s, n, a.now) : s;
    }
    case 'live/prev': {
      const n = s.cursor && prevCursor(s, s.cursor);
      return n ? live(s, n) : s;
    }
    case 'live/clearAll':
      return {
        ...s, cursor: null, announce: null,
        live: { ...s.live, slide: null, nextText: null, background: null, message: null, black: false, logo: false, copyright: null, announcement: null },
      };
    case 'live/clearText':
      return { ...s, cursor: null, live: { ...s.live, slide: null, nextText: null, copyright: null } };
    case 'live/clearBackground':
      return { ...s, live: { ...s.live, background: null } };
    case 'live/toggleBlack':
      return { ...s, live: { ...s.live, black: !s.live.black } };
    case 'live/black':
      return { ...s, live: { ...s.live, black: a.on } };
    case 'live/background':
      return { ...s, live: { ...s.live, background: a.background, video: { playing: true, restart: s.live.video.restart } } };
    case 'live/message':
      return { ...s, live: { ...s.live, message: a.message?.trim() ? a.message.trim() : null } };
    case 'live/outputTimer':
      return { ...s, live: { ...s.live, outputTimerId: a.id } };
    case 'live/video':
      return {
        ...s,
        live: { ...s.live, video: { playing: a.playing ?? s.live.video.playing, restart: s.live.video.restart + (a.restart ? 1 : 0) } },
      };
    case 'audio/play':
      return { ...s, audio: { mediaId: a.mediaId, nonce: s.audio.nonce + 1 } };
    case 'live/logo':
      return { ...s, live: { ...s.live, logo: a.on ?? !s.live.logo, logoMediaId: lib.logoMediaId } };
    case 'library/logo':
      return { ...setLib(s, { logoMediaId: a.mediaId }), live: { ...s.live, logoMediaId: a.mediaId } };
    case 'live/stageMessage':
      return { ...s, live: { ...s.live, stageMessage: a.message?.trim() ? a.message.trim() : null } };
    case 'live/messageScroll':
      return { ...s, live: { ...s.live, messageScroll: a.on } };
    case 'live/videoSeek':
      return { ...s, live: { ...s.live, video: { ...s.live.video, seek: { t: Math.max(0, a.t), n: (s.live.video.seek?.n ?? 0) + 1 } } } };
    case 'live/videoLoop':
      return { ...s, live: { ...s.live, video: { ...s.live.video, loop: a.on } } };
    case 'announce/start':
      return announceAt(s, a.presentationId, 0);
    case 'announce/next':
      return s.announce ? announceAt(s, s.announce.presentationId, s.announce.seq + 1) : s;
    case 'announce/stop':
      return { ...s, announce: null, live: { ...s.live, announcement: null } };
    case 'schedule/upsert':
      return setLib(s, { schedules: upsert(lib.schedules, a.schedule) });
    case 'schedule/delete':
      return setLib(s, { schedules: lib.schedules.filter((x) => x.id !== a.id) });
    case 'schedule/ran': {
      const sched = lib.schedules.find((x) => x.id === a.id);
      if (!sched) return s;
      const marked = setLib(s, { schedules: lib.schedules.map((x) => (x.id === a.id ? { ...x, lastRun: a.slot } : x)) });
      return core(marked, { type: 'macro/run', id: sched.macroId, now: a.now });
    }
    case 'slide/runActions':
      return runActions(s, a.actions, a.now);
    default:
      return s;
  }
}

/** Actions that change the library but should not be undoable. */
const NO_HISTORY = new Set<Action['type']>(['timer/op', 'macro/run', 'usage/clear', 'library/replace', 'schedule/ran', 'slide/runActions', 'online/songs', 'live/videoClock', 'library/merge']);

function historyKey(a: Action): string {
  const id = (a as { id?: string }).id ?? (a as { theme?: Theme }).theme?.id ?? (a as { slideId?: string }).slideId ?? '';
  return `${a.type}:${id}`;
}

/** Keeps output-facing copies of library data (themes, props, timers, screens) in sync with the library. */
function syncLive(s: AppState): AppState {
  const { live: l, library: lib } = s;
  if (l.props === lib.props && l.timers === lib.timers && l.screens === lib.screens && l.themes === lib.themes && l.stageLayouts === lib.stageLayouts) return s;
  return { ...s, live: { ...l, props: lib.props, timers: lib.timers, screens: lib.screens, themes: lib.themes, stageLayouts: lib.stageLayouts } };
}

export function reducer(s: AppState, a: Action): AppState {
  if (a.type === 'undo' || a.type === 'redo') {
    const from = a.type === 'undo' ? s.past : s.future;
    if (!from.length) return s;
    const library = from[from.length - 1];
    const rest = from.slice(0, -1);
    const other = [...(a.type === 'undo' ? s.future : s.past), s.library].slice(-60);
    const next = { ...s, library, lastKey: null, ...(a.type === 'undo' ? { past: rest, future: other } : { past: other, future: rest }) };
    return syncLive(next);
  }
  const next = core(s, a);
  if (next === s) return s;
  if (next.library === s.library || a.type.startsWith('live/') || NO_HISTORY.has(a.type)) return syncLive(next);
  const key = historyKey(a);
  const coalesce = key === s.lastKey && (a.type === 'theme/upsert' || a.type.endsWith('/update') || a.type.endsWith('/upsert'));
  return syncLive({
    ...next,
    past: coalesce ? s.past : [...s.past, s.library].slice(-60),
    future: [],
    lastKey: key,
  });
}
