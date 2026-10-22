export interface ServerMediaFile { id: string; name: string; type: string; size: number }

/** Use server inventory, including files no longer referenced by the library. */
export function rankServerMedia(items: { id: string; size: number; type?: string }[], library: unknown): ServerMediaFile[] {
  const metadata = new Map<string, { name: string; type: string }>();
  const media = library && typeof library === 'object' ? (library as { media?: unknown }).media : null;
  if (Array.isArray(media)) for (const m of media) {
    if (m && typeof m.id === 'string') metadata.set(m.id, { name: typeof m.name === 'string' ? m.name.trim() : '', type: typeof m.type === 'string' ? m.type : '' });
  }
  const files = new Map<string, ServerMediaFile>();
  for (const item of items) {
    if (typeof item.id !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0) throw new Error('서버 파일 용량이 올바르지 않습니다.');
    const meta = metadata.get(item.id);
    files.set(item.id, { id: item.id, name: meta?.name || item.id, type: item.type || meta?.type || '', size: item.size });
  }
  return [...files.values()].sort((a, b) => b.size - a.size || a.id.localeCompare(b.id));
}
