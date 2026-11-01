import type { Library, Playlist, PlaylistItem, Presentation, RetreatLook, Slide } from './types';
import { defaultRetreatLook, retreatBackground, withTheme } from './motion';
import { uid } from './lyrics';
import { CHURCH_BACKGROUNDS, presetBackground } from './defaults';
import { findSong } from './sunday/songs';
import { announcementPages, parseAnnouncements } from './sunday/announcements';
import { qrElements } from './qrElements';
import { mmdd } from './sunday/notice';

export interface RetreatSong {
  title: string;
  /** Lyrics: blank line = next slide. Empty when a library song is linked. */
  text: string;
  presentationId?: string;
}

export type RetreatBlock =
  | { id: string; kind: 'title' }
  | { id: string; kind: 'worship'; heading: string; songs: RetreatSong[] }
  | { id: string; kind: 'scripture'; refs: string }
  | { id: string; kind: 'sermonTitle'; title: string; preacher: string }
  | { id: string; kind: 'blank' }
  | { id: string; kind: 'prayer'; title: string }
  | { id: string; kind: 'benediction' }
  | { id: string; kind: 'announcements'; heading: string; text: string };

export type BlockKind = RetreatBlock['kind'];

export interface Meeting {
  id: string;
  name: string;
  /** YYYY-MM-DD */
  date: string;
  posterMediaId?: string;
  blocks: RetreatBlock[];
}

export interface RetreatDraft {
  name: string;
  subtitle: string;
  theme: string;
  linesPerSlide: number;
  translations: string[];
  meetings: Meeting[];
  /** Moving background; follows `theme` while 자동 is on. Drafts saved before it existed have none. */
  look?: RetreatLook;
}

export const BLOCK_LABELS: Record<BlockKind, string> = {
  title: '수련회 제목', worship: '찬양', scripture: '설교말씀', sermonTitle: '설교 제목',
  blank: '빈 화면', prayer: '기도', benediction: '축도', announcements: '광고',
};

export function newBlock(kind: BlockKind): RetreatBlock {
  const id = uid('blk');
  switch (kind) {
    case 'worship': return { id, kind, heading: '찬양', songs: [] };
    case 'scripture': return { id, kind, refs: '' };
    case 'sermonTitle': return { id, kind, title: '', preacher: '' };
    case 'prayer': return { id, kind, title: '기도' };
    case 'announcements': return { id, kind, heading: '광고', text: '' };
    default: return { id, kind } as RetreatBlock;
  }
}

const blocks = (...spec: (BlockKind | [BlockKind, Partial<RetreatBlock>])[]): RetreatBlock[] =>
  spec.map((x) => (Array.isArray(x) ? ({ ...newBlock(x[0]), ...x[1] } as RetreatBlock) : newBlock(x)));

