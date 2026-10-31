// Puts this week's content into the church template slides — the same substitutions the
// shrlak/ppt program makes in its .pptx files: the date on the welcome slide, 기도제목 on the
// 기도 준비 slide, song titles, Bible verses ({{TITLE}} {{CHAP}}장 {{PARA}}절 …), the sermon
// title and one 광고 slide per announcement.
import type { Presentation, Slide, SlideElement, Theme } from '../types';
import { uid } from '../lyrics';
import { formatRef, type BibleRef } from '../bible/refs';
import type { ScriptureChunk } from '../bible/slides';
import type { Announcement } from '../sunday/announcements';
import type { PrayerTopic } from '../sunday/prayer';
import { mdy } from '../sunday/notice';
import { splitEvenly } from '../sunday/songs';
import { fillSlide, fillTokens } from './convert';
import { CANVAS_W } from '../canvas';
import { keepFrontLayout } from '../frontLayout';
import type { ServiceTemplates } from './serviceTemplates';
import { centerSongLyrics } from '../songCentering';
import { prepareAnnouncementSlide } from '../announcementSizing';

export const TEMPLATE_LYRICS_THEME = 'theme_tpl_lyrics';

/** A line that is only a date — "07/12/2026", "7/9/23" — or a date placeholder like "mm/dd/202y". */
const DATE_LINE = /^\s*(?:\d{1,2}|m{1,2})\s*\/\s*(?:\d{1,2}|d{1,2})\s*\/\s*[\dy]{2,4}\s*$/i;
const area = (e: SlideElement) => e.w * e.h;
const texts = (s: Slide) => (s.elements ?? []).filter((e) => e.kind === 'text');

/** Update date text without changing the original text box or paragraph styling. */
const withDate = (s: Slide, date: Date): Slide => {
  const replace = (text: string) => text.replace(/\{date\}/g, mdy(date)).split('\n').map((line) => DATE_LINE.test(line) ? mdy(date) : line).join('\n');
  return keepFrontLayout({ ...s, text: replace(s.text), ...(s.title ? { title: replace(s.title) } : {}), ...(s.subtext ? { subtext: replace(s.subtext) } : {}),
    elements: s.elements?.map((e) => e.kind === 'text' && e.text && replace(e.text) !== e.text
      ? { ...e, text: replace(e.text), paragraphs: e.paragraphs?.map((p) => ({ ...p, text: replace(p.text) })) } : e) });
};

/** Restore the source Front design, retaining page/object identities where possible. Only dates differ. */
export function refreshFront(slides: Slide[], tpl: ServiceTemplates, date: Date, _topics: PrayerTopic[] = []): Slide[] {
  return fillFront(tpl, date).map((s, i) => ({ ...s, id: slides[i]?.id ?? s.id,
    elements: s.elements?.map((e, n) => ({ ...e, id: slides[i]?.elements?.[n]?.kind === e.kind ? slides[i].elements![n].id : e.id })) }));
}

/** Keep Front typography and content; change dates and omit the prayer page's corner logo only. */
export function fillFront(tpl: ServiceTemplates, date: Date, _topics: PrayerTopic[] = []): Slide[] {
  return tpl.front.map((s) => withDate({ ...s, id: uid('s'), elements: s.elements?.map((e) => ({ ...e, id: uid('e') })) }, date));
}

/** Date-only fallback when the church source file is unavailable. */
export const updateFrontDate = (slides: Slide[], date: Date): Slide[] => slides.map((s) => withDate(s, date));

export const prayerSlide = (tpl: ServiceTemplates): Slide => fillSlide(tpl.prayer, (t) => t);

/** The church's closing deck, as it is (fresh copies). */
export const backSlides = (tpl: ServiceTemplates): Slide[] => (tpl.back ?? []).map((s) => fillSlide(s, (t) => t));

/** FreeCast's built-in placeholder Back deck, which the church deck replaces in the library. */
export const isPlaceholderBack = (p: Presentation | undefined) => !!p && p.slides.some((s) => s.id === 'back_confession');

/** 광고: the title slide, then one slide per announcement ("1. <제목>", then its lines). */
export function announcementSlides(tpl: ServiceTemplates, items: Announcement[]): Slide[] {
  if (!items.length) return [];
  const [, titleBox, bodyBox] = [...texts(tpl.announceItem)].sort((a, b) => a.y - b.y);
  return [
    fillSlide(tpl.announceTitle, (t) => t),
    ...items.map((a, i) => {
      const slide = fillSlide(tpl.announceItem, (t, el) => (el.id === titleBox?.id ? `${i + 1}. <${a.title}>` : el.id === bodyBox?.id ? a.body.join('\n') : t), { qr: a.links.length ? a.links : undefined });
      return prepareAnnouncementSlide(slide);
    }),
  ];
}

