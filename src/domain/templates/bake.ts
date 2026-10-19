// Draws everything on a rendered PPTX slide except its text — background colour or picture,
// pictures (logos, photos), filled/outlined boxes — into one 1920×1080 PNG, with black bars
// beside a 4:3 slide. The text goes on top as editable elements (convert.ts).
import type { RenderedSlide } from '../io/pptxRender';
import { frameFor } from './convert';

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
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d')!;
  const f = frameFor(rs.widthEmu, rs.heightEmu);
  const sw = rs.widthEmu * f.k;
  const sh = rs.heightEmu * f.k;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 1920, 1080);
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
      if (img) ctx.drawImage(img, ...box(shape));
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
