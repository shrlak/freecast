import type { Library, Playlist, PlaylistItem, Presentation, Slide } from '../types';
import { uid } from '../lyrics';
import { CHURCH_BACKGROUNDS, DEFAULT_CONFESSION_SONG, PRAYER_PREP_TITLE } from '../defaults';
import { findSong, songToPresentation, withProgression, type SongDraft } from './songs';
import { planPrayerSlides, prayerSlideText, type PrayerTopic } from './prayer';
import { announcementPages, type Announcement } from './announcements';
import { qrElements } from '../qrElements';
import { mmdd } from './notice';
import { OPENING_SECTION } from './openingSong';
import type { ServiceTemplates } from '../templates/serviceTemplates';
import { applyConfessionSong, pickConfessionSong } from '../templates/confession';
import { announcementSlides, backSlides, fillFront, updateFrontDate, isPlaceholderBack, prayerSlide, scriptureSlides, sermonTitleSlide, songInTemplate, type ScriptureFill } from '../templates/fill';

export interface ServiceInput {
  date: Date;
  songs: SongDraft[];
  scriptureSlides: Slide[];
  sermonSlides: Slide[];
  prayerTopics: PrayerTopic[];
  announcements: Announcement[];
  extraSlides: Slide[];
  /** Title of the 공동체 고백 song for the Back slides (this week's notice wins over settings). */
  confessionSong?: string;
  /** The church .pptx templates; when given, every section uses their design. */
  templates?: ServiceTemplates | null;
  /** Verses for the Bible template (used instead of scriptureSlides when templates are given). */
  scripture?: ScriptureFill;
  /** 기도회 찬양: the sheet-music deck sung before the Front (기도제목) slides; already in the library. */
  openingSong?: Presentation | null;
}

export interface BuiltService {
  presentations: Presentation[];
  playlist: Playlist;
  warnings: string[];
}

const cloneSlides = (slides: Slide[]) => slides.map((s) => ({ ...s, id: uid('s') }));

/**
 * Build this Sunday's presentations and playlist in the fixed order:
 * (기도회 찬양) → Front → 찬양 → 기도 → 성경 말씀 → 설교 → 기도 → 설교 후 찬양 → 기도 → 광고 → Back/End → 추가 자료.
 * Sections with nothing in them are skipped, along with the prayer that follows them.
 */
