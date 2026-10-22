/** Decode stored media in this computer's browser, without playing sound or showing output. */
export function inspectMediaBlob(blob: Blob, type: string): Promise<boolean> {
  if (!blob.size) return Promise.resolve(false);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const element = type === 'image' ? new Image() : document.createElement(type === 'audio' ? 'audio' : 'video');
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      element.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 5000);
    if (element instanceof HTMLImageElement) {
      element.onload = () => finish(element.naturalWidth > 0 && element.naturalHeight > 0);
      element.onerror = () => finish(false);
    } else {
      element.preload = 'metadata'; element.muted = true;
      element.onloadedmetadata = () => finish(type === 'audio' || (element as HTMLVideoElement).videoWidth > 0);
      element.onerror = () => finish(false);
    }
    element.src = url;
  });
}
