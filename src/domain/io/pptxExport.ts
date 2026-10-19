import PptxGenJS from 'pptxgenjs';
import type { Background, Library, Playlist, Presentation, Theme } from '../types';
import { sequence } from '../arrangement';
import { getMedia } from '../media';
import { qrDataUrl } from './qr';
import { stripChords } from '../lyrics';
import { pptxFont } from '../fonts';
import { CANVAS_W } from '../canvas';

const W = 10;
const H = 7.5;
const PX = W / CANVAS_W; // inches per canvas pixel (4:3 slides, 10 × 7.5 in)

function firstColor(b: Background | undefined | null): string {
  if (!b) return '000000';
  if (b.kind === 'color') return b.value.replace('#', '').slice(0, 6);
  if (b.kind === 'gradient') return (/#([0-9a-f]{6})/i.exec(b.value)?.[1] ?? '000000');
  return '000000';
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
  const baseTheme = lib.themes.find((t) => t.id === p.themeId) ?? lib.themes[0];
  for (const { slide } of sequence(p)) {
    if (slide.disabled) continue;
    const theme: Theme = slide.style ? { ...baseTheme, ...slide.style } : baseTheme;
    const s = pptx.addSlide();
    const bg = slide.background ?? p.background;
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
    s.addText(runs, {
      x: pad, y: pad, w: W - pad * 2 - (slide.qr?.length ? 2 : 0), h: H - pad * 2,
      fontFace: fontFace(theme), fontSize: theme.fontSize * 0.5, color, italic: theme.italic, underline: theme.underline ? { style: 'sng' } : undefined,
      align: theme.align, valign, lineSpacingMultiple: theme.lineHeight,
      shadow: theme.shadow ? { type: 'outer', blur: 6, offset: 2, angle: 45, color: '000000', opacity: 0.6 } : undefined,
      fit: 'shrink',
    });
    slide.qr?.forEach((link, i) => {
      s.addImage({ data: qrDataUrl(link), x: W - 2.1, y: H - 2.1 - i * 2.1, w: 1.8, h: 1.8 });
    });
    for (const el of slide.elements ?? []) {
      const box = { x: el.x * PX, y: el.y * PX, w: el.w * PX, h: el.h * PX, rotate: el.rotation };
      if (el.kind === 'text' && el.text) {
        s.addText(el.text, { ...box, fontSize: (el.fontSize ?? 64) * 0.5, color: (el.color ?? '#ffffff').replace('#', ''), bold: el.bold, italic: el.italic, align: el.align ?? 'center', valign: el.vAlign === 'top' ? 'top' : el.vAlign === 'bottom' ? 'bottom' : 'middle', fit: 'shrink' });
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
