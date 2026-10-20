import { describe, expect, it } from 'vitest';
import { dedupeSongs } from '../src/domain/sunday/dedupe';
import type { Presentation } from '../src/domain/types';

const song = (id: string, title: string, extra: Partial<Presentation> = {}): Presentation => ({ id, title, slides: [], themeId: 't', folder: 'Songs', ...extra });

describe('dedupeSongs', () => {
  it('keeps only the newest copy of a title, ignoring spacing and punctuation', () => {
    const list = [song('a', '주님의 은혜', { updatedAt: 100 }), song('b', '주님의은혜!', { updatedAt: 300 }), song('c', '주님의 은혜', { updatedAt: 200 })];
    const { presentations, replaced } = dedupeSongs(list);
    expect(presentations.map((p) => p.id)).toEqual(['b']);
    expect([...replaced]).toEqual([['a', 'b'], ['c', 'b']]);
  });

  it('prefers the copy edited on this computer over the church library’s', () => {
    const list = [song('online:x', '사랑', { online: true }), song('p_1', '사랑')];
    expect(dedupeSongs(list).presentations.map((p) => p.id)).toEqual(['p_1']);
  });

  it('lets a newer shared edit beat an older local copy', () => {
    const list = [song('online:x', '사랑', { online: true, updatedAt: 500 }), song('p_1', '사랑', { updatedAt: 100 })];
    expect(dedupeSongs(list).presentations.map((p) => p.id)).toEqual(['online:x']);
  });

  it('leaves other decks and distinct titles alone', () => {
    const list = [song('a', '사랑'), song('b', '사랑하는 주님'), song('c', '사랑', { folder: '0719 주일예배' })];
    expect(dedupeSongs(list).replaced.size).toBe(0);
  });
});
