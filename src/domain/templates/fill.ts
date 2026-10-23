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
import { splitEvenly } from '../sunday/songs';
import { fillSlide, fillTokens, withElementText } from './convert';
import { CANVAS_H, CANVAS_W } from '../canvas';
import type { ServiceTemplates } from './serviceTemplates';
import { centerSongLyrics } from '../songCentering';

export const TEMPLATE_LYRICS_THEME = 'theme_tpl_lyrics';

/** A line that is only a date — "07/12/2026", "7/9/23" — or a date placeholder like "mm/dd/202y". */
const DATE_LINE = /^\s*(?:\d{1,2}|m{1,2})\s*\/\s*(?:\d{1,2}|d{1,2})\s*\/\s*[\dy]{2,4}\s*$/i;
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

const PRAYER_MARK = /기도제목\s*\d/;
const copy = (s: Slide): Slide => fillSlide(s, (t) => t);
const isPrayerSlide = (s: Slide) => texts(s).some((e) => e.role === 'prayer');

const LINE_HEIGHT = 1.2;
const MAX_PRAYER_SIZE = 150;
const MIN_PRAYER_SIZE = 36;

/** Largest font size (canvas px) at which `lines` wrap to fit a w×h box; Korean glyphs are ~1 em wide, Latin ~0.55 em. */
function fillFontSize(lines: string[], w: number, h: number): number {
  const em = (t: string) => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x2e80 ? 0.55 : 1), 0);
  const fits = (size: number) => {
    const perLine = w / size;
    const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(em(l) / perLine)), 0);
    return rows * size * LINE_HEIGHT <= h;
  };
  let lo = MIN_PRAYER_SIZE;
  for (let size = MAX_PRAYER_SIZE; size > MIN_PRAYER_SIZE; size -= 2) if (fits(size)) { lo = size; break; }
  return lo;
}

/** A copy of `design` (a 기도 준비 slide) printing `lines` in its 기도제목 box, as large as the box allows. */
function prayerCopy(design: Slide, lines: { text: string; bold?: boolean }[], group: string): Slide {
  const c = copy(design);
  return {
    ...c, group,
    elements: c.elements!.map((e) => {
      if (e.role !== 'prayer') return e;
      const size = fillFontSize(lines.map((l) => l.text), e.w, e.h);
      const filled = setLines(e, lines);
      return { ...filled, autoFit: true, vAlign: 'middle', lineHeight: LINE_HEIGHT, fontSize: size, paragraphs: filled.paragraphs!.map((p) => ({ ...p, fontSize: size })) };
    }),
  };
}

/**
 * The 기도 준비 slides for these topics, each a copy of `design` (one topic per slide, text sized to fill it). With no topics, one slide with the template's own text (`emptyText`).
 */
function prayerSlides(design: Slide, topics: PrayerTopic[], emptyText: string): Slide[] {
  if (!topics.length) return [prayerCopy(design, emptyText.split('\n').map((text) => ({ text })), design.group === '기도제목' ? 'Front' : design.group)];
  // As the ppt program prints them: numbered topics (any with points) are all "n. 제목" in bold with
  // their points as ● lines; a plain list is one ● line per topic.
  const structured = topics.some((t) => t.points.length);
  let n = 1;
  return planPrayerSlides(topics).map((group) => {
    const lines = group.flatMap((t, i) =>
      structured ? [{ text: `${n + i}. ${t.title}`, bold: true }, ...t.points.map((p) => ({ text: `● ${p}` }))] : [{ text: `● ${t.title}` }],
    );
    n += group.length;
    return prayerCopy(design, lines, '기도제목');
  });
}

const withDate = (s: Slide, date: Date): Slide => ({
  ...s,
  elements: s.elements?.map((e) => (e.kind === 'text' && e.text && e.text.split('\n').some((l) => DATE_LINE.test(l))
    ? withElementText(e, e.text.split('\n').map((l) => (DATE_LINE.test(l) ? mdy(date) : l)).join('\n'))
    : e)),
});

/** The template's 기도제목 box text ("기도제목 1\n기도제목 2"), printed when there are no topics. */
const templatePrayerText = (tpl: ServiceTemplates) =>
  tpl.front.flatMap((s) => texts(s)).find((e) => PRAYER_MARK.test(e.text ?? ''))?.text ?? '기도제목';

/**
 * Bring an existing Front deck up to date — the date on the welcome slide and the 기도 준비
 * slides — while keeping everything else on it exactly as edited.
 */
export function refreshFront(slides: Slide[], tpl: ServiceTemplates, date: Date, topics: PrayerTopic[]): Slide[] {
  const at = slides.findIndex(isPrayerSlide);
  const rest = slides.filter((s) => !isPrayerSlide(s)).map((s) => withDate(s, date));
  if (at < 0) return rest;
  const before = slides.slice(0, at).filter((s) => !isPrayerSlide(s)).length;
  return [...rest.slice(0, before), ...prayerSlides(slides[at], topics, templatePrayerText(tpl)), ...rest.slice(before)];
}

/**
 * Front from the template: 기도제목 on the 기도 준비 slide (as many copies as they need, its corner
 * logo left off), the service date on the welcome slide.
 */
export function fillFront(tpl: ServiceTemplates, date: Date, topics: PrayerTopic[]): Slide[] {
  const slides = tpl.front.map((slide) => {
    const c = copy(slide);
    const box = texts(c).find((e) => PRAYER_MARK.test(e.text ?? ''));
    if (!box) return c;
    const topRight = (e: SlideElement) => e.kind === 'image' && e.x + e.w / 2 > CANVAS_W * 0.6 && e.y + e.h / 2 < CANVAS_H * 0.25;
    return { ...c, elements: c.elements!.filter((e) => !topRight(e)).map((e) => (e === box ? { ...e, role: 'prayer' as const } : e)) };
  });
  return refreshFront(slides, tpl, date, topics);
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
 * stay slide text drawn by the lyrics theme (font, size, colour), so arrangements, the stage display
 * and the OBS overlay keep working. Keeps the song's id, folder and arrangements; per-slide font /
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
  return presentations.filter((p) => !p.slidesEdited && (p.templateKey !== key || skipsTitle(p)) && isSong(p)).map((p) => restyleSong(p, tpl, maxLines));
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
