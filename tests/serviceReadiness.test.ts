import { describe, expect, it } from 'vitest';
import { createSeedLibrary } from '../src/domain/defaults';
import { emptySlide, referencedAssets, replaceDeckSlides, serviceDecks } from '../src/domain/serviceReadiness';
import { pruneIds } from '../src/domain/restorePoints';

describe('service preparation', () => {
  it('replaces slides while keeping identity, settings, and playlist order', () => {
    const lib = createSeedLibrary();
    const p = { ...lib.presentations[0], transition: { kind: 'fade' as const, duration: 400 } };
    const slides = [{ id: 'new', group: '설교', text: '새 설교' }];
    const updated = replaceDeckSlides(p, slides);
    expect(updated).toEqual({ ...p, slides });
    expect(p.slides).not.toBe(slides);
    expect(() => replaceDeckSlides(p, [])).toThrow('기존 PPT');
    const pl = { id: 'service', name: '주일예배', items: [{ id: 'h', kind: 'header' as const, title: '설교' }, { id: 'i', presentationId: p.id }] };
    expect(serviceDecks({ ...lib, presentations: [updated], playlists: [pl] }, pl.id)).toEqual([updated]);
    expect(pl.items[1].presentationId).toBe(updated.id);
    expect(serviceDecks(lib, 'absent')).toEqual([]);
  });
  it('flags visually empty slides including notes-only and plain black slides', () => {
    expect(emptySlide({ id: 's', group: '', text: ' ', notes: 'speaker note' })).toBe(true);
    expect(emptySlide({ id: 's', group: '', text: '', background: { kind: 'color', value: '#000' } })).toBe(true);
    expect(emptySlide({ id: 's', group: '', text: '기도' })).toBe(false);
    expect(emptySlide({ id: 's', group: '', text: '', background: { kind: 'media', mediaId: 'pic', mediaType: 'image' } })).toBe(false);
  });
  it('checks nested slide assets and inherited deck backgrounds, without duplicates', () => {
    const p = createSeedLibrary().presentations[0];
    const decks = [{ ...p, background: { kind: 'image' as const, url: 'backgrounds/night-sky.jpg' }, slides: [{ id: 's', group: '', text: '', background: { kind: 'media' as const, mediaId: 'movie', mediaType: 'video' as const }, actions: [{ type: 'audio' as const, mediaId: 'song' }] }] }];
    expect(referencedAssets(decks)).toEqual({ media: ['movie', 'song'], images: ['backgrounds/night-sky.jpg'] });
  });
  it('retains event snapshots ahead of periodic autos', () => {
    expect(pruneIds([{ id: 1, at: 1, kind: 'import' }, { id: 2, at: 2, kind: 'show' }, { id: 3, at: 3, kind: 'auto' }], 2)).toEqual([3]);
  });
});
