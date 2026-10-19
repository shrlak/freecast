import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface PdfPage {
  page: number;
  blob: Blob;
  text: string;
}

/** Render each page of a PDF to a JPEG (for slides or AI reading) and pull out any embedded text. */
export async function renderPdf(file: Blob, opts: { scale?: number; maxPages?: number; quality?: number } = {}): Promise<PdfPage[]> {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: PdfPage[] = [];
  const count = Math.min(doc.numPages, opts.maxPages ?? 200);
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const viewport = page.getViewport({ scale: opts.scale ?? 1.6 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('render failed'))), 'image/jpeg', opts.quality ?? 0.85));
    const content = await page.getTextContent();
    const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: n, blob, text });
  }
  await task.destroy();
  return pages;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