export function buildService(lib: Library, input: ServiceInput): BuiltService {
  const { sunday } = lib;
  const folder = `${mmdd(input.date)} 주일예배`;
  const created: Presentation[] = [];
  const items: PlaylistItem[] = [];
  const warnings: string[] = [];
  const byId = (id: string | null) => (id ? lib.presentations.find((p) => p.id === id) : undefined);
  const header = (title: string) => items.push({ id: uid('pli'), kind: 'header', title });
  const add = (p: Presentation, isNew: boolean) => {
    if (isNew) created.push(p);
    items.push({ id: uid('pli'), presentationId: p.id });
  };
  const make = (title: string, slides: Slide[], themeId: string, extra: Partial<Presentation> = {}): Presentation => ({
    id: uid('p'), title, slides, themeId, folder, ...extra,
  });
  const tpl = input.templates ?? null;
  const tplPrayer = tpl ? make('기도', [prayerSlide(tpl)], 'theme_classic', { background: { kind: 'color', value: '#000000' } }) : null;
  const prayer = tplPrayer ?? byId(sunday.prayerId);
  let prayerAdded = false;
  const addPrayer = () => {
    if (!prayer) return;
    add(prayer, !!tplPrayer && !prayerAdded);
    prayerAdded = true;
  };

  // The song sung before the 기도회 opens the service, ahead of the Front's 기도제목.
  if (input.openingSong?.slides.length) {
    header(OPENING_SECTION);
    add(input.openingSong, !lib.presentations.some((p) => p.id === input.openingSong!.id));
  }

  // Front keeps the source design; its date and 기도제목 change.
  const front = byId(sunday.frontId);
  if (tpl) {
    header('Front');
    add(make(`${mmdd(input.date)} Front`, fillFront(tpl, input.date, input.prayerTopics), 'theme_classic', { background: { kind: 'color', value: '#000000' } }), true);
  } else if (front) {
    // The built-in Front: its 기도 준비 slide printed once per 기도제목.
    const pages = planPrayerSlides(input.prayerTopics);
    const withTopics = front.slides.flatMap((s) => (s.title === PRAYER_PREP_TITLE && pages.length ? pages.map((group, i) => ({ ...s, text: prayerSlideText(group, i + 1) })) : [s]));
    const slides = updateFrontDate(withTopics.map((s) => ({ ...s, id: uid('s') })), input.date);
    header('Front');
    add({ ...front, id: uid('p'), title: `${mmdd(input.date)} Front`, folder, slides }, true);
  }

  const songPres = (song: SongDraft): Presentation | null => {
    const existing = (song.presentationId && byId(song.presentationId)) || (!song.sections.length ? findSong(lib.presentations, song.title) : undefined);
    if (existing) {
      if (song.progression?.length) {
        const arranged = withProgression(existing, song.progression);
        if (arranged !== existing) return { ...arranged, id: uid('p'), folder, slides: cloneSlides(existing.slides) };
      }
      return existing;
    }
    if (!song.sections.length) {
      warnings.push(`“${song.title}”: no lyrics found — add them in the editor`);
      return make(song.title, [{ id: uid('s'), group: 'Title', text: song.title }], 'theme_sunday', { meta: song.key ? { key: song.key } : undefined, background: CHURCH_BACKGROUNDS.watercolor });
    }
    return { ...songToPresentation(song, { themeId: 'theme_sunday', linesPerSlide: sunday.linesPerSlide, folder: 'Songs' }), background: CHURCH_BACKGROUNDS.watercolor };
  };
  const addSong = (song: SongDraft) => {
    const p = songPres(song);
    if (p && tpl) add(songInTemplate(p, tpl, folder, sunday.linesPerSlide), true);
    else if (p) add(p, !lib.presentations.includes(p));
  };

  const before = input.songs.filter((s) => !s.postSermon);
  const after = input.songs.filter((s) => s.postSermon);
  if (before.length) {
    header('찬양');
    before.forEach(addSong);
    addPrayer();
  }
  const black = { background: { kind: 'color', value: '#000000' } } as const;
  if (tpl && input.scripture?.chunks.length) {
    header('성경 말씀');
    add(make('성경 말씀', scriptureSlides(tpl, input.scripture), 'theme_classic', black), true);
  } else if (input.scriptureSlides.length) {
    header('성경 말씀');
    add(make('성경 말씀', input.scriptureSlides, 'theme_sunday_scripture', { background: CHURCH_BACKGROUNDS.watercolor }), true);
  }
  const sermonTitle = tpl && input.scripture && (input.scripture.sermonTitle?.trim() || input.sermonSlides.length) ? [sermonTitleSlide(tpl, input.scripture)] : [];
  if (input.sermonSlides.length || sermonTitle.length) {
    header('설교');
    add(make('설교', [...sermonTitle, ...input.sermonSlides], 'theme_classic', tpl ? black : {}), true);
    addPrayer();
  }
  if (after.length) {
    header('설교 후 찬양');
    after.forEach(addSong);
    addPrayer();
  }
  if (tpl && input.announcements.length) {
    header('광고');
    add(make('광고', announcementSlides(tpl, input.announcements), 'theme_classic', black), true);
  } else if (input.announcements.length) {
    header('광고');
    const slides = input.announcements.flatMap((a, i) => announcementPages(a).map((pg) => ({
      id: uid('s'), group: '광고', title: `${i + 1}. ${a.title}`, text: pg.body.join('\n'), elements: pg.links.length ? qrElements(pg.links) : undefined,
    })));
    add(make('광고', slides, 'theme_sunday_info', { background: CHURCH_BACKGROUNDS.watercolor }), true);
  }

  const back = byId(sunday.backId);
  const fromTemplate = !!tpl?.back?.length && (!back || isPlaceholderBack(back));
  if (fromTemplate || back) {
    // This week's 고백송 (wizard) wins, then the setting, then the default; the church Back deck prints
    // the song itself, so its block is rewritten — in the template's fresh copy as well as in the library's deck.
    const { song: confession, missing } = pickConfessionSong(lib.presentations, [input.confessionSong, sunday.confessionSong, DEFAULT_CONFESSION_SONG]);
    if (missing) warnings.push(`공동체 고백 “${missing}” is not in the library — ${confession ? `“${confession.title}” is used instead` : 'the Back slides keep their song'}`);
    const source = fromTemplate ? backSlides(tpl!) : back!.slides;
    const rewritten = confession ? applyConfessionSong(source, confession, sunday.linesPerSlide) : null;
    const slides = rewritten
      ? rewritten.map((s) => ({ ...s, id: uid('s') }))
      : fromTemplate
        ? source
        : source.flatMap((s) =>
            s.group === '공동체 고백' && confession ? confession.slides.map((c) => ({ ...c, id: uid('s'), group: `공동체 고백 · ${c.group}` })) : [{ ...s, id: uid('s') }],
          );
    header('Back / End');
    add(fromTemplate ? make(`${mmdd(input.date)} Back`, slides, 'theme_classic', black) : { ...back!, id: uid('p'), title: `${mmdd(input.date)} Back`, folder, slides, templateKey: undefined }, true);
  }
  if (input.extraSlides.length) {
    header('추가 자료');
    add(make('추가 자료', input.extraSlides, 'theme_classic'), true);
  }

  return { presentations: created, playlist: { id: uid('pl'), name: `${mmdd(input.date)} 주일예배`, items }, warnings };
}
