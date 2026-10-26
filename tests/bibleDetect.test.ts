import { describe, expect, it } from 'vitest';
import { compactRef, detectRefs, koreanNumber, refsInSlides, spokenToDigits } from '../src/domain/bible/detect';
import { parseRefs } from '../src/domain/bible/refs';

const compacts = (text: string) => detectRefs(text).map((d) => d.compact);

describe('Korean spoken numbers', () => {
  it('reads numbers up to 999', () => {
    expect(['삼', '십', '십육', '이십팔', '백', '백오십', '백이십삼', '일'].map(koreanNumber)).toEqual([3, 10, 16, 28, 100, 150, 123, 1]);
    expect(koreanNumber('삼삼')).toBeNull();
    expect(koreanNumber('십십')).toBeNull();
    expect(koreanNumber('안녕')).toBeNull();
  });
  it('turns only the numbers before 장 · 편 · 절 into digits', () => {
    expect(spokenToDigits('요한복음 삼장 십육절')).toBe('요한복음 3장 16절');
    expect(spokenToDigits('이사야 사십 장')).toBe('이사야 40 장');
    expect(spokenToDigits('이사야서를 봅시다')).toBe('이사야서를 봅시다');
  });
});

describe('detecting references', () => {
  it('reads written forms', () => {
    expect(compacts('오늘 본문은 요한복음 3장 16절입니다')).toEqual(['요3:16']);
    expect(compacts('로마서 5장 1-11절')).toEqual(['롬5:1-11']);
    expect(compacts('시편 23편')).toEqual(['시23']);
    expect(compacts('요3:16-18')).toEqual(['요3:16-18']);
    expect(compacts('행1:8-2:3')).toEqual(['행1:8-2:3']);
    expect(compacts('John 3:16')).toEqual(['요3:16']);
    expect(compacts('1 John 4:8')).toEqual(['요일4:8']);
    expect(compacts('Psalm 23')).toEqual(['시23']);
    expect(compacts('Romans chapter 8 verse 28')).toEqual(['롬8:28']);
  });
  it('reads what is said aloud', () => {
    expect(compacts('요한복음 삼장 십육절을 같이 읽겠습니다')).toEqual(['요3:16']);
    expect(compacts('로마서 팔장 이십팔절')).toEqual(['롬8:28']);
    expect(compacts('시편 이십삼 편')).toEqual(['시23']);
    expect(compacts('요한복음 3장 16절에서 18절까지')).toEqual(['요3:16-18']);
    expect(compacts('요한복음 3장 16절부터 4장 2절')).toEqual(['요3:16-4:2']);
    expect(compacts('요한복음 3장 16 - 18절')).toEqual(['요3:16-18']);
    expect(compacts('고린도 전서 13장 4절')).toEqual(['고전13:4']);
    expect(compacts('요한 일서 4장 8절')).toEqual(['요일4:8']);
    expect(compacts('First John 4:8')).toEqual(['요일4:8']);
  });
  it('finds several, in order and once each', () => {
    expect(compacts('요한복음 3장 16절 그리고 로마서 8장 28절, 다시 요한복음 3장 16절')).toEqual(['요3:16', '롬8:28']);
    expect(compacts('요3:16 롬8:28')).toEqual(['요3:16', '롬8:28']);
  });
  it('prefers the longer book name (요한일서 is not 요한복음)', () => {
    expect(compacts('요한일서 4장 8절')).toEqual(['요일4:8']);
    expect(compacts('요한복음 4장 8절')).toEqual(['요4:8']);
  });
  it('ignores ordinary sentences and impossible references', () => {
    expect(compacts('오늘은 말씀을 3장 나눠서 전합니다')).toEqual([]);
    expect(compacts('나는 3시 16분에 도착했다')).toEqual([]);
    expect(compacts('요한복음 99장 1절')).toEqual([]);
    expect(compacts('John 3')).toEqual([]);
    expect(compacts('')).toEqual([]);
  });
  it('lets a one-letter abbreviation count only with chapter:verse after it', () => {
    expect(compacts('말3:16')).toEqual(['말3:16']);
    expect(compacts('롬 8:28 참고')).toEqual(['롬8:28']);
    expect(compacts('요 3:16')).toEqual(['요3:16']);
    expect(compacts('우리 말 3장 16절')).toEqual([]);
    expect(compacts('수 3장')).toEqual([]);
    expect(compacts('요   3:16')).toEqual([]);
  });
  it('gives refs the Bible box accepts back', () => {
    for (const text of ['요한복음 3장 16절', '시편 23편', '로마서 8장 28-30절', '사도행전 1장 8절부터 2장 3절', '창세기 1장', '요한이서 1장 6절']) {
      for (const d of detectRefs(text)) {
        const back = parseRefs(d.compact).refs;
        expect(back, text).toHaveLength(1);
        expect(compactRef(back[0])).toBe(d.compact);
      }
      expect(detectRefs(text), text).toHaveLength(1);
    }
  });
  it('labels in Korean', () => {
    expect(detectRefs('John 3:16')[0].label).toBe('요한복음 3:16');
  });
});

describe('references written on slides', () => {
  it('collects a sermon’s verses from text, text boxes and notes, once each, in order', () => {
    const found = refsInSlides([
      { text: '오늘의 말씀', notes: '먼저 요한복음 3장 16절을 읽습니다' },
      { text: '', title: '은혜', elements: [{ kind: 'text', text: '롬 8:28 참고' }, { kind: 'image' }] },
      { text: '다시 요3:16 그리고 시편 23편', subtext: '' },
    ]);
    expect(found.map((d) => d.compact)).toEqual(['요3:16', '롬8:28', '시23']);
  });
  it('stops at the limit and handles no slides', () => {
    expect(refsInSlides([])).toEqual([]);
    const many = Array.from({ length: 10 }, (_, i) => ({ text: `요한복음 ${i + 1}장 1절` }));
    expect(refsInSlides(many, 3)).toHaveLength(3);
  });
});
