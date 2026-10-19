// The 주일예배 designs, read from the same .pptx templates the shrlak/ppt program builds its
// deck from, fetched from the online content server each session:
//   front-slides.pptx     → Front (기도 준비, welcome + date, 신앙고백) — the church's own copy
//                           bundled with FreeCast (public/templates/) wins over the server's
//   service-template.pptx → 기도 (slide 17), 광고 title (32) and 광고 item (33)
//   template.pptx         → song title slide (1) and lyric slide (2)
//   bible-template.pptx   → 성경 말씀 title (1), verse slide (2), 설교 title (3)
//   back-slides.pptx      → Back / End, all of it (공동체 고백송, 송별, 헌금, 축복송 …) — the church's
//                           own copy bundled with FreeCast, else the published ppt site
import type { Slide } from '../types';
import { renderPptxSlides, revokeRenderedSlides, type RenderedSlide } from '../io/pptxRender';
import { getMedia, putMedia } from '../media';
import { contentServer } from '../online';
import { bakeBackground } from './bake';
import { slideFromRendered } from './convert';

export interface ServiceTemplates {
  front: Slide[];
  prayer: Slide;
  announceTitle: Slide;
  announceItem: Slide;
  songTitle: Slide;
  songLyrics: Slide;
  bibleTitle: Slide;
  bibleVerse: Slide;
  sermon: Slide;
  /** The church's current closing deck; missing when it could not be downloaded. */
  back?: Slide[];
  /** Content hashes of the decks, to tell when the church changed them. */
  keys: { front: string; back?: string };
}

/** Where the ppt program publishes back-slides.pptx (it is kept out of the repo). */
export const BACK_DECK_URL = 'https://shrlak.github.io/ppt/back-slides.pptx';

/** Same as the ppt program's SERVICE_SLIDES (1-based). */
const SERVICE = { prayer: 17, announceTitle: 32, announceItem: 33 };

async function hash(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest).slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Render slides of a .pptx into FreeCast slides. Backgrounds are baked once and stored under
 * `mediaId(index)`; an id already in the media store is reused without drawing again.
 */
export async function pptxSlides(
  data: ArrayBuffer,
  opts: { pick?: number[]; group: (index: number) => string; mediaId: (index: number) => string; store?: (id: string, blob: Blob) => Promise<void>; onSlide?: (slide: Slide, index: number, total: number) => void },
): Promise<Slide[]> {
  const rendered = await renderPptxSlides(data);
  try {
    const wanted = (opts.pick ?? rendered.map((_, i) => i)).filter((i) => rendered[i]);
    const out: Slide[] = [];
    for (const [n, i] of wanted.entries()) {
      const rs: RenderedSlide = rendered[i];
      const id = opts.mediaId(i);
      if (!(await getMedia(id).catch(() => undefined))) {
        const blob = await bakeBackground(rs);
        await (opts.store ? opts.store(id, blob) : putMedia(id, blob));
      }
      const slide = slideFromRendered(rs, id, opts.group(i));
      out.push(slide);
      opts.onSlide?.(slide, n, wanted.length);
    }
    return out;
  } finally {
    revokeRenderedSlides(rendered);
  }
}

/** Decks the church gave FreeCast directly, served with the app (they win over the content server). */
const BUNDLED: Record<string, string> = { 'front-slides.pptx': 'templates/front-slides.pptx', 'back-slides.pptx': 'templates/back-slides.pptx' };

async function fetchDeck(name: string, ...fallbacks: string[]): Promise<{ data: ArrayBuffer; key: string }> {
  let res: Response | null = null;
  const bundled = BUNDLED[name] ? [new URL(BUNDLED[name], document.baseURI).href] : [];
  for (const url of [...bundled, `${contentServer()}${name}`, ...fallbacks]) {
    res = await fetch(url).catch(() => null);
    if (res?.ok) break;
  }
  if (!res?.ok) throw new Error(`${name}: ${res?.status ?? 'offline'}`);
  const data = await res.arrayBuffer();
  // '-43c': backgrounds baked for the 4:3 canvas with picture crops (the key also names the cached images).
  return { data, key: `tpl-${await hash(data)}-43c` };
}

let cached: Promise<ServiceTemplates> | null = null;

/** The church templates (loaded once per session; `reload` fetches them again). */
export function loadServiceTemplates(reload = false): Promise<ServiceTemplates> {
  if (!cached || reload) {
    cached = build().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

async function build(): Promise<ServiceTemplates> {
  const [front, service, song, bible] = await Promise.all(['front-slides.pptx', 'service-template.pptx', 'template.pptx', 'bible-template.pptx'].map((n) => fetchDeck(n)));
  const read = (deck: { data: ArrayBuffer; key: string }, group: string, pick?: number[]) =>
    pptxSlides(deck.data, { pick, group: () => group, mediaId: (i) => `${deck.key}-${i}` });
  const backDeck = fetchDeck('back-slides.pptx', BACK_DECK_URL).catch(() => null);
  const [frontSlides, serviceSlides, songSlides, bibleSlides, backSlides] = await Promise.all([
    read(front, 'Front'),
    read(service, '기도', [SERVICE.prayer - 1, SERVICE.announceTitle - 1, SERVICE.announceItem - 1]),
    read(song, '찬양', [0, 1]),
    read(bible, '성경 말씀', [0, 1, 2]),
    backDeck.then((d) => (d ? read(d, 'Back') : undefined)).catch(() => undefined),
  ]);
  if (frontSlides.length < 2 || serviceSlides.length < 3 || songSlides.length < 2 || bibleSlides.length < 3) throw new Error('템플릿 파일의 슬라이드가 부족합니다');
  const named = (s: Slide, group: string) => ({ ...s, group });
  return {
    front: frontSlides,
    prayer: named(serviceSlides[0], '기도'),
    announceTitle: named(serviceSlides[1], '광고'),
    announceItem: named(serviceSlides[2], '광고'),
    songTitle: named(songSlides[0], 'Title'),
    songLyrics: songSlides[1],
    bibleTitle: bibleSlides[0],
    bibleVerse: bibleSlides[1],
    sermon: named(bibleSlides[2], '설교'),
    back: backSlides?.length ? backSlides : undefined,
    keys: { front: front.key, back: backSlides?.length ? (await backDeck)?.key : undefined },
  };
}
