import type { Library, LiveState, MediaMeta, Playlist, DeviceRegistration } from './types';
import { isActivityEntry, isDeviceIdentity } from './activity';
import { createSeedLibrary, DEFAULT_THEMES } from './defaults';
import { CANVAS_W, LEGACY_CANVAS_W } from './canvas';

const LIBRARY_KEY = 'freecast.library.v1';
const LIVE_KEY = 'freecast.live.v2';

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

/**
 * Validate data from storage or an imported file and fill in anything an older
 * version did not have. Returns null when it is not a FreeCast library.
 */
/** The presentations without their own transitions (nor their slides'). */
export function clearTransitions(list: Library['presentations']): Library['presentations'] {
  return list.map((p) => {
    const { transition: _p, ...rest } = p;
    return { ...rest, slides: p.slides.map((s) => { const { transition: _s, ...r } = s; return r; }) };
  });
}

export function normalizeLibrary(value: unknown): Library | null {
  if (!isObj(value) || value.version !== 1) return null;
  const { presentations, themes } = value;
  if (!Array.isArray(presentations) || !Array.isArray(themes) || !themes.length) return null;
  if (!presentations.every((p) => isObj(p) && typeof p.id === 'string' && Array.isArray(p.slides))) return null;
  const seed = createSeedLibrary();
  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  let playlists = arr<Playlist>(value.playlists, []);
  if (!playlists.length && Array.isArray(value.playlist)) {
    playlists = [{ id: 'pl_main', name: 'Playlist', items: value.playlist as Playlist['items'] }];
  }
  if (!playlists.length) playlists = [{ id: 'pl_main', name: 'Playlist', items: [] }];
  // Libraries from before the 주일예배 builder get its Front / 기도 / Back templates.
  const ids = new Set(presentations.map((p) => (p as { id: string }).id));
  const saved = isObj(value.sunday) ? value.sunday : null;
  const wanted = (id: string) => !saved || [saved.frontId, saved.prayerId, saved.backId].includes(id);
  const templates = seed.presentations.filter((p) => p.folder === 'Templates' && !ids.has(p.id) && wanted(p.id));
  const laidOut = value.aspect === '4:3' ? (presentations as Library['presentations']) : toFourThree(presentations as Library['presentations']);
  // Once: every transition the library had is cleared, so all of them are the default (없음, 1 ms).
  const own = value.transitionsReset === true ? laidOut : clearTransitions(laidOut);
  return {
    version: 1,
    aspect: '4:3',
    transitionsReset: true,
    devices: arr<DeviceRegistration>(value.devices, []).filter((d) => isDeviceIdentity(d) && Number.isFinite(d.lastSeen) && (d.account === null || typeof d.account === 'string')),
    activity: arr<unknown>(value.activity, []).filter(isActivityEntry).slice(-2000),
    lastModified: isActivityEntry(value.lastModified) ? value.lastModified : undefined,
    presentations: [...own, ...templates],
    // Themes added in later versions (광고, scripture) are appended if missing.
    themes: [...(themes as Library['themes']), ...DEFAULT_THEMES.filter((t) => !themes.some((x) => isObj(x) && x.id === t.id))],
    playlists,
    backgroundLibraryReset: true,
    media: arr<MediaMeta>(value.media, []).map((m) =>
      value.backgroundLibraryReset === true || m.type === 'audio' ? m : { ...m, backgroundHidden: true }),
    timers: arr(value.timers, seed.timers),
    props: arr(value.props, seed.props),
    messageTemplates: arr(value.messageTemplates, seed.messageTemplates),
    macros: arr(value.macros, seed.macros),
    screens: arr(value.screens, seed.screens),
    usage: arr(value.usage, []),
    schedules: arr(value.schedules, []),
    looks: arr(value.looks, []),
    stageLayouts: arr(value.stageLayouts, seed.stageLayouts),
    logoMediaId: typeof value.logoMediaId === 'string' ? value.logoMediaId : null,
    sunday: churchStyle({ ...seed.sunday, ...(isObj(value.sunday) ? value.sunday : {}) }, isObj(value.sunday) ? value.sunday.styleVersion : undefined),
  };
}

/**
 * Slides made when FreeCast was 16:9 (1920 wide) → the 4:3 canvas: objects keep their place
 * relative to the centre, the way the wider background is trimmed at both sides. An object that
 * would end up off the slide is pulled back so at least part of it stays visible.
 */
export function toFourThree(presentations: Library['presentations']): Library['presentations'] {
  const dx = (LEGACY_CANVAS_W - CANVAS_W) / 2;
  return presentations.map((p) => ({
    ...p,
    slides: p.slides.map((s) =>
      s.elements?.length
        ? { ...s, elements: s.elements.map((e) => ({ ...e, x: Math.min(CANVAS_W - 40, Math.max(40 - e.w, Math.round(e.x - dx))) })) }
        : s,
    ),
  }));
}

/**
 * Once each: defaults matched to the church's own PPT (changeable afterwards) —
 * v1 one Bible verse per slide, v2 up to four lyric lines per slide.
 */
function churchStyle(sunday: Library['sunday'], saved: unknown): Library['sunday'] {
  const done = typeof saved === 'number' ? saved : 0;
  let next = sunday;
  if (done < 1) next = { ...next, versesPerSlide: 1 };
  if (done < 2) next = { ...next, linesPerSlide: 4 };
  return { ...next, styleVersion: 2 };
}

export const isLibrary = (value: unknown): boolean => normalizeLibrary(value) !== null;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked; the app keeps working in memory.
  }
}

export function loadLibrary(): Library {
  return normalizeLibrary(read(LIBRARY_KEY)) ?? createSeedLibrary();
}

/** Online songs are never written to this computer — only the user's own presentations. */
export const saveLibrary = (lib: Library) => write(LIBRARY_KEY, { ...lib, presentations: lib.presentations.filter((p) => !p.online) });
export const saveLive = (live: LiveState) => write(LIVE_KEY, live);
export const loadLive = (): LiveState | null => {
  const v = read(LIVE_KEY);
  return isObj(v) && 'theme' in v ? (v as unknown as LiveState) : null;
};
