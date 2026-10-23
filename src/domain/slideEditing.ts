import type { Presentation, Slide } from './types';
import { activeArrangement, expandCode, sequence } from './arrangement';
import { uid } from './lyrics';
import { numberRepeatedLabels } from './sunday/slidePlanner';

const groupKey = (group: string) => expandCode(group.replace(/\s+/g, '')).replace(/\s+/g, '').toLowerCase();
const groupCode = (g: string) => g.replace(/Pre-Chorus/i, 'PC').replace(/Chorus/i, 'C').replace(/Verse/i, 'V').replace(/Bridge/i, 'B').replace(/Intro/i, 'I').replace(/Interlude/i, 'INT').replace(/Ending/i, 'E').replace(/Tag/i, 'T').replace(/\s+/g, '');

/** A repeated part gets its own pages only when this particular occurrence is changed. */
function independentPartAt(p: Presentation, seq: number): Presentation {
  const arr = activeArrangement(p);
  if (!arr || !Number.isInteger(seq) || seq < 0) return p;
  let offset = 0;
  const part = arr.groups.findIndex((g) => {
    const size = p.slides.filter((s) => s.group === g).length;
    const here = seq >= offset && seq < offset + size;
    offset += size;
    return here;
  });
  if (part < 0) return p;
  const group = arr.groups[part];
  if ((p.arrangements ?? []).flatMap((a) => a.groups).filter((g) => g === group).length <= 1) return p;
  const taken = new Set([...p.slides.map((s) => groupKey(s.group)), ...numberRepeatedLabels(p.songSource?.sections ?? []).map((s) => groupKey(s.label))]);
  const base = group.replace(/\s*\d+$/, '').trim();
  let n = 2;
  while (taken.has(groupKey(`${base} ${n}`))) n++;
  const name = `${base} ${n}`;
  const copies = p.slides.filter((s) => s.group === group).map((s) => ({ ...s, id: uid('s'), sourceSlideId: s.sourceSlideId ?? s.id, group: name, label: s.label ?? group }));
  const groups = arr.groups.map((g, i) => i === part ? name : g);
  const order = groups.filter((g) => g !== 'Title').map(groupCode);
  const next: Presentation = { ...p, slidesEdited: true, slides: [...p.slides, ...copies], arrangements: p.arrangements?.map((a) => a.id === arr.id ? { ...a, groups } : a), meta: { ...p.meta, order } };
  if (p.songSource || p.lyricsLayout) next.songSource = { ...songSourceFromSlides(next), order };
  return next;
}

export function editSlideAt(p: Presentation, seq: number, patch: Partial<Omit<Slide, 'id'>>, at: number): Presentation {
  if (!sequence(p)[seq]) return p;
  const next = independentPartAt(p, seq);
  return editSlide(next, sequence(next)[seq].slide.id, patch, at);
}

/** Positions, not shared master IDs, identify the pages the user selected. */
export function deleteSlidesAt(p: Presentation, seqs: number[], at: number): Presentation {
  const valid = [...new Set(seqs)].filter((i) => Number.isInteger(i) && !!sequence(p)[i]);
  if (!valid.length) return p;
  let next = p;
  for (const seq of valid) next = independentPartAt(next, seq);
  return deleteSlides(next, valid.map((i) => sequence(next)[i].slide.id), at);
}

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

/** Remove only the selected pages; keep the other pages of their lyric parts intact. */
export function deleteSlides(p: Presentation, slideIds: string[], at: number): Presentation {
  const ids = new Set(slideIds);
  const slides = p.slides.filter((s) => !ids.has(s.id));
  if (slides.length === p.slides.length) return p;
  const remaining = new Set(slides.map((s) => groupKey(s.group)));
  const removed = new Set(p.slides.filter((s) => !remaining.has(groupKey(s.group))).map((s) => groupKey(s.group)));
  const source = songSourceFromSlides(p, slides);
  // Number before filtering so deleting V1 does not silently rename V2 to V1.
  const sections = numberRepeatedLabels(source.sections).filter((s) => !removed.has(groupKey(s.label)));
  const order = source.order?.filter((g) => !removed.has(groupKey(g)));
  return {
    ...p, slides, online: undefined, folder: p.online ? 'Songs' : p.folder, updatedAt: at, slidesEdited: true,
    arrangements: p.arrangements?.map((a) => ({ ...a, groups: a.groups.filter((g) => !removed.has(groupKey(g))) })),
    ...(p.meta?.order ? { meta: { ...p.meta, order: p.meta.order.filter((g) => !removed.has(groupKey(g))) } } : {}),
    ...(p.songSource || p.lyricsLayout ? { songSource: { sections, order } } : {}),
  };
}
