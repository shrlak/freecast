import PptxGenJS from 'pptxgenjs';
import type { Background, Library, ListStyle, Playlist, Presentation, Theme } from '../types';
import { sequence } from '../arrangement';
import { getMedia } from '../media';
import { qrDataUrl } from './qr';
import { stripChords } from '../lyrics';
import { pptxFont } from '../fonts';
import { CANVAS_W } from '../canvas';
import { fitTextElement } from '../textBoxLayout';
import { fitSlideText } from '../slideTextLayout';
import { textElementBounds } from '../textBox';
import { prepareAnnouncementSizing } from '../announcementSizing';
import { isFrontPresentation, isFrontSlide } from '../frontLayout';
import { resolveBackground } from '../autoBackground';
import { motionFlatColor } from '../motion';

const W = 10;
const H = 7.5;
const PX = W / CANVAS_W; // inches per canvas pixel (4:3 slides, 10 × 7.5 in)

function firstColor(b: Background | undefined | null): string {
  if (!b) return '000000';
  if (b.kind === 'color') return b.value.replace('#', '').slice(0, 6);
  if (b.kind === 'gradient') return (/#([0-9a-f]{6})/i.exec(b.value)?.[1] ?? '000000');
  if (b.kind === 'motion') return motionFlatColor(b).replace('#', '');
  return '000000';
}

/** 취소선, 문자 간격, 강조 색, 글머리 기호 / 번호, 들여쓰기, 세로 쓰기 — in PowerPoint's terms. */
function textOptions(f: { strike?: boolean; letterSpacing?: number; highlight?: string; list?: ListStyle; indent?: number; vertical?: boolean }) {
  const numbered = f.list === 'number' || f.list === 'number-paren' || f.list === 'roman' || f.list === 'alpha' || f.list === 'hangul';
  const numberType = ({ 'number-paren': 'arabicParenR', roman: 'romanUcPeriod', alpha: 'alphaUcPeriod' } as const)[f.list as 'roman'] ?? 'arabicPeriod';
  return {
    strike: f.strike ? ('sngStrike' as const) : undefined,
    charSpacing: f.letterSpacing ? f.letterSpacing * 0.5 : undefined,
    highlight: f.highlight?.replace('#', ''),
    bullet: f.list ? (numbered ? { type: 'number' as const, style: numberType } : { characterCode: { circle: '25CB', square: '25A0', check: '2713', arrow: '27A2' }[f.list as 'circle'] ?? '2022' }) : undefined,
    indentLevel: f.indent || undefined,
    vert: f.vertical ? ('eaVert' as const) : undefined,
  };
}

async function dataUrl(mediaId: string): Promise<string | null> {
  const blob = await getMedia(mediaId);
  if (!blob) return null;
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => res(null);
    r.readAsDataURL(blob);
  });
}

