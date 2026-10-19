// Keeps the library's 주일예배 Front and Back decks the same as the church's current
// templates (front-slides.pptx / back-slides.pptx): the Front shows this coming Sunday's date
// and this week's 기도제목, the Back this season's 공동체 고백송.
// A deck built from the same church file is only refreshed in place (date, 기도제목, 고백송 block),
// so edits made to it in FreeCast stay; it is rebuilt from the template when the church file
// itself changes, or when it is still FreeCast's built-in placeholder.
import type { Library, Presentation } from '../types';
import { DEFAULT_CONFESSION_SONG } from '../defaults';
import { findSong } from '../sunday/songs';
import { fillSlide } from './convert';
import { fillFront, refreshFront } from './fill';
import { parsePrayerTopics } from '../sunday/prayer';
import { mdy, upcomingSunday } from '../sunday/notice';
import { applyConfessionSong, songSections } from './confession';
import type { ServiceTemplates } from './serviceTemplates';

const PLACEHOLDER_SLIDES = { front: 'front_prayer', back: 'back_confession' } as const;

const isPlaceholder = (p: Presentation, kind: 'front' | 'back') => p.slides.some((s) => s.id === PLACEHOLDER_SLIDES[kind]);
/** Built from the templates by FreeCast (every slide sits on a baked template background). */
const fromTemplates = (p: Presentation, kind: 'front' | 'back') =>
  p.templateKey?.startsWith(`${kind}:`) || (p.slides.length > 0 && p.slides.every((s) => s.background?.kind === 'media' && s.background.mediaId.startsWith('tpl-')));

function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface DeckUpdate {
  id: string;
  patch: Partial<Presentation>;
}

/** The updates that bring the library's Front/Back decks in line with the templates (empty when they already are). */
export function templateDeckUpdates(lib: Library, tpl: ServiceTemplates, now = new Date()): DeckUpdate[] {
  const out: DeckUpdate[] = [];
  const byId = (id: string | null) => (id ? lib.presentations.find((p) => p.id === id) : undefined);
  const base = { themeId: 'theme_classic', background: { kind: 'color', value: '#000000' } } as const;

  const front = byId(lib.sunday.frontId);
  const sunday = upcomingSunday(now);
  const prayer = (lib.sunday.prayerText ?? '').trim();
  const frontKey = `front:${tpl.keys.front}|${mdy(sunday)}|${hash(prayer)}`;
  if (front && front.templateKey !== frontKey) {
    const topics = parsePrayerTopics(prayer);
    // Same church file as before: only the date and the 기도 준비 slides change, edits stay.
    if (front.templateKey?.startsWith(`front:${tpl.keys.front}|`)) out.push({ id: front.id, patch: { templateKey: frontKey, slides: refreshFront(front.slides, tpl, sunday, topics) } });
    else if (isPlaceholder(front, 'front') || fromTemplates(front, 'front')) out.push({ id: front.id, patch: { ...base, templateKey: frontKey, slides: fillFront(tpl, sunday, topics) } });
  }

  const back = byId(lib.sunday.backId);
  if (back && tpl.back?.length && tpl.keys.back) {
    const title = lib.sunday.confessionSong.trim() || DEFAULT_CONFESSION_SONG;
    const song = findSong(lib.presentations, title);
    const lyrics = song ? songSections(song) : [];
    const backKey = `back:${tpl.keys.back}|${song ? `${song.title}:${hash(JSON.stringify(lyrics))}` : '-'}`;
    if (back.templateKey !== backKey) {
      if (back.templateKey?.startsWith(`back:${tpl.keys.back}|`)) {
        // Same church file: only the 공동체 고백송 block is rewritten, edits elsewhere stay.
        out.push({ id: back.id, patch: { templateKey: backKey, slides: (song && applyConfessionSong(back.slides, song)) || back.slides } });
      } else if (isPlaceholder(back, 'back') || fromTemplates(back, 'back')) {
        const slides = tpl.back.map((s) => fillSlide(s, (t) => t));
        out.push({ id: back.id, patch: { ...base, templateKey: backKey, slides: (song && applyConfessionSong(slides, song)) || slides } });
      }
    }
  }
  return out;
}
