import { describe, expect, it } from 'vitest';
import { groupColor, parseLyrics, serializeLyrics } from '../src/domain/lyrics';

describe('parseLyrics', () => {
  it('splits slides on blank lines and labels groups', () => {
    const slides = parseLyrics('[Verse 1]\na\nb\n\nc\n\nchorus:\nd');
    expect(slides.map((s) => [s.group, s.text])).toEqual([
      ['Verse 1', 'a\nb'],
      ['Verse 1', 'c'],
      ['Chorus', 'd'],
    ]);
  });

  it('recognises bare section words and normalises case', () => {
    const slides = parseLyrics('pre-chorus 2\nx\nBRIDGE\ny');
    expect(slides.map((s) => s.group)).toEqual(['Pre-Chorus 2', 'BRIDGE']);
  });

  it('chunks long stanzas by maxLines', () => {
    const slides = parseLyrics('1\n2\n3\n4\n5', { maxLines: 2 });
    expect(slides.map((s) => s.text)).toEqual(['1\n2', '3\n4', '5']);
  });

  it('handles CRLF and surrounding whitespace', () => {
    expect(parseLyrics('  a  \r\n\r\n\r\n b ').map((s) => s.text)).toEqual(['a', 'b']);
  });

  it('round-trips through serializeLyrics', () => {
    const src = '[Verse 1]\na\nb\n\nc\n\n[Chorus]\nd';
    const once = parseLyrics(src);
    const twice = parseLyrics(serializeLyrics(once));
    expect(twice.map((s) => [s.group, s.text])).toEqual(once.map((s) => [s.group, s.text]));
  });
});

describe('groupColor', () => {
  it('distinguishes chorus from pre-chorus', () => {
    expect(groupColor('Chorus')).not.toBe(groupColor('Pre-Chorus'));
  });
});
