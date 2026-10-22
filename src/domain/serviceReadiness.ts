import type { Library, Presentation, Slide } from './types';

export interface ReadinessItem { label: string; detail: string; ok: boolean }
export function serviceDecks(lib: Library, playlistId: string | null): Presentation[] {
  const pl = lib.playlists.find((p) => p.id === playlistId);
  const ids = new Set(pl?.items.filter((i) => i.kind !== 'header').map((i) => i.presentationId));
  return lib.presentations.filter((p) => ids.has(p.id));
}
export function emptySlide(s: Slide): boolean {
  return ![s.title, s.text, s.subtext].some((t) => t?.trim()) && (!s.background || s.background.kind === 'color' || s.background.kind === 'gradient') && !s.elements?.length;
}
/** Preserve presentation identity/settings and every playlist reference when replacing a file. */
export function replaceDeckSlides(p: Presentation, slides: Slide[]): Presentation {
  if (!slides.length) throw new Error('슬라이드를 읽지 못했습니다. 기존 PPT는 유지됩니다.');
  return { ...p, slides };
}
export function referencedAssets(decks: Presentation[]): { media: string[]; images: string[] } {
  const media = new Set<string>(), images = new Set<string>();
  const scan = (v: unknown): void => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(scan); return; }
    const obj = v as Record<string, unknown>;
    if (typeof obj.mediaId === 'string') media.add(obj.mediaId);
    if (obj.kind === 'image' && typeof obj.url === 'string') images.add(obj.url);
    Object.values(obj).forEach(scan);
  };
  scan(decks);
  return { media: [...media], images: [...images] };
}
