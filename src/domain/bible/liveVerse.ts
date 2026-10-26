// A verse called for during the service (spoken, typed on a tablet, or picked from what was detected):
// one deck, "성경 · 요한복음 3:16", rebuilt each time and placed right after the slide on screen,
// so the show carries on into the next slide when the verse is done.
import type { Action, AppState } from '../reducer';
import type { Presentation } from '../types';
import { activePlaylist } from '../live';
import { uid } from '../lyrics';
import { formatRef, parseRefs } from './refs';
import { TRANSLATIONS } from './data';
import { buildScripture } from './slides';

export const LIVE_VERSE_ID = 'p_live_verse';
const KEY = 'freecast.bible.defaults';

export interface VerseDefaults { translations: string[]; versesPerSlide: number }

export function loadVerseDefaults(): VerseDefaults {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const known = new Set(TRANSLATIONS.map((t) => t.id));
    const translations = Array.isArray(saved?.translations) ? saved.translations.filter((id: unknown) => typeof id === 'string' && known.has(id)).slice(0, 2) : [];
    const per = Number(saved?.versesPerSlide);
    return { translations: translations.length ? translations : ['nkrv'], versesPerSlide: Number.isInteger(per) && per >= 1 && per <= 5 ? per : 2 };
  } catch {
    return { translations: ['nkrv'], versesPerSlide: 2 };
  }
}

export function saveVerseDefaults(d: VerseDefaults) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* the choice just is not remembered */ }
}

export type VerseDeck = { deck: Presentation; label: string } | { error: string };

/** The slides for the references in `text` (e.g. "요3:16 롬8:28"), in the church's usual look. */
export async function buildVerseDeck(text: string, defaults: VerseDefaults): Promise<VerseDeck> {
  const { refs, invalid } = parseRefs(text);
  if (!refs.length) return { error: `성경 구절을 알아듣지 못했습니다${invalid.length ? `: ${invalid.join(', ')}` : ''}` };
  const translations = defaults.translations.map((id) => TRANSLATIONS.find((t) => t.id === id)).filter((t): t is (typeof TRANSLATIONS)[number] => !!t);
  if (!translations.length) return { error: '성경 번역본을 고르지 않았습니다' };
  try {
    const slides = await buildScripture(refs, { translations, versesPerSlide: defaults.versesPerSlide });
    if (!slides.length) return { error: '해당 구절을 찾지 못했습니다' };
    const label = refs.map((r) => formatRef(r, translations[0].language)).join(', ');
    return { label, deck: { id: LIVE_VERSE_ID, title: `성경 · ${label}`, slides, themeId: 'theme_scripture', folder: 'Scripture' } };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/**
 * Actions that put `deck` in the active playlist right after what is on screen (replacing the earlier
 * call-out) and, with `live`, show its first slide. The remote's slide list keeps the whole service.
 */
export function verseActions(s: AppState, deck: Presentation, live: boolean): Action[] {
  const exists = s.library.presentations.some((p) => p.id === deck.id);
  const actions: Action[] = [exists
    ? { type: 'presentation/update', id: deck.id, patch: { title: deck.title, slides: deck.slides } }
    : { type: 'presentation/createMany', presentations: [deck] }];
  const playlist = activePlaylist(s);
  if (!playlist) return actions;
  const own = (i: { kind?: string; presentationId?: string }) => i.kind !== 'header' && i.presentationId === deck.id;
  const here = s.cursor?.playlistIndex ?? s.playlistIndex;
  const current = here != null ? playlist.items[here] : undefined;
  const rest = playlist.items.filter((i) => !own(i));
  // After what is on screen; a verse already on screen is replaced where it stands; no place → the end.
  const at = !current ? rest.length
    : own(current) ? playlist.items.slice(0, here!).filter((i) => !own(i)).length
    : rest.findIndex((i) => i.id === current.id) + 1;
  const item = { id: uid('pli'), presentationId: deck.id };
  const items = [...rest.slice(0, at), item, ...rest.slice(at)];
  actions.push({ type: 'playlist/set', playlist: { ...playlist, items } });
  if (live) actions.push({ type: 'live/go', presentationId: deck.id, seq: 0, playlistIndex: at });
  return actions;
}
