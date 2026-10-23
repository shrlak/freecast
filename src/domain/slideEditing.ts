import type { Presentation, Slide } from './types';
import { expandCode } from './arrangement';
import { numberRepeatedLabels } from './sunday/slidePlanner';

const groupKey = (group: string) => expandCode(group.replace(/\s+/g, '')).replace(/\s+/g, '').toLowerCase();

/** Rebuild edited lyric sections with explicit slide breaks, keeping unused source parts. */
export function songSourceFromSlides(p: Presentation, slides = p.slides): NonNullable<Presentation['songSource']> {
  const groups = new Map<string, { label: string; lines: string[] }>();
  for (const slide of slides) {
    if (slide.group === 'Title') continue;
    const key = groupKey(slide.group);
    const section = groups.get(key);
    if (section) section.lines.push('', ...slide.text.split('\n'));
    else groups.set(key, { label: slide.group, lines: slide.text.split('\n') });
  }
  const numbered = numberRepeatedLabels(p.songSource?.sections ?? []);
  const sections = (p.songSource?.sections ?? []).map((section, index) => {
    const key = groupKey(numbered[index].label);
    const edited = groups.get(key); groups.delete(key);
    return edited ? { ...section, lines: edited.lines } : section;
  });
  sections.push(...groups.values());
  const active = p.arrangements?.find((a) => a.id === p.arrangementId);
  const order = p.songSource?.order ?? p.meta?.order ?? active?.groups.filter((g) => g !== 'Title').map((g) => g.replace(/Pre-Chorus/i, 'PC').replace(/Chorus/i, 'C').replace(/Verse/i, 'V').replace(/Bridge/i, 'B').replace(/Intro/i, 'I').replace(/Interlude/i, 'INT').replace(/Ending/i, 'E').replace(/Tag/i, 'T').replace(/\s+/g, ''));
  return { sections, order };
}

/** Change one slide without rebuilding its neighbors, IDs, media or arrangements. */
export function editSlide(p: Presentation, slideId: string, patch: Partial<Omit<Slide, 'id'>>, at: number): Presentation {
  if (!p.slides.some((s) => s.id === slideId)) return p;
  const slides = p.slides.map((s) => s.id === slideId ? { ...s, ...patch } : s);
  const lyricsChanged = ('text' in patch || 'group' in patch) && (p.songSource || p.lyricsLayout);
  const visual = ['text', 'title', 'subtext', 'elements', 'style', 'background', 'group', 'caption'].some((key) => key in patch);
  return {
    ...p, slides, online: undefined, folder: p.online ? 'Songs' : p.folder, updatedAt: at,
    ...(visual ? { slidesEdited: true } : {}),
    ...(lyricsChanged ? { songSource: songSourceFromSlides(p, slides) } : {}),
  };
}
