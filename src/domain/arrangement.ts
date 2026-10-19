import type { Arrangement, Presentation, Slide } from './types';

export interface SeqItem {
  slide: Slide;
  /** Index in presentation.slides. */
  index: number;
}

/** Distinct group names in first-appearance order. */
export function groupsOf(p: Presentation): string[] {
  const seen: string[] = [];
  for (const s of p.slides) if (!seen.includes(s.group)) seen.push(s.group);
  return seen;
}

export function activeArrangement(p: Presentation): Arrangement | null {
  return p.arrangements?.find((a) => a.id === p.arrangementId) ?? null;
}

/**
 * The order slides play in: the active arrangement's group sequence (a group can repeat),
 * or the slides as written when no arrangement is selected.
 */
export function sequence(p: Presentation): SeqItem[] {
  const arr = activeArrangement(p);
  if (!arr) return p.slides.map((slide, index) => ({ slide, index }));
  const out: SeqItem[] = [];
  for (const g of arr.groups) {
    p.slides.forEach((slide, index) => {
      if (slide.group === g) out.push({ slide, index });
    });
  }
  return out;
}

/** Shorthand codes used on chord charts and 콘티: I, V1, PC, C, B, T, E… */
const CODES: [RegExp, string][] = [
  [/^(?:I|INTRO|전주)$/i, 'Intro'],
  [/^(?:PC|PRE-?CHORUS|프리코러스)(\d*)$/i, 'Pre-Chorus'],
  [/^(?:C|CH|CHORUS|후렴)(\d*)$/i, 'Chorus'],
  [/^(?:V|VERSE|절)(\d*)$/i, 'Verse'],
  [/^(?:B|BR|BRIDGE|브릿지)(\d*)$/i, 'Bridge'],
  [/^(?:T|TAG)(\d*)$/i, 'Tag'],
  [/^(?:E|O|OUTRO|ENDING|후주)$/i, 'Ending'],
  [/^(?:INT|INTERLUDE|간주)$/i, 'Interlude'],
];

/** "V1" → "Verse 1", "C" → "Chorus", unknown codes pass through. */
export function expandCode(code: string): string {
  const c = code.trim();
  for (const [re, name] of CODES) {
    const m = re.exec(c);
    if (m) return m[1] ? `${name} ${m[1]}` : name;
  }
  return c;
}

/** Parse "I-V1-C-V2-C-B-C" or "전주 → V → 후렴" into group names. */
export function parseProgression(text: string): string[] {
  return text
    .split(/\s*(?:-|–|—|~|→|->|>|,|\s)\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map(expandCode);
}