/** The three meetings of the usual retreat order (Friday evening, Saturday lecture, Saturday evening). */
export function defaultRetreat(friday: string): RetreatDraft {
  const sat = new Date(`${friday}T12:00:00`);
  sat.setDate(sat.getDate() + 1);
  const saturday = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`;
  return {
    name: '수련회', subtitle: '', theme: '', linesPerSlide: 4, translations: ['nkrv', 'esv'], look: defaultRetreatLook(''),
    meetings: [
      { id: uid('mt'), name: '금요일 저녁예배', date: friday, blocks: blocks('title', 'worship', 'scripture', 'sermonTitle', 'blank', ['prayer', { title: '기도회' }], 'prayer', 'benediction', ['announcements', { heading: 'OT | 광고' }]) },
      { id: uid('mt'), name: '토요일 오전 특강', date: saturday, blocks: blocks('title', 'worship', 'announcements') },
      { id: uid('mt'), name: '토요일 저녁예배', date: saturday, blocks: blocks('title', 'worship', 'scripture', 'sermonTitle', ['prayer', { title: '기도회' }], ['worship', { heading: '찬양집회' }], 'prayer', 'benediction', 'announcements') },
    ],
  };
}

/** Split a song's lyrics into slides: blank line = new slide; long stanzas split evenly at `maxLines`. */
export function lyricSlides(text: string, maxLines: number): string[] {
  const out: string[] = [];
  for (const stanza of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = stanza.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const parts = Math.ceil(lines.length / maxLines);
    const size = Math.ceil(lines.length / parts);
    for (let i = 0; i < lines.length; i += size) out.push(lines.slice(i, i + size).join('\n'));
  }
  return out;
}

/** "토요일 저녁예배" → "Evening" for the file name (0117_Retreat_Evening.pptx). */
export function meetingTag(name: string): string {
  if (/특강|lecture/i.test(name)) return 'Lecture';
  if (/기도/.test(name)) return 'Prayer';
  if (/저녁|evening/i.test(name)) return 'Evening';
  if (/오전|아침|morning/i.test(name)) return 'Morning';
  if (/오후|afternoon/i.test(name)) return 'Afternoon';
  if (/찬양/.test(name)) return 'Praise';
  return 'Meeting';
}

export const meetingFileName = (m: Meeting) => `${mmdd(new Date(`${m.date}T12:00:00`))}_Retreat_${meetingTag(m.name)}`;

/**
 * Build one meeting's presentation + playlist. `scripture` holds prebuilt verse slides
 * per scripture block id (loading Bible text is async, so the caller does it).
 */
export function buildMeeting(lib: Library, draft: RetreatDraft, m: Meeting, scripture: Map<string, Slide[]>): { presentations: Presentation[]; playlist: Playlist; warnings: string[] } {
  const date = new Date(`${m.date}T12:00:00`);
  const folder = `${mmdd(date)} 수련회`;
  const night = CHURCH_BACKGROUNDS.nightSky;
  const look = draft.look ? withTheme(draft.look, draft.theme) : defaultRetreatLook(draft.theme);
  const moving = retreatBackground(look);
  const created: Presentation[] = [];
  const items: PlaylistItem[] = [];
  const warnings: string[] = [];
  const caption = [draft.name, draft.subtitle].filter(Boolean).join(' · ');
  const s = (group: string, text: string, extra: Partial<Slide> = {}): Slide => ({ id: uid('s'), group, text, ...extra });
  /** `follow` decks take the retreat's moving background, now and whenever it is changed later. */
  const add = (title: string, slides: Slide[], themeId: string, extra: Partial<Presentation> = {}, follow = true) => {
    if (!slides.length) return;
    const p: Presentation = { id: uid('p'), title, slides, themeId, folder, background: night, ...extra,
      ...(follow ? { retreatBg: true, ...(moving ? { background: moving, bgEffect: { dim: look.dim, blur: 0 } } : {}) } : {}) };
    created.push(p);
    items.push({ id: uid('pli'), presentationId: p.id });
  };
  const header = (title: string) => items.push({ id: uid('pli'), kind: 'header', title });

  header(m.name);
  const opening: Slide[] = [];
  if (m.posterMediaId) opening.push(s('Poster', '', { background: { kind: 'media', mediaId: m.posterMediaId, mediaType: 'image', fit: 'contain' } }));
  add(`${mmdd(date)} ${m.name}`, opening, 'theme_classic', {}, false);

  for (const b of m.blocks) {
    switch (b.kind) {
      case 'title':
        add(BLOCK_LABELS.title, [s('Title', draft.name, { subtext: [draft.subtitle, draft.theme].filter(Boolean).join('\n') || undefined })], 'theme_bold', { background: CHURCH_BACKGROUNDS.worship });
        break;
      case 'worship': {
        header(b.heading || '찬양');
        add(b.heading || '찬양', [s('Section', b.heading || '찬양')], 'theme_bold');
        for (const song of b.songs) {
          const linked = (song.presentationId && lib.presentations.find((p) => p.id === song.presentationId)) || (!song.text.trim() ? findSong(lib.presentations, song.title) : undefined);
          if (linked) {
            items.push({ id: uid('pli'), presentationId: linked.id });
            continue;
          }
          const slides = lyricSlides(song.text, draft.linesPerSlide).map((t, i) => s(`Slide ${i + 1}`, t, { caption: song.title }));
          if (!slides.length) {
            warnings.push(`“${song.title}”: no lyrics`);
            slides.push(s('Title', song.title));
          }
          add(song.title, slides, 'theme_classic', { folder: 'Songs' });
        }
        break;
      }
      case 'scripture':
        add(BLOCK_LABELS.scripture, scripture.get(b.id) ?? [], 'theme_scripture', { background: CHURCH_BACKGROUNDS.bible });
        break;
      case 'sermonTitle':
        if (b.title.trim()) add(BLOCK_LABELS.sermonTitle, [s('Sermon', b.title.trim(), { subtext: b.preacher || undefined })], 'theme_bold');
        break;
      case 'blank':
        add(BLOCK_LABELS.blank, [s('Blank', '', { background: presetBackground('Black') })], 'theme_classic', {}, false);
        break;
      case 'prayer':
        add(b.title || '기도', [s('Prayer', b.title || '기도')], 'theme_bold', { background: CHURCH_BACKGROUNDS.prayer });
        break;
      case 'benediction':
        add(BLOCK_LABELS.benediction, [s('Benediction', '축도')], 'theme_bold', { background: CHURCH_BACKGROUNDS.sanctuary });
        break;
      case 'announcements': {
        const anns = parseAnnouncements(b.text);
        const slides = [s('광고', b.heading || '광고'), ...anns.flatMap((a, i) => announcementPages(a).map((pg) => s('광고', pg.body.join('\n'), { title: `${i + 1}. ${a.title}`, elements: pg.links.length ? qrElements(pg.links) : undefined, caption })))];
        add(b.heading || '광고', slides, 'theme_info', {}, false);
        break;
      }
    }
  }
  return {
    presentations: created,
    playlist: { id: uid('pl'), name: `${mmdd(date)} 수련회 · ${m.name}`, items },
    warnings,
  };
}
