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
import { planPrayerSlides } from '../sunday/prayer';
import { mdy } from '../sunday/notice';
import { fillSlide, fillTokens } from './convert';
import type { ServiceTemplates } from './serviceTemplates';

export const TEMPLATE_LYRICS_THEME = 'theme_tpl_lyrics';

const DATE_LINE = /^\s*\d{1,2}\s*\/\s*\d{1,2}\s*\/\s*(?:\d{4}|\d{2})\s*$/;
const area = (e: SlideElement) => e.w * e.h;
const texts = (s: Slide) => (s.elements ?? []).filter((e) => e.kind === 'text');

/** Lines with their own weight, styled like the element's first (heading) / second (body) line. */
function setLines(el: SlideElement, lines: { text: string; bold?: boolean }[]): SlideElement {
  const style = el.paragraphs?.[0] ?? { text: '' };
  return {
    ...el,
    text: lines.map((l) => l.text).join('\n'),
    paragraphs: lines.map((l) => ({ ...style, text: l.text, bold: l.bold || undefined })),
  };
}

/** Front: 기도제목 on the 기도 준비 slide (as many copies as they need), the service date on the welcome slide. */
export function fillFront(tpl: ServiceTemplates, date: Date, topics: PrayerTopic[]): Slide[] {
  const out: Slide[] = [];
  for (const slide of tpl.front) {
    const prayerBox = texts(slide).find((e) => /기도제목\s*\d/.test(e.text ?? ''));
    if (prayerBox && topics.length) {
      let n = 1;
      for (const group of planPrayerSlides(topics)) {
        const lines = group.flatMap((t, i) =>
          t.points.length ? [{ text: `${n + i}. ${t.title}`, bold: true }, ...t.points.map((p) => ({ text: `● ${p}` }))] : [{ text: `● ${t.title}` }],
        );
        n += group.length;
        const filled = fillSlide(slide, (t) => t);
        out.push({ ...filled, group: '기도제목', elements: filled.elements!.map((e) => (e.text === prayerBox.text ? setLines(e, lines) : e)) });
      }
      continue;
    }
    out.push(fillSlide(slide, (t) => t.split('\n').map((line) => (DATE_LINE.test(line) ? mdy(date) : line)).join('\n')));
  }
  return out;
}

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
    ...items.map((a, i) =>
      fillSlide(tpl.announceItem, (t, el) => (el.id === titleBox?.id ? `${i + 1}. <${a.title}>` : el.id === bodyBox?.id ? a.body.join('\n') : t), { qr: a.links.length ? a.links : undefined }),
    ),
  ];
}

/** The lyric text box of the template's lyric slide, as a FreeCast theme (lyrics stay plain slide text). */
export function templateLyricsTheme(tpl: ServiceTemplates): Theme {
  const [lyrics] = [...texts(tpl.songLyrics)].sort((a, b) => area(b) - area(a));
  const p = lyrics?.paragraphs?.find((x) => x.text.trim());
  return {
    id: TEMPLATE_LYRICS_THEME, name: '주일 템플릿 (가사)',
    fontFamily: lyrics?.fontFamily ?? '"Nanum Gothic", "Apple SD Gothic Neo", sans-serif',
    fontSize: p?.fontSize ?? lyrics?.fontSize ?? 82, fontWeight: p?.bold ? 700 : 500,
    color: p?.color ?? lyrics?.color ?? '#000000', align: 'center', vAlign: lyrics?.vAlign ?? 'middle',
    lineHeight: 1.25, padding: Math.round(lyrics ? Math.max(lyrics.x, 1920 - lyrics.x - lyrics.w, 120) : 260),
    shadow: false, uppercase: false, subColor: '#555555', subScale: 0.62,
  };
}

/**
 * A song in the template's design: the title slide (watercolor) first, then its lyric slides on the
 * white lyric background with the song title small in the corner. The lyrics stay slide text, so
 * arrangements, the stage display and the OBS overlay keep working.
 */
export function songInTemplate(song: Presentation, tpl: ServiceTemplates, folder: string): Presentation {
  const [, titleBox] = [...texts(tpl.songLyrics)].sort((a, b) => area(b) - area(a));
  const title = song.title;
  const corner = titleBox ? fillSlide({ ...tpl.songLyrics, elements: [titleBox] }, () => title).elements! : [];
  const lyrics = song.slides
    .filter((s) => s.group !== 'Title')
    .map((s) => ({ ...s, id: uid('s'), caption: undefined, background: undefined, elements: [...corner.map((e) => ({ ...e, id: uid('e') })), ...(s.elements ?? [])] }));
  return {
    ...song,
    id: uid('p'),
    online: undefined,
    folder,
    themeId: TEMPLATE_LYRICS_THEME,
    background: tpl.songLyrics.background,
    slides: [fillSlide(tpl.songTitle, () => title), ...lyrics],
    arrangements: song.arrangements?.map((a) => ({ ...a, groups: a.groups.filter((g) => g !== 'Title') })),
  };
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
    ...f.chunks.map((c) =>
      fillSlide(tpl.bibleVerse, (t) => {
        if (t.includes('{{BODY2}}') && !c.lines2.length) return null;
        return fillTokens(t, {
          RANGE_KO, RANGE_EN, TITLE: c.nameKo, ETITLE: c.nameEn, CHAP: String(c.chapter), PARA: c.verses,
          BODY: c.lines.join('\n'), BODY2: c.lines2.join('\n'),
        });
      }, { group: c.label }),
    ),
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
