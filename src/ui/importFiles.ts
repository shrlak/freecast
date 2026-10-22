import type { MediaMeta, Slide } from '../domain/types';
import { putMedia } from '../domain/media';
import { uid } from '../domain/lyrics';
import { importPptx } from '../domain/io/pptxImport';
import { renderPdf } from '../domain/io/pdf';
import { desktop } from '../domain/desktop';
import { pptxSlides } from '../domain/templates/serviceTemplates';

async function storeImage(blob: Blob, name: string, addMedia: (m: MediaMeta) => void): Promise<string> {
  const id = uid('m');
  await putMedia(id, blob);
  addMedia({ id, name, type: 'image' });
  return id;
}

const imageSlide = (mediaId: string, group: string): Slide => ({
  id: uid('s'), group, text: '', background: { kind: 'media', mediaId, mediaType: 'image', fit: 'contain' },
});

/**
 * Turn PPTX, PDF and image files into slides, in the order given:
 * PDF → one slide per page, image → one slide, PPTX → its slides as they look (every picture, box and text its own object, plus notes).
 */
export async function filesToSlides(files: File[], addMedia: (m: MediaMeta) => void, onProgress?: (msg: string) => void, onApprox?: (fileName: string) => void): Promise<Slide[]> {
  const slides: Slide[] = [];
  for (const file of files) {
    const base = file.name.replace(/\.[^.]+$/, '');
    if (/\.pptx$/i.test(file.name)) {
      const addPptMedia = (m: MediaMeta) => addMedia({ ...m, backgroundHidden: true });
      onProgress?.(`Reading ${file.name}…`);
      const data = await file.arrayBuffer();
      const imported = await importPptx(new Blob([data])).catch(() => []);
      // Best: let PowerPoint (or LibreOffice) draw the slides, so each one is exactly the original.
      const pdf = await desktop?.pptxToPdf(new Uint8Array(data)).catch(() => null);
      if (pdf) {
        const pages = await renderPdf(new Blob([pdf as BlobPart]), { scale: 2.5, quality: 0.95 }).catch(() => []);
        if (pages.length) {
          for (const [i, page] of pages.entries()) {
            const notes = imported.length === pages.length ? imported[i].notes : undefined;
            slides.push({ ...imageSlide(await storeImage(page.blob, `${base} ${i + 1}`, addPptMedia), base), notes });
          }
          continue;
        }
      }
      // No PowerPoint or LibreOffice to draw it: the slides are rebuilt from the file, so text can differ a little.
      onApprox?.(file.name);
      let n = 0;
      // Every picture, box and text of the slide becomes its own object at the same place, size and
      // order, so it looks and plays like the PowerPoint slide and can still be edited.
      const faithful = await pptxSlides(data, {
        group: () => base,
        mediaId: () => uid('m'),
        store: async (id, blob) => {
          await putMedia(id, blob);
          addPptMedia({ id, name: `${base} ${++n}`, type: 'image' });
        },
      }).catch(() => []);
      if (faithful.length) {
        // Speaker notes come from the plain reader when it sees the same slides (a title would draw the text twice).
        faithful.forEach((s, i) => slides.push({ ...s, notes: imported.length === faithful.length ? imported[i].notes : undefined }));
        continue;
      }
      for (const [i, s] of imported.entries()) {
        const mediaId = s.image ? await storeImage(s.image, `${base} ${i + 1}`, addPptMedia) : undefined;
        slides.push({
          id: uid('s'), group: base, title: s.title, text: s.text, notes: s.notes,
          background: mediaId ? { kind: 'media', mediaId, mediaType: 'image', fit: 'contain' } : undefined,
        });
      }
    } else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      onProgress?.(`Rendering ${file.name}…`);
      for (const page of await renderPdf(file, { scale: 2.5, quality: 0.95 })) {
        slides.push(imageSlide(await storeImage(page.blob, `${base} p${page.page}`, addMedia), base));
      }
    } else if (file.type.startsWith('image/')) {
      slides.push(imageSlide(await storeImage(file, file.name, addMedia), base));
    }
  }
  return slides;
}
