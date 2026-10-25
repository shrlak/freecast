import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SlideElement } from '../domain/types';
import { clearTextBoxLayoutCache, fitTextElement } from '../domain/textBoxLayout';
import { textElementBounds } from '../domain/textBox';

let fontEpoch = 0;
const listeners = new Set<() => void>();
const changedFonts = () => { clearTextBoxLayoutCache(); fontEpoch++; listeners.forEach((listener) => listener()); };
function subscribeFonts(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && typeof document !== 'undefined' && document.fonts) {
    document.fonts.addEventListener('loadingdone', changedFonts);
    void document.fonts.ready.then(() => { if (listeners.size) changedFonts(); });
  }
  return () => { listeners.delete(listener); if (!listeners.size && typeof document !== 'undefined') document.fonts?.removeEventListener('loadingdone', changedFonts); };
}
export const useFontEpoch = () => useSyncExternalStore(subscribeFonts, () => fontEpoch, () => 0);

/** Editors persist resized geometry; previews and output only draw it. Nothing writes protected content. */
export function useAutoTextBoxes(elements: SlideElement[], onResize?: (elements: SlideElement[]) => void, hasQr = false): SlideElement[] {
  const epoch = useFontEpoch(), key = JSON.stringify(elements);
  const latest = useRef({ elements, onResize }); latest.current = { elements, onResize };
  const [layout, setLayout] = useState<{ key: string; elements: SlideElement[] } | null>(null);
  useLayoutEffect(() => {
    const { elements, onResize } = latest.current;
    const fitted = elements.map((el) => fitTextElement(el, textElementBounds(el, elements, hasQr)));
    if (fitted.some((el, i) => el !== elements[i])) {
      setLayout({ key, elements: fitted });
      if (document.fonts?.status !== 'loading') onResize?.(fitted);
    }
    else setLayout(null);
  }, [key, epoch, hasQr]);
  return layout?.key === key ? layout.elements : elements;
}
