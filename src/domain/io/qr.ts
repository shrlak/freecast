import qrcode from 'qrcode-generator';

const cache = new Map<string, string>();

/** SVG data URL for a QR code of `text`, black on white with a quiet zone. */
export function qrDataUrl(text: string): string {
  let url = cache.get(text);
  if (!url) {
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    url = qr.createDataURL(8, 4);
    cache.set(text, url);
  }
  return url;
}
