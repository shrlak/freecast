import { describe, expect, it } from 'vitest';
import { BACKGROUND_PRESETS, BG_NIGHT_SKY, createSeedLibrary } from '../src/domain/defaults';
import { normalizeLibrary } from '../src/domain/persistence';

describe('curated background library', () => {
  it('keeps exactly the requested four presets and the original starry sky', () => {
    expect(BACKGROUND_PRESETS.map((p) => p.name)).toEqual(['KCCP 흰색 + 로고', 'Black', 'White', '별이 있는 밤하늘']);
    expect(BACKGROUND_PRESETS[3].background).toEqual(BG_NIGHT_SKY);
    expect(BG_NIGHT_SKY).toMatchObject({ kind: 'image', url: 'backgrounds/night-sky.jpg' });
  });
  it('clears old registrations once while preserving assets, slides and later explicit uploads', () => {
    const old = createSeedLibrary();
    delete old.backgroundLibraryReset;
    old.media = [{ id: 'ppt', name: 'PPT 1', type: 'image' }, { id: 'music', name: 'Music', type: 'audio' }];
    old.presentations[0].slides[0].background = { kind: 'media', mediaId: 'ppt', mediaType: 'image', fit: 'contain' };
    const updated = normalizeLibrary(old)!;
    expect(updated.media[0]).toEqual({ ...old.media[0], backgroundHidden: true });
    expect(updated.media[1]).toEqual(old.media[1]);
    expect(updated.presentations[0].slides[0].background).toEqual(old.presentations[0].slides[0].background);
    updated.media.push({ id: 'new', name: 'Manual upload', type: 'image' });
    const again = normalizeLibrary(updated)!;
    expect(again.media[0].backgroundHidden).toBe(true);
    expect(again.media[2].backgroundHidden).toBeUndefined();
  });
});
