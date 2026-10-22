export interface CloudStorageUsage {
  server?: ServerStorageUsage;
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

export interface ServerStorageUsage {
  usedBytes: number; limitBytes: number; usedPercent: number;
  freecastBytes: number; sharedBytes: number; accountUsageComplete: boolean;
}
export function parseServerStorage(raw: unknown): CloudStorageUsage {
  if (!raw || typeof raw !== 'object') throw new Error('서버 용량 응답이 올바르지 않습니다.');
  const r = raw as Record<string, unknown>;
  for (const key of ['usedBytes', 'limitBytes', 'freecastBytes', 'sharedBytes', 'libraryBytes', 'mediaBytes', 'mediaCount', 'checkedAt']) {
    if (!Number.isSafeInteger(r[key]) || Number(r[key]) < 0) throw new Error('서버 용량 측정값이 올바르지 않습니다.');
  }
  if (!Number(r.limitBytes)) throw new Error('서버 용량 한도가 올바르지 않습니다.');
  return {
    libraryBytes: Number(r.libraryBytes), mediaBytes: Number(r.mediaBytes), totalBytes: Number(r.libraryBytes) + Number(r.mediaBytes), mediaCount: Number(r.mediaCount), checkedAt: Number(r.checkedAt),
    server: { usedBytes: Number(r.usedBytes), limitBytes: Number(r.limitBytes), usedPercent: Number(r.usedBytes) / Number(r.limitBytes) * 100, freecastBytes: Number(r.freecastBytes), sharedBytes: Number(r.sharedBytes), accountUsageComplete: r.accountUsageComplete === true },
  };
}
export const formatStoragePercent = (percent: number): string => percent.toLocaleString(undefined, { maximumSignificantDigits: 3 });
export function formatQuotaBytes(bytes: number): string { return `${(bytes / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB`; }
