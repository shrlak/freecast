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
