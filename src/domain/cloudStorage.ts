export interface CloudStorageUsage {
  libraryBytes: number;
  mediaBytes: number;
  totalBytes: number;
  mediaCount: number;
  checkedAt: number;
}
/** Logical data stored by the library API, excluding database overhead and other Workers. */
export function summarizeCloudStorage(library: unknown, media: { id: string; size: number }[], checkedAt = Date.now()): CloudStorageUsage {
  const files = new Map<string, number>();
  for (const m of media) {
    if (typeof m.id !== 'string' || !Number.isSafeInteger(m.size) || m.size < 0) throw new Error('서버가 올바르지 않은 파일 용량을 반환했습니다.');
    files.set(m.id, m.size);
  }
  const libraryBytes = library == null ? 0 : new TextEncoder().encode(JSON.stringify(library)).byteLength;
  const mediaBytes = [...files.values()].reduce((sum, size) => sum + size, 0);
  return { libraryBytes, mediaBytes, totalBytes: libraryBytes + mediaBytes, mediaCount: files.size, checkedAt };
}
export function formatStorageBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const unit = Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** unit).toLocaleString(undefined, { maximumFractionDigits: unit ? 2 : 0 })} ${['B', 'KiB', 'MiB', 'GiB', 'TiB'][unit]}`;
}
