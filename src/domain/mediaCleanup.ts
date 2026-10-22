import type { Library } from './types';

function strings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') out.add(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** Only assets owned by removed decks; remaining songs, templates, props and macros protect assets. */
export function exclusivePresentationMedia(lib: Library, presentationIds: string[]): string[] {
  const gone = new Set(presentationIds);
  const candidates = strings(lib.presentations.filter((p) => gone.has(p.id)));
  const remaining = strings({ ...lib, media: [], presentations: lib.presentations.filter((p) => !gone.has(p.id)) });
  return lib.media.filter((m) => candidates.has(m.id) && !remaining.has(m.id)).map((m) => m.id);
}
