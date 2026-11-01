// The 주일예배 마법사's steps. Each can also be opened on its own (단계별 수정) from the ribbon
// and the start screen, so one part of the service can be changed without going through the rest.
import type { Library } from '../types';
import type { SongDraft } from './songs';
import { findLiveService, SECTION, sectionPresentations } from './liveDeck';

export interface SundayStep {
  /** Tab label in the wizard. */
  label: string;
  /** Button label for editing this step alone. */
  edit: string;
  icon: string;
  hint: string;
}

export const SUNDAY_STEPS: readonly SundayStep[] = [
  { label: '찬양', edit: '찬양 수정', icon: '🎵', hint: '찬양 순서 · 가사 · 설교 후 찬양만 고칩니다' },
  { label: '성경 말씀', edit: '말씀 수정', icon: '📖', hint: '본문 · 설교 제목 · 설교자 · 번역본만 고칩니다' },
  { label: '설교', edit: '설교 수정', icon: '🎤', hint: '설교 슬라이드만 바꿉니다' },
  { label: '기도회 · 기도제목', edit: '기도 수정', icon: '🙏', hint: '기도회 찬양 · 기도제목만 고칩니다' },
  { label: '광고', edit: '광고 수정', icon: '📢', hint: '광고만 고칩니다' },
  { label: '추가 자료', edit: '추가 자료', icon: '📎', hint: '광고 뒤 추가 자료만 고칩니다' },
  { label: '생성', edit: '날짜 · 순서', icon: '🗓', hint: '예배 날짜 · 공동체 고백 · Front/Back 슬라이드를 고치고 순서를 확인합니다' },
];

/**
 * The songs already in that week's playlist (찬양 and 설교 후 찬양), as drafts that reuse those decks.
 * A wizard opened with no songs of its own starts from these, so changing one song does not drop
 * the ones a 콘티 or lyric upload put there.
 */
export function songsInService(lib: Library, date: Date): SongDraft[] {
  const pl = findLiveService(lib, date);
  if (!pl) return [];
  return ([[SECTION.songs, false], [SECTION.after, true]] as const).flatMap(([section, postSermon]) =>
    sectionPresentations(pl, section, lib.presentations).flatMap((id) => {
      const p = lib.presentations.find((x) => x.id === id);
      return p ? [{ title: p.title, sections: [], presentationId: p.id, ...(postSermon ? { postSermon: true } : {}) }] : [];
    }));
}
