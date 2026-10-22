import { describe, expect, it } from 'vitest';
import { formatStorageBytes, summarizeCloudStorage } from '../src/domain/cloudStorage';

describe('server library storage accounting', () => {
  it('counts UTF-8 library bytes and the server media inventory, including files absent locally', () => {
    const remote = { title: '교회 예배', slides: ['기도'] };
    const bytes = new TextEncoder().encode(JSON.stringify(remote)).byteLength;
    const usage = summarizeCloudStorage(remote, [{ id: 'server-only', size: 1024 }, { id: 'video', size: 2048 }], 123);
    expect(usage).toEqual({ libraryBytes: bytes, mediaBytes: 3072, totalBytes: bytes + 3072, mediaCount: 2, checkedAt: 123 });
    expect(bytes).toBeGreaterThan(JSON.stringify(remote).length);
  });
  it('shows zero for an empty server and counts each remote file once', () => {
    expect(summarizeCloudStorage(null, [], 0).totalBytes).toBe(0);
    expect(summarizeCloudStorage(null, [{ id: 'a', size: 10 }, { id: 'a', size: 10 }], 0).mediaBytes).toBe(10);
  });
  it('rejects invalid server sizes instead of displaying a fabricated amount', () => {
    for (const size of [-1, NaN, Infinity, 1.5]) expect(() => summarizeCloudStorage({}, [{ id: 'bad', size }])).toThrow();
  });
  it('formats units without presenting a capacity limit it cannot know', () => {
    expect(formatStorageBytes(0)).toBe('0 B');
    expect(formatStorageBytes(1024)).toBe('1 KiB');
    expect(formatStorageBytes(1024 ** 2)).toBe('1 MiB');
    expect(summarizeCloudStorage({}, [])).not.toHaveProperty('limitBytes');
  });
});

describe('measured server quota', () => {
  it('calculates percentages against the actual decimal quota rather than the media composition', async () => {
    const { parseServerStorage, formatQuotaBytes } = await import('../src/domain/cloudStorage');
    const usage = parseServerStorage({ usedBytes: 1_250_000_000, limitBytes: 5_000_000_000, freecastBytes: 1_000_000_000, sharedBytes: 250_000_000, mediaBytes: 100, libraryBytes: 20, mediaCount: 1, checkedAt: 123, accountUsageComplete: false });
    expect(usage.server?.usedPercent).toBe(25);
    expect(usage.totalBytes).toBe(120);
    expect(formatQuotaBytes(usage.server!.limitBytes)).toBe('5 GB');
    expect(usage.server?.accountUsageComplete).toBe(false);
  });
  it('rejects missing/invalid measurements and preserves above-limit percentages', async () => {
    const { parseServerStorage } = await import('../src/domain/cloudStorage');
    const raw = { usedBytes: 6_000_000_000, limitBytes: 5_000_000_000, freecastBytes: 5_000_000_000, sharedBytes: 1_000_000_000, mediaBytes: 100, libraryBytes: 20, mediaCount: 1, checkedAt: 123 };
    expect(parseServerStorage(raw).server?.usedPercent).toBe(120);
    expect(() => parseServerStorage({ ...raw, usedBytes: NaN })).toThrow();
    expect(() => parseServerStorage({ ...raw, limitBytes: 0 })).toThrow();
    expect(() => parseServerStorage({})).toThrow();
  });
});
