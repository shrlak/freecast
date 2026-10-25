import PptxGenJS from 'pptxgenjs';
import type { Background, Library, ListStyle, Playlist, Presentation, Theme } from '../types';
import { sequence } from '../arrangement';
import { getMedia } from '../media';
import { qrDataUrl } from './qr';
import { stripChords } from '../lyrics';
import { pptxFont } from '../fonts';
import { CANVAS_W } from '../canvas';
import { fitTextElement } from '../textBoxLayout';
import { maximumSlideFont } from '../maximizeFont';
import { correctMixedTextSizes } from '../textBoxFonts';
import { resolveBackground } from '../autoBackground';

const W = 10;
const H = 7.5;
const PX = W / CANVAS_W; // inches per canvas pixel (4:3 slides, 10 × 7.5 in)

function firstColor(b: Background | undefined | null): string {
  if (!b) return '000000';
  if (b.kind === 'color') return b.value.replace('#', '').slice(0, 6);
  if (b.kind === 'gradient') return (/#([0-9a-f]{6})/i.exec(b.value)?.[1] ?? '000000');
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
const stripBold = (s: string) => stripChords(s.replace(/\*\*/g, ''));

async function addPresentation(pptx: PptxGenJS, lib: Library, p: Presentation) {
  p = correctMixedTextSizes(p);
  const baseTheme = lib.themes.find((t) => t.id === p.themeId) ?? lib.themes[0];
  for (const { slide } of sequence(p)) {
    if (slide.disabled) continue;
    const original: Theme = slide.style ? { ...baseTheme, ...slide.style } : baseTheme;
    const theme = slide.maximizeFont ? { ...original, fontSize: maximumSlideFont(slide, original) } : original;
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
    const pad = theme.padding * PX;
    const horizontalPad = slide.lyricBody && slide.qr?.length ? Math.max(pad, 2.1) : pad;
    const color = theme.color.replace('#', '');
    const valign = theme.vAlign === 'middle' ? 'middle' : theme.vAlign;
    const runs: PptxGenJS.TextProps[] = [];
    if (slide.title) runs.push({ text: slide.title, options: { bold: true, fontSize: theme.fontSize * 0.72 * 0.5, breakLine: true } });
    for (const line of slide.text.split('\n')) {
      runs.push({ text: stripBold(line), options: { bold: /^\*\*.*\*\*$/.test(line) || theme.fontWeight >= 700, breakLine: true } });
    }
    if (slide.subtext) {
      for (const line of slide.subtext.split('\n')) {
        runs.push({ text: line, options: { fontSize: theme.fontSize * (theme.subScale ?? 0.62) * 0.5, color: (theme.subColor ?? theme.color).replace('#', ''), breakLine: true } });
      }
    }
    // A trailing paragraph would put an empty line below the lyrics and shift the
    // visible words above the middle of an otherwise centered PowerPoint box.
    if (p.lyricsCentered && slide.group !== 'Title' && runs.length) runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: false };
    s.addText(runs, {
      x: horizontalPad, y: pad, w: W - horizontalPad * 2 - (slide.qr?.length && !slide.lyricBody ? 2 : 0), h: H - pad * 2,
      fontFace: fontFace(theme), fontSize: theme.fontSize * 0.5, color, italic: theme.italic, underline: theme.underline ? { style: 'sng' } : undefined,
      ...textOptions(theme),
      align: theme.align, valign, lineSpacingMultiple: theme.lineHeight,
      shadow: theme.shadow ? { type: 'outer', blur: 6, offset: 2, angle: 45, color: '000000', opacity: 0.6 } : undefined,
      fit: theme.autoFit === false ? undefined : 'resize',
    });
    slide.qr?.forEach((link, i) => {
      s.addImage({ data: qrDataUrl(link), x: W - 2.1, y: H - 2.1 - i * 2.1, w: 1.8, h: 1.8 });
    });
    for (const original of slide.elements ?? []) {
      const el = fitTextElement(original);
      const box = { x: el.x * PX, y: el.y * PX, w: el.w * PX, h: el.h * PX, rotate: el.rotation };
      if (el.kind === 'text' && el.text) {
        const content = el.paragraphs?.length ? el.paragraphs.map((p, i) => ({ text: p.text, options: { fontSize: (p.fontSize ?? el.fontSize ?? 64) * 0.5, bold: p.bold ?? el.bold, italic: p.italic ?? el.italic, color: (p.color ?? el.color ?? '#ffffff').replace('#', ''), align: p.align ?? el.align, breakLine: i < el.paragraphs!.length - 1 } })) : el.text;
        s.addText(content, { ...box, fontFace: pptxFont(el.fontFamily ?? baseTheme.fontFamily), lineSpacingMultiple: el.lineHeight, fontSize: (el.fontSize ?? 64) * 0.5, color: (el.color ?? '#ffffff').replace('#', ''), bold: el.bold, italic: el.italic, underline: el.underline ? { style: 'sng' } : undefined, ...textOptions(el), align: el.align ?? 'center', valign: el.vAlign === 'top' ? 'top' : el.vAlign === 'bottom' ? 'bottom' : 'middle', fit: el.autoFit === false ? undefined : 'resize' });
      } else if (el.kind === 'image' && el.mediaId) {
        const data = await dataUrl(el.mediaId);
        if (data) s.addImage({ ...box, data, sizing: { type: el.fit === 'cover' ? 'cover' : 'contain', w: box.w, h: box.h } });
      } else if (el.kind === 'shape') {
        const solid = /#([0-9a-f]{6})/i.exec(el.fill ?? '')?.[1] ?? 'FFFFFF';
        s.addShape(el.ellipse ? 'ellipse' : 'roundRect', { ...box, fill: { color: solid }, rectRadius: el.radius ? Math.min(0.5, (el.radius * PX) / Math.min(box.w, box.h)) : 0 });
      }
    }
    if (slide.caption) s.addText(slide.caption, { x: 0.3, y: 0.15, w: 8, h: 0.5, fontSize: 14, color, fontFace: fontFace(theme) });
    if (slide.notes) s.addNotes(slide.notes);
  }
}

/** Export presentations (in playlist order when given) to a .pptx file download. */
export async function exportPptx(lib: Library, source: { playlist: Playlist } | { presentation: Presentation }, fileName: string) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_4x3';
  const list = 'playlist' in source
    ? source.playlist.items.flatMap((i) => (i.kind === 'header' ? [] : lib.presentations.filter((p) => p.id === i.presentationId)))
    : [source.presentation];
  for (const p of list) await addPresentation(pptx, lib, p);
  await pptx.writeFile({ fileName: fileName.endsWith('.pptx') ? fileName : `${fileName}.pptx` });
}
