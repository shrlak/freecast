import { describe, expect, it } from 'vitest';
import { slideStageText } from '../src/domain/stageText';

describe('stage text', () => {
  it('prints heading and text, without bold marks', () => {
    expect(slideStageText({ id: 's', group: 'g', title: '**제목**', text: '본문' })).toBe('제목\n본문');
  });
  it('reads the text boxes of a PowerPoint slide, top to bottom', () => {
    expect(slideStageText({ id: 's', group: 'g', text: '', elements: [
      { id: 'b', kind: 'text', x: 10, y: 500, w: 1, h: 1, text: '둘째' },
      { id: 'i', kind: 'image', x: 0, y: 0, w: 1, h: 1 },
      { id: 'a', kind: 'text', x: 10, y: 100, w: 1, h: 1, text: ' 첫째 ' },
    ] })).toBe('첫째\n둘째');
  });
  it('is empty for no slide', () => {
    expect(slideStageText(null)).toBe('');
  });
});