/** The lyric text box of the template's lyric slide, as a FreeCast theme (lyrics stay plain slide text). */
export function templateLyricsTheme(tpl: ServiceTemplates): Theme {
  const [lyrics] = [...texts(tpl.songLyrics)].sort((a, b) => area(b) - area(a));
  const p = lyrics?.paragraphs?.find((x) => x.text.trim());
  return {
    id: TEMPLATE_LYRICS_THEME, name: '주일 템플릿 (가사)',
    fontFamily: lyrics?.fontFamily ?? '"Arial", Arimo, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    fontSize: p?.fontSize ?? lyrics?.fontSize ?? 82, fontWeight: p?.bold ? 700 : 400,
    color: p?.color ?? lyrics?.color ?? '#000000', align: 'center', vAlign: 'middle',
    // The ppt program sets lyric lines to 125% spacing; PowerPoint's single spacing for Arial is ~1.15 em.
    lineHeight: 1.44, padding: Math.round(lyrics ? Math.max(lyrics.x, CANVAS_W - lyrics.x - lyrics.w, 120) : 260),
    shadow: false, uppercase: false, subColor: '#555555', subScale: 0.62,
  };
}

/**
 * A song in the church template's design (as the ppt program builds it from template.pptx): a title
 * slide (watercolor), then each part split as evenly as possible into slides of at most `maxLines`
 * lines, on the white lyric background with the song title in the corner and the logo. The lyrics
 * stay slide text drawn by the lyrics theme (font, size, colour), so arrangements and the stage display
 * keep working. Keeps the song's id, folder and arrangements; per-slide font /
 * colour / background overrides are cleared so every song looks the same.
 */
export function restyleSong(song: Presentation, tpl: ServiceTemplates, maxLines: number): Presentation {
  const [lyricBox, titleBox] = [...texts(tpl.songLyrics)].sort((a, b) => area(b) - area(a));
  const title = song.title;
  // Everything on the template's lyric slide except its lyrics box: the logo, any boxes, and the
  // song title in the corner.
  const corner = fillSlide(
    { ...tpl.songLyrics, elements: (tpl.songLyrics.elements ?? []).filter((e) => e !== lyricBox) },
    (t, el) => (el === titleBox ? title : t),
  ).elements!;
  const lyricSlide = (base: Partial<Slide> & Pick<Slide, 'group' | 'text'>): Slide => ({
    ...base, id: uid('s'), caption: undefined, background: undefined, style: undefined, elements: corner.map((e) => ({ ...e, id: uid('e') })),
  });

  // A song already laid out the church's way at this size keeps its slide breaks (blank-line breaks
  // included). Otherwise consecutive slides of one part are re-split together; a part with
  // second-language lines (subtext) keeps its slides as they are, since its lines are paired.
  const lyrics: Slide[] = [];
  const body = song.slides.filter((s) => s.group !== 'Title');
  const laidOut = song.lyricsLayout?.linesPerSlide === maxLines;
  for (let i = 0; i < body.length; ) {
    if (laidOut) {
      lyrics.push(lyricSlide({ ...body[i] }));
      i++;
      continue;
    }
    let j = i;
    while (j < body.length && body[j].group === body[i].group) j++;
    const run = body.slice(i, j);
    if (run.some((s) => s.subtext)) lyrics.push(...run.map((s) => lyricSlide({ ...s })));
    else {
      const lines = run.flatMap((s) => s.text.split('\n')).map((l) => l.trim()).filter(Boolean);
      const { notes, label } = run[0];
      for (const chunk of splitEvenly(lines, maxLines)) lyrics.push(lyricSlide({ group: run[0].group, text: chunk.join('\n'), notes, label }));
    }
    i = j;
  }
  return centerSongLyrics({
    ...song, lyricsCentered: undefined,
    themeId: TEMPLATE_LYRICS_THEME,
    background: tpl.songLyrics.background,
    slides: [{ ...fillSlide(tpl.songTitle, () => title), group: 'Title' }, ...lyrics],
    // The song plays its 진행 (repeats included), opening on the title slide.
    arrangements: song.arrangements?.map((a) => ({ ...a, groups: ['Title', ...a.groups.filter((g) => g !== 'Title')] })),
    arrangementId: song.arrangementId ?? song.arrangements?.[0]?.id,
    lyricsLayout: { linesPerSlide: maxLines },
    templateKey: songKey(tpl, maxLines),
  });
}

