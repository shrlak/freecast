import type { Slide } from './types';

/**
 * What a stage display prints for a slide: its heading and text; for a PowerPoint slide (whose words sit
 * in text boxes), the text of those boxes, top to bottom.
 */
export function slideStageText(slide: Slide | null | undefined): string {
  if (!slide) return '';
  const own = [slide.title, slide.text].filter((t): t is string => !!t?.trim());
  const boxes = (slide.elements ?? [])
    .filter((e) => e.kind === 'text' && e.text?.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((e) => e.text!.trim());
  return [...own, ...(slide.text.trim() ? [] : boxes)].join('\n').replace(/\*\*/g, '');
}
