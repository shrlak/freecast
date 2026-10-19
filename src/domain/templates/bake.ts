// Draws a rendered PPTX slide's background — its colour and background picture — into one
// 1440×1080 (4:3) PNG, with black bars around a deck of another shape. Everything on top (pictures,
// boxes, text) becomes separate editable objects (convert.ts).
import type { RenderedSlide } from '../io/pptxRender';
import { frameFor } from './convert';
import { CANVAS_H, CANVAS_W } from '../canvas';

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function bakeBackground(rs: RenderedSlide): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d')!;
  const f = frameFor(rs.widthEmu, rs.heightEmu);
  const sw = rs.widthEmu * f.k;
  const sh = rs.heightEmu * f.k;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.x, f.y, sw, sh);
  ctx.clip();
  ctx.fillStyle = rs.background ?? '#ffffff';
  ctx.fillRect(f.x, f.y, sw, sh);
  if (rs.backgroundImage) {
    const img = await loadImage(rs.backgroundImage);
    if (img) ctx.drawImage(img, f.x, f.y, sw, sh);
  }
  ctx.restore();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the slide'))), 'image/png'));
}

/** A picture with PowerPoint's crop applied (only the part the slide shows), as a PNG. */
export async function croppedPicture(url: string, crop: { l: number; t: number; r: number; b: number }): Promise<Blob | null> {
  const img = await loadImage(url);
  if (!img) return null;
  const w = img.naturalWidth, h = img.naturalHeight;
  const sw = Math.max(1, Math.round(w * (1 - crop.l - crop.r)));
  const sh = Math.max(1, Math.round(h * (1 - crop.t - crop.b)));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')!.drawImage(img, crop.l * w, crop.t * h, sw, sh, 0, 0, sw, sh);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
