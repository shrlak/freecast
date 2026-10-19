// Draws everything on a rendered PPTX slide except its text — background colour or picture,
// pictures (logos, photos), filled/outlined boxes — into one 1440×1080 (4:3) PNG, with black
// bars around a deck of another shape. The text goes on top as editable elements (convert.ts).
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
  const box = (s: { xEmu: number; yEmu: number; wEmu: number; hEmu: number }) =>
    [f.x + s.xEmu * f.k, f.y + s.yEmu * f.k, s.wEmu * f.k, s.hEmu * f.k] as const;
  for (const shape of rs.shapes) {
    if (shape.kind === 'picture') {
      const img = await loadImage(shape.imageUrl);
      if (!img) continue;
      const c = shape.crop;
      if (c) {
        // Only the part PowerPoint shows (its crop), stretched over the picture's frame.
        const w = img.naturalWidth, h = img.naturalHeight;
        ctx.drawImage(img, c.l * w, c.t * h, w * (1 - c.l - c.r), h * (1 - c.t - c.b), ...box(shape));
      } else ctx.drawImage(img, ...box(shape));
    } else {
      if (shape.fill) {
        ctx.fillStyle = shape.fill;
        ctx.fillRect(...box(shape));
      }
      if (shape.outline) {
        ctx.strokeStyle = shape.outline.color;
        ctx.lineWidth = Math.max(1, shape.outline.widthEmu * f.k);
        ctx.strokeRect(...box(shape));
      }
    }
  }
  ctx.restore();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the slide'))), 'image/png'));
}