async function urlData(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(new URL(url, location.origin))).blob();
    return await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => res(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const fontFace = (t: Theme) => pptxFont(t.fontFamily);

/*
 * What keeps the exported slides looking like the screen:
 * - No inner margin: a FreeCast box is already the text area (importing a PowerPoint deck takes
 *   its margins off), so PowerPoint's default 0.1" / 0.05" would make lines wrap sooner and spill.
 * - Line spacing as exact points (font size × the screen's line height): PowerPoint's "multiple"
 *   counts in the font's own line height, which differs by font (and by the Korean fallback font).
 * - Korean text marked Korean, as in the church decks, so PowerPoint picks its Korean font for it.
 */
const NO_MARGIN = 0;
const HANGUL = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/;
const langOf = (text: string) => (HANGUL.test(text) ? 'ko-KR' : undefined);
/** Points between lines for text of `sizePx` canvas pixels at line height `lineHeight` (×font size). */
const linePts = (sizePx: number, lineHeight: number) => Math.round(sizePx * 0.5 * lineHeight * 10) / 10;
const stripBold = (s: string) => stripChords(s.replace(/\*\*/g, ''));

async function addPresentation(pptx: PptxGenJS, lib: Library, p: Presentation) {
  p = prepareAnnouncementSizing(p);
  const baseTheme = lib.themes.find((t) => t.id === p.themeId) ?? lib.themes[0];
  for (const { slide } of sequence(p)) {
    if (slide.disabled) continue;
    const original: Theme = slide.style ? { ...baseTheme, ...slide.style } : baseTheme;
    const fixed = isFrontPresentation(p) || isFrontSlide(slide);
    const layout = fitSlideText(fixed ? { ...slide, preserveTextLayout: true } : slide, original);
    const theme = { ...original, fontSize: layout.fontSize };
    const s = pptx.addSlide();
    const bg = resolveBackground(slide, p);
    if (bg?.kind === 'image') {
      const data = await urlData(bg.url);
      s.background = data ? { data } : { color: 'FFFFFF' };
    } else if (bg?.kind === 'media' && bg.mediaType === 'image') {
      const data = await dataUrl(bg.mediaId);
      if (data) s.background = { data };
      else s.background = { color: '000000' };
    } else {
      s.background = { color: firstColor(bg) };
    }
    const color = theme.color.replace('#', '');
    const valign = theme.vAlign === 'middle' ? 'middle' : theme.vAlign;
    const runs: PptxGenJS.TextProps[] = [];
    if (slide.title) runs.push({ text: slide.title, options: { bold: true, fontSize: theme.fontSize * 0.72 * 0.5, lineSpacing: linePts(theme.fontSize * 0.72, theme.lineHeight), breakLine: true } });
    for (const line of slide.text.split('\n')) {
      runs.push({ text: stripBold(line), options: { bold: /^\*\*.*\*\*$/.test(line) || theme.fontWeight >= 700, lineSpacing: linePts(theme.fontSize, theme.lineHeight), breakLine: true } });
    }
    if (slide.subtext) {
      const sub = theme.fontSize * (theme.subScale ?? 0.62);
      for (const line of slide.subtext.split('\n')) {
        runs.push({ text: line, options: { fontSize: sub * 0.5, color: (theme.subColor ?? theme.color).replace('#', ''), lineSpacing: linePts(sub, theme.lineHeight), breakLine: true } });
      }
    }
    // A trailing paragraph would put an empty line below the lyrics and shift the
    // visible words above the middle of an otherwise centered PowerPoint box.
    if (p.lyricsCentered && slide.group !== 'Title' && runs.length) runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: false };
    s.addText(runs, {
      x: layout.box.x * PX, y: layout.box.y * PX, w: layout.box.w * PX, h: layout.box.h * PX,
      fontFace: fontFace(theme), fontSize: theme.fontSize * 0.5, color, italic: theme.italic, underline: theme.underline ? { style: 'sng' } : undefined,
      ...textOptions(theme),
      margin: NO_MARGIN, lang: langOf(`${slide.title ?? ''}${slide.text}${slide.subtext ?? ''}`),
      align: theme.align, valign,
      shadow: theme.shadow ? { type: 'outer', blur: 6, offset: 2, angle: 45, color: '000000', opacity: 0.6 } : undefined,
      fit: undefined,
    });
    for (const original of slide.elements ?? []) {
      const el = fixed ? original : fitTextElement(original, textElementBounds(original, slide.elements));
      const box = { x: el.x * PX, y: el.y * PX, w: el.w * PX, h: el.h * PX, rotate: el.rotation };
      if (el.kind === 'text' && el.text) {
        // Empty Front paragraphs also carry a source font size (and therefore spacer height).
        // The screen's line height for this box (as elementTextStyle draws it). A paragraph's last
        // line break shows no extra line on screen, so it adds none here either.
        const lh = el.lineHeight ?? (el.paragraphs ? 1.2 : 1.25);
        const content = el.paragraphs?.length ? el.paragraphs.map((p, i) => ({ text: fixed ? p.text.replace(/\n$/, '').split('\n').map((line) => line || '\u00a0').join('\n') : p.text, options: { fontSize: (p.fontSize ?? el.fontSize ?? 64) * 0.5, lineSpacing: linePts(p.fontSize ?? el.fontSize ?? 64, lh), bold: p.bold ?? el.bold, italic: p.italic ?? el.italic, color: (p.color ?? el.color ?? '#ffffff').replace('#', ''), align: p.align ?? el.align, breakLine: i < el.paragraphs!.length - 1 } })) : el.text;
        s.addText(content, { ...box, fontFace: pptxFont(el.fontFamily ?? baseTheme.fontFamily), lineSpacing: el.paragraphs?.length ? undefined : linePts(el.fontSize ?? 64, lh), margin: NO_MARGIN, lang: langOf(el.text), fontSize: (el.fontSize ?? 64) * 0.5, color: (el.color ?? '#ffffff').replace('#', ''), bold: el.bold, italic: el.italic, underline: el.underline ? { style: 'sng' } : undefined, ...textOptions(el), align: el.align ?? 'center', valign: el.vAlign === 'top' ? 'top' : el.vAlign === 'bottom' ? 'bottom' : 'middle', fit: undefined });
      } else if (el.kind === 'image' && el.mediaId) {
        const data = await dataUrl(el.mediaId);
        if (data) s.addImage({ ...box, data, sizing: { type: el.fit === 'cover' ? 'cover' : 'contain', w: box.w, h: box.h } });
      } else if (el.kind === 'qr' && el.link) {
        s.addImage({ ...box, data: qrDataUrl(el.link) });
      } else if (el.kind === 'shape') {
        const solid = /#([0-9a-f]{6})/i.exec(el.fill ?? '')?.[1] ?? 'FFFFFF';
        s.addShape(el.ellipse ? 'ellipse' : 'roundRect', { ...box, fill: { color: solid }, rectRadius: el.radius ? Math.min(0.5, (el.radius * PX) / Math.min(box.w, box.h)) : 0 });
      }
    }
    // QR codes go over the text boxes, in the corner (added last, so they are on top).
    slide.qr?.forEach((link, i) => {
      s.addImage({ data: qrDataUrl(link), x: W - 2.1, y: H - 2.1 - i * 2.1, w: 1.8, h: 1.8 });
    });
    if (slide.caption) s.addText(slide.caption, { x: 0.3, y: 0.15, w: 8, h: 0.5, fontSize: 14, color, fontFace: fontFace(theme) });
    if (slide.notes) s.addNotes(slide.notes);
  }
}

/** Export presentations (in playlist order when given) to a .pptx file download. */
export async function exportPptx(lib: Library, source: { playlist: Playlist } | { presentation: Presentation }, fileName: string) {
  const pptx = await buildPptx(lib, source);
  await pptx.writeFile({ fileName: fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx` });
}

/** The deck as PowerPoint will get it (in playlist order when given). */
export async function buildPptx(lib: Library, source: { playlist: Playlist } | { presentation: Presentation }): Promise<PptxGenJS> {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_4x3';
  const list = 'playlist' in source
    ? source.playlist.items.flatMap((i) => (i.kind === 'header' ? [] : lib.presentations.filter((p) => p.id === i.presentationId)))
    : [source.presentation];
  for (const p of list) await addPresentation(pptx, lib, p);
  return pptx;
}