/** Marks a song restyled to this template at this many lines (v2: plays its 진행). */
const songKey = (tpl: ServiceTemplates, maxLines: number) => `song:${tpl.keys.song}|${maxLines}|seq`;

/** A copy of a song in the template's design for this week's service (new id, the service's folder). */
export function songInTemplate(song: Presentation, tpl: ServiceTemplates, folder: string, maxLines = 4): Presentation {
  const styled = song.slidesEdited ? { ...song, slides: song.slides.map((s) => ({ ...s, id: uid('s'), elements: s.elements?.map((e) => ({ ...e, id: uid('e') })) })) } : restyleSong(song, tpl, maxLines);
  return centerSongLyrics({ ...styled, id: uid('p'), online: undefined, folder });
}

/** Is this presentation a song (lyrics by part), as opposed to an announcement or a scripture deck? */
export function isSong(p: Presentation): boolean {
  // A song laid out by FreeCast (lyricsLayout) counts wherever it sits — a copy made for a service in an
  // earlier version, in the old look, is brought into the template design (and gets its title slide) too.
  const looksLikeSong = p.online || p.folder === 'Songs' || p.themeId === TEMPLATE_LYRICS_THEME || !!p.lyricsLayout;
  // Retreat songs come pre-laid-out as "Slide 1, 2…" in the retreat design and are left as they are.
  const parts = p.slides.filter((s) => s.group !== 'Title');
  return !!looksLikeSong && parts.length > 0 && parts.some((s) => !/^Slide( \d+)?$/.test(s.group));
}

/** Songs that are not yet in the current template design (with this many lines per slide), restyled. */
export function songStyleUpdates(presentations: Presentation[], tpl: ServiceTemplates, maxLines: number): Presentation[] {
  const key = songKey(tpl, maxLines);
  // (A song in the template design whose 진행 skips its title slide is redone too: the title must open the song.)
  const skipsTitle = (p: Presentation) => !!p.arrangements?.some((a) => !a.groups.includes('Title')) && p.slides.some((s) => s.group === 'Title');
  return presentations.filter((p) => !p.protected && !p.slidesEdited && (p.templateKey !== key || skipsTitle(p)) && isSong(p)).map((p) => restyleSong(p, tpl, maxLines));
}

export interface ScriptureFill {
  refs: BibleRef[];
  chunks: ScriptureChunk[];
  sermonTitle?: string;
  preacher?: string;
}

const ranges = (refs: BibleRef[], lang: 'ko' | 'en') => refs.map((r) => formatRef(r, lang)).join(', ');

/** 성경 말씀 title slide + one slide per verse chunk, from the Bible template. */
export function scriptureSlides(tpl: ServiceTemplates, f: ScriptureFill): Slide[] {
  if (!f.chunks.length) return [];
  const RANGE_KO = ranges(f.refs, 'ko');
  const RANGE_EN = ranges(f.refs, 'en');
  return [
    fillSlide(tpl.bibleTitle, (t) => fillTokens(t, { RANGE_KO, RANGE_EN })),
    ...f.chunks.map((c) => {
      // The template prints the Korean verse (under the Korean book name) first and the English one
      // below, whichever translation was picked first.
      const swap = c.langs[0] === 'en' && c.langs[1] === 'ko';
      const [ko, en] = swap ? [c.texts2, c.texts] : [c.texts, c.texts2];
      return fillSlide(tpl.bibleVerse, (t) => {
        if (t.includes('{{BODY2}}') && !en.length) return null;
        // Verse texts run on without verse numbers, as the ppt program prints them.
        return fillTokens(t, {
          RANGE_KO, RANGE_EN, TITLE: c.nameKo, ETITLE: c.nameEn, CHAP: String(c.chapter), PARA: c.verses,
          BODY: ko.join(' '), BODY2: en.join(' '),
        });
      }, { group: c.label });
    }),
  ];
}

/** 설교 title slide: sermon title, the reading, and the preacher (template text when none is given). */
export function sermonTitleSlide(tpl: ServiceTemplates, f: Pick<ScriptureFill, 'refs' | 'sermonTitle' | 'preacher'>): Slide {
  const RANGE_KO = ranges(f.refs, 'ko');
  return fillSlide(tpl.sermon, (t, el) => {
    if (t.includes('{{')) return fillTokens(t, { SERMON_TITLE: f.sermonTitle?.trim(), RANGE_KO });
    if (f.preacher?.trim() && /목사|전도사|선교사/.test(t) && el.y > 700) return f.preacher.trim();
    return t;
  });
}
