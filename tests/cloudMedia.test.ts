import { describe, expect, it } from 'vitest';
import { rankServerMedia } from '../src/domain/cloudMedia';

describe('server media inventory', () => {
  it('sorts actual server sizes and includes orphan files without inventing names', () => {
    expect(rankServerMedia([
      { id: 'small', size: 9, type: 'image/png' },
      { id: 'orphan', size: 1000, type: 'video/mp4' },
      { id: 'large', size: 100 },
    ], { media: [{ id: 'small', name: '사진' }, { id: 'large', name: '찬양', type: 'audio' }, { id: 'local-only', name: '미업로드' }] })).toEqual([
      { id: 'orphan', name: 'orphan', size: 1000, type: 'video/mp4' },
      { id: 'large', name: '찬양', size: 100, type: 'audio' },
      { id: 'small', name: '사진', size: 9, type: 'image/png' },
    ]);
  });
  it('handles an empty or missing library and rejects invalid sizes', () => {
    expect(rankServerMedia([], null)).toEqual([]);
    expect(rankServerMedia([{ id: 'zero', size: 0 }], {})[0].name).toBe('zero');
    for (const size of [-1, NaN, Infinity, 1.5]) expect(() => rankServerMedia([{ id: 'bad', size }], null)).toThrow();
  });
});
