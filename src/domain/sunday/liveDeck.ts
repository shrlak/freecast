// This week's 주일예배 as one live playlist, laid out like the ppt program's deck from the church
// templates. Uploads (콘티, 가사, 설교 슬라이드) are dropped straight into their section, so the
// service builds itself while it is open — even while it is on screen.
//
//   Front → 찬양 → 기도 → 성경 말씀 → 설교 → 기도 → 설교 후 찬양 (+ 기도) → 광고 → Back / End
import type { Library, Playlist, PlaylistItem, Presentation } from '../types';
import { uid } from '../lyrics';
import { mdy, mmdd } from './notice';
import { parsePrayerTopics } from './prayer';
import type { ServiceTemplates } from '../templates/serviceTemplates';
import { DEFAULT_CONFESSION_SONG } from '../defaults';
import { applyConfessionSong, pickConfessionSong } from '../templates/confession';
import { backSlides, fillFront, isPlaceholderBack, prayerSlide, sermonTitleSlide } from '../templates/fill';

/** Back slides with this season's 공동체 고백송 (the setting, else the default) printed in them. */
export function confessionBack(lib: Library, slides: Presentation['slides'], pick?: string): Presentation['slides'] {
  const { song } = pickConfessionSong(lib.presentations, [pick, lib.sunday.confessionSong, DEFAULT_CONFESSION_SONG]);
  return (song && applyConfessionSong(slides, song, lib.sunday.linesPerSlide)?.map((s) => ({ ...s, id: uid('s') }))) || slides;
}

export const SECTION = {
  front: 'Front',
  songs: '찬양',
  bible: '성경 말씀',
  sermon: '설교',
  after: '설교 후 찬양',
  announcements: '광고',
  back: 'Back / End',
} as const;
export type SectionTitle = (typeof SECTION)[keyof typeof SECTION];

export const liveServiceName = (date: Date) => `${mmdd(date)} 주일예배`;
export const liveFolder = (date: Date) => `${mmdd(date)} 주일예배`;

export interface LiveService {
  presentations: Presentation[];
  playlist: Playlist;
}

const header = (title: string): PlaylistItem => ({ id: uid('pli'), kind: 'header', title });
const item = (presentationId: string): PlaylistItem => ({ id: uid('pli'), presentationId });

/** The week's empty service: template Front, 기도, 설교 title, and the library's Back deck. */
export function createLiveService(lib: Library, tpl: ServiceTemplates | null, date: Date): LiveService {
  const folder = liveFolder(date);
  const tag = mmdd(date);
  const byId = (id: string | null) => (id ? lib.presentations.find((p) => p.id === id) : undefined);
  const make = (title: string, slides: Presentation['slides'], extra: Partial<Presentation> = {}): Presentation => ({
    id: uid('p'), title, slides, themeId: 'theme_classic', folder, background: { kind: 'color', value: '#000000' }, ...extra,
  });
  const created: Presentation[] = [];
  const add = (p: Presentation) => (created.push(p), p);

  // The library's Front deck already shows this Sunday's date and 기도제목 (templates/register.ts);
  // the service uses it directly, so later 기도제목 changes show up here too.
  const libFront = byId(lib.sunday.frontId);
  const synced = libFront?.templateKey?.startsWith('front:') && libFront.templateKey.includes(`|${mdy(date)}|`);
  const front = synced || !tpl ? libFront : add(make(`${tag} Front`, fillFront(tpl, date, parsePrayerTopics(lib.sunday.prayerText ?? ''))));
  const prayer = tpl ? add(make(`${tag} 기도`, [prayerSlide(tpl)])) : byId(lib.sunday.prayerId);
  const sermon = add(make(`${tag} 설교`, tpl ? [sermonTitleSlide(tpl, { refs: [] })] : []));
  const libBack = byId(lib.sunday.backId);
  const back = tpl?.back?.length && (!libBack || isPlaceholderBack(libBack)) ? add(make(`${tag} Back`, confessionBack(lib, backSlides(tpl)))) : libBack;

  const items: PlaylistItem[] = [header(SECTION.front)];
  if (front) items.push(item(front.id));
  items.push(header(SECTION.songs));
  if (prayer) items.push(item(prayer.id));
  items.push(header(SECTION.bible), header(SECTION.sermon), item(sermon.id));
  if (prayer) items.push(item(prayer.id));
  items.push(header(SECTION.after), header(SECTION.announcements), header(SECTION.back));
  if (back) items.push(item(back.id));
  return { presentations: created, playlist: { id: uid('pl'), name: liveServiceName(date), items } };
}

export const findLiveService = (lib: Library, date: Date) => lib.playlists.find((p) => p.name === liveServiceName(date));

/** Index range [start, end) of a section's items (after its header, up to the next header). */
export function sectionRange(pl: Playlist, title: string): [number, number] | null {
  const h = pl.items.findIndex((i) => i.kind === 'header' && i.title === title);
  if (h < 0) return null;
  let end = h + 1;
  while (end < pl.items.length && pl.items[end].kind !== 'header') end++;
  return [h + 1, end];
}

const isPresentation = (i: PlaylistItem, id: string | null | undefined) => i.kind !== 'header' && !!id && i.presentationId === id;

/** The 기도 presentation this service uses (the item that closes the 찬양 section). */
export function servicePrayerId(pl: Playlist): string | null {
  const r = sectionRange(pl, SECTION.songs);
  const last = r && r[1] > r[0] ? pl.items[r[1] - 1] : undefined;
  return last && last.kind !== 'header' ? last.presentationId : null;
}

/**
 * Put presentations into a section — before the section's closing 기도 when it has one.
 * `replace` first removes the section's other items (except that 기도): a new 콘티 replaces the old set list.
 * Songs going into 설교 후 찬양 get the 기도 that follows them, as in the ppt program.
 */
export function insertIntoSection(pl: Playlist, title: SectionTitle, presentationIds: string[], opts: { replace?: boolean; keep?: string[] } = {}): Playlist {
  const prayerId = servicePrayerId(pl);
  let items = [...pl.items];
  let range = sectionRange({ ...pl, items }, title);
  if (!range) {
    items.push(header(title));
    range = [items.length, items.length];
  }
  if (opts.replace) {
    const [s, e] = range;
    // An emptied 설교 후 찬양 loses its 기도 too; elsewhere the closing 기도 stays.
    const keepPrayer = title !== SECTION.after || presentationIds.length > 0;
    const kept = items.slice(s, e).filter((i) => (keepPrayer && isPresentation(i, prayerId)) || (i.kind !== 'header' && opts.keep?.includes(i.presentationId)));
    items = [...items.slice(0, s), ...kept, ...items.slice(e)];
    range = [s, s + kept.length];
  }
  const [s, e] = range;
  let at = e;
  while (at > s && isPresentation(items[at - 1], prayerId)) at--;
  const added = presentationIds.map(item);
  items = [...items.slice(0, at), ...added, ...items.slice(at)];
  if (title === SECTION.after && prayerId && added.length) {
    const end = sectionRange({ ...pl, items }, title)![1];
    if (!isPresentation(items[end - 1], prayerId)) items.splice(end, 0, item(prayerId));
  }
  return { ...pl, items };
}

/** Presentation ids in a section, in order (without the closing 기도). */
export function sectionPresentations(pl: Playlist, title: string): string[] {
  const r = sectionRange(pl, title);
  if (!r) return [];
  const prayerId = servicePrayerId(pl);
  return pl.items.slice(r[0], r[1]).flatMap((i) => (i.kind === 'header' || i.presentationId === prayerId ? [] : [i.presentationId]));
}
