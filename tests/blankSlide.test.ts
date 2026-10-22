import { describe, expect, it } from 'vitest';
import { blankSlide } from '../src/domain/lyrics';

describe('blankSlide', () => {
  it('is empty on a white background with dark text, and unique each time', () => {
    const a = blankSlide('Verse 1');
    expect(a).toMatchObject({ group: 'Verse 1', text: '', background: { kind: 'color', value: '#ffffff' }, style: { color: '#000000' } });
    expect(blankSlide().id).not.toBe(a.id);
  });
});
