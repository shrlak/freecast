import type { Slide } from '../types';
import { uid } from '../lyrics';
import { formatRef, type BibleRef } from './refs';
import { loadTranslation, versesFor, type BibleText, type Translation, type Verse } from './data';

export interface ScriptureOptions {
  /** One or two translations; the second is shown under the first. */
  translations: Translation[];
  versesPerSlide: number;
  sermonTitle?: string;
  preacher?: string;
}

const label = (v: Verse) => (v.endVerse ? `${v.verse}-${v.endVerse}` : `${v.verse}`);
const lineOf = (v: Verse) => `${label(v)} ${v.text}`;

function chunkRef(r: BibleRef, chunk: Verse[], lang: 'ko' | 'en'): string {
  const a = chunk[0];
  const z = chunk[chunk.length - 1];
  const name = lang === 'ko' ? r.book.nameKo : r.book.nameEn;
  const end = z.endVerse ?? z.verse;
  if (a.chapter !== z.chapter) return `${name} ${a.chapter}:${a.verse}-${z.chapter}:${end}`;
  return a.verse === end ? `${name} ${a.chapter}:${a.verse}` : `${name} ${a.chapter}:${a.verse}-${end}`;
}

/** Verses of `other` that fall inside the primary chunk's verse span. */
function matching(other: Verse[], chunk: Verse[]): Verse[] {
  const a = chunk[0];
  const z = chunk[chunk.length - 1];
  const start = a.chapter * 1000 + a.verse;
  const end = z.chapter * 1000 + (z.endVerse ?? z.verse);
  return other.filter((v) => {
    const k = v.chapter * 1000 + v.verse;
    return k >= start && k <= end;
  });
}

/** One verse slide's worth of a reading, with the pieces the church Bible template prints. */
export interface ScriptureChunk {
  ref: BibleRef;
  /** Reference in the primary translation's language, e.g. "창세기 1:1-3". */
  label: string;
  /** Book name in Korean / English, first chapter and the verse span ("1-3", "31-2:4"). */
  nameKo: string;
  nameEn: string;
  chapter: number;
  verses: string;
  lines: string[];
  /** Matching verses of the second translation. */
  lines2: string[];
}

export function scriptureChunks(refs: BibleRef[], texts: BibleText[], opts: ScriptureOptions): ScriptureChunk[] {
  const [primary, secondary] = opts.translations;
  const per = Math.max(1, Math.floor(opts.versesPerSlide));
  const out: ScriptureChunk[] = [];
  for (const r of refs) {
    const main = versesFor(texts[0], r, primary.language === 'ko');
    const second = secondary && texts[1] ? versesFor(texts[1], r, secondary.language === 'ko') : [];
    for (let i = 0; i < main.length; i += per) {
      const chunk = main.slice(i, i + per);
      const a = chunk[0];
      const z = chunk[chunk.length - 1];
      const end = z.endVerse ?? z.verse;
      const verses = a.chapter !== z.chapter ? `${a.verse}-${z.chapter}:${end}` : a.verse === end ? `${a.verse}` : `${a.verse}-${end}`;
      out.push({
        ref: r, label: chunkRef(r, chunk, primary.language), nameKo: r.book.nameKo, nameEn: r.book.nameEn, chapter: a.chapter, verses,
        lines: chunk.map(lineOf), lines2: second.length ? matching(second, chunk).map(lineOf) : [],
      });
    }
  }
  return out;
}

export function planScripture(refs: BibleRef[], texts: BibleText[], opts: ScriptureOptions): Slide[] {
  const [primary, secondary] = opts.translations;
  const per = Math.max(1, Math.floor(opts.versesPerSlide));
  const slides: Slide[] = [];
  if (opts.sermonTitle?.trim()) {
    slides.push({
      id: uid('s'), group: '설교', title: opts.preacher ? `설교 · ${opts.preacher}` : '설교',
      text: opts.sermonTitle.trim(), subtext: refs.map((r) => formatRef(r, primary.language)).join(', '),
    });
  }
  for (const r of refs) {
    const main = versesFor(texts[0], r, primary.language === 'ko');
    const second = secondary && texts[1] ? versesFor(texts[1], r, secondary.language === 'ko') : [];
    const group = formatRef(r, primary.language);
    for (let i = 0; i < main.length; i += per) {
      const chunk = main.slice(i, i + per);
      const sub = second.length ? matching(second, chunk).map(lineOf).join('\n') : undefined;
      slides.push({
        id: uid('s'), group,
        title: `${chunkRef(r, chunk, primary.language)} (${primary.name}${secondary ? ` · ${secondary.name}` : ''})`,
        text: chunk.map(lineOf).join('\n'),
        subtext: sub,
      });
    }
  }
  return slides;
}

export async function buildScripture(refs: BibleRef[], opts: ScriptureOptions): Promise<Slide[]> {
  const texts = await Promise.all(opts.translations.slice(0, 2).map(loadTranslation));
  return planScripture(refs, texts, opts);
}

/** scriptureChunks() with the translations loaded from the content server. */
export async function loadScriptureChunks(refs: BibleRef[], opts: ScriptureOptions): Promise<ScriptureChunk[]> {
  const texts = await Promise.all(opts.translations.slice(0, 2).map(loadTranslation));
  return scriptureChunks(refs, texts, opts);
}
