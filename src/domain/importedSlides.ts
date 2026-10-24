import type { Slide } from './types';

export const PDF_READ_ONLY = 'PDF는 읽기 전용입니다. 내용을 수정하려면 원본 PPTX 또는 PPT를 가져와 주세요.';
export const isPdfSlide = (slide: Slide | null | undefined): boolean => slide?.importSource?.format === 'pdf';

/** PDF pixels stay intact. Operators can still set notes, playback order and cues. */
export function editableSlidePatch(slide: Slide, patch: Partial<Omit<Slide, 'id'>>): Partial<Omit<Slide, 'id'>> {
  if (!isPdfSlide(slide)) return patch;
  const allowed: (keyof Slide)[] = ['notes', 'group', 'label', 'disabled', 'actions', 'autoAdvance', 'hotkey', 'transition'];
  return Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key as keyof Slide)));
}

/** Bulk formatting must also leave PDF pages in a mixed deck untouched. New file imports use new IDs. */
export function preservePdfPages(before: Slide[], after: Slide[]): Slide[] {
  const locked = new Map(before.filter(isPdfSlide).map((s) => [s.id, s]));
  return after.map((s) => {
    const original = locked.get(s.id);
    return original ? { ...original, ...editableSlidePatch(original, s) } : s;
  });
}
