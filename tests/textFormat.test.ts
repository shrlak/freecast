import { describe, expect, it } from 'vitest';
import { changeCase, listMarker, listMarkers, stepFontSize } from '../src/domain/textFormat';

describe('PowerPoint text commands', () => {
  it('steps font sizes through PowerPoint’s list (canvas px = 2 × pt)', () => {
    expect(stepFontSize(82, 1)).toBe(88);
    expect(stepFontSize(82, -1)).toBe(80);
    expect(stepFontSize(80, 1)).toBe(88);
    expect(stepFontSize(192, 1)).toBe(211);
    expect(stepFontSize(16, -1)).toBe(15);
  });

  it('numbers only the lines with text', () => {
    expect(listMarkers(['a', '', 'b', 'c'], 'number')).toEqual(['1.', null, '2.', '3.']);
    expect(listMarkers(['a'], undefined)).toEqual([null]);
    expect([listMarker('roman', 4), listMarker('alpha', 2), listMarker('hangul', 3), listMarker('number-paren', 1)]).toEqual(['IV.', 'B.', '다.', '1)']);
  });

  it('changes case like 대/소문자 바꾸기', () => {
    expect(changeCase('amazing GRACE. how sweet', 'sentence')).toBe('Amazing grace. How sweet');
    expect(changeCase('amazing grace', 'title')).toBe('Amazing Grace');
    expect(changeCase('Amazing', 'toggle')).toBe('aMAZING');
    expect(changeCase('주 예수 Lord', 'upper')).toBe('주 예수 LORD');
  });
});
