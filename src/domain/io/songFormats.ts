import type { SongDraft, SongSection } from '../sunday/songs';

/** ChordPro (.cho/.chopro/.crd): {title:}, {start_of_verse}, inline [chords] kept. */
export function parseChordPro(text: string, fallback: string): SongDraft {
  let title = fallback;
  let key: string | undefined;
  const sections: SongSection[] = [];
  let current: SongSection | null = null;
  const open = (label: string) => {
    current = { label, lines: [] };
    sections.push(current);
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const dir = /^\{\s*([\w_]+)\s*(?::\s*(.*?))?\s*\}$/.exec(line);
    if (dir) {
      const [, name, value = ''] = dir;
      const n = name.toLowerCase();
      if (n === 'title' || n === 't') title = value || title;
      else if (n === 'key') key = value;
      else if (/^(start_of_|so)(verse|v)$/.test(n)) open(value || 'Verse');
      else if (/^(start_of_|so)(chorus|c)$/.test(n)) open(value || 'Chorus');
      else if (/^(start_of_|so)(bridge|b)$/.test(n)) open(value || 'Bridge');
      else if (/^(comment|c|ci)$/.test(n) && /^(verse|chorus|bridge|intro|tag|pre-?chorus)/i.test(value)) open(value);
      continue;
    }
    if (!line || line.startsWith('#')) continue;
    if (!current) open('Verse');
    current!.lines.push(line);
  }
  return { title, key, sections: sections.filter((s) => s.lines.length) };
}

const xmlText = (s: string) => s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** OpenLyrics XML (used by OpenLP and others). */
export function parseOpenLyrics(xml: string, fallback: string): SongDraft {
  const title = xmlText(/<title[^>]*>([\s\S]*?)<\/title>/.exec(xml)?.[1] ?? fallback).trim();
  const key = /<key>([^<]*)<\/key>/.exec(xml)?.[1];
  const order = /<verseOrder>([^<]*)<\/verseOrder>/.exec(xml)?.[1]?.trim().split(/\s+/);
  const sections: SongSection[] = [];
  for (const m of xml.matchAll(/<verse[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/verse>/g)) {
    const lines = [...m[2].matchAll(/<lines[^>]*>([\s\S]*?)<\/lines>/g)].flatMap((l) => xmlText(l[1]).split('\n')).map((l) => l.trim()).filter(Boolean);
    sections.push({ label: m[1].toUpperCase(), lines });
  }
  return { title, key, sections, progression: order?.map((o) => o.toUpperCase()) };
}

/** OpenSong song file: <lyrics> with [V1] headers and "." chord lines. */
export function parseOpenSong(xml: string, fallback: string): SongDraft {
  const title = xmlText(/<title>([\s\S]*?)<\/title>/.exec(xml)?.[1] ?? fallback).trim();
  const lyrics = xmlText(/<lyrics>([\s\S]*?)<\/lyrics>/.exec(xml)?.[1] ?? '');
  const order = /<presentation>([^<]*)<\/presentation>/.exec(xml)?.[1]?.trim().split(/\s+/).filter(Boolean);
  const sections: SongSection[] = [];
  for (const raw of lyrics.split('\n')) {
    const h = /^\[(.+)\]/.exec(raw.trim());
    if (h) sections.push({ label: h[1], lines: [] });
    else if (raw.startsWith(' ') && raw.trim()) {
      if (!sections.length) sections.push({ label: 'V', lines: [] });
      sections[sections.length - 1].lines.push(raw.trim().replace(/\s*\|\s*/g, ' '));
    }
  }
  return { title, sections, progression: order?.length ? order : undefined };
}

/** Plain text out of the RTF ProPresenter 6 stores per text element. */
function rtfToText(rtf: string): string {
  let depth = 0;
  let skip = -1;
  let out = '';
  for (let i = 0; i < rtf.length; i++) {
    const ch = rtf[i];
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { if (depth === skip) skip = -1; depth--; continue; }
    if (skip >= 0) continue;
    if (ch === '\\') {
      const m = /^\\([a-z]+)(-?\d+)? ?|^\\'([0-9a-f]{2})|^\\u(-?\d+)\??|^\\(.)/i.exec(rtf.slice(i));
      if (!m) continue;
      i += m[0].length - 1;
      if (m[1]) {
        if (['par', 'line'].includes(m[1])) out += '\n';
        else if (['fonttbl', 'colortbl', 'expandedcolortbl', 'stylesheet', 'info', '*'].includes(m[1])) skip = depth;
      } else if (m[3]) out += String.fromCharCode(parseInt(m[3], 16));
      else if (m[4]) out += String.fromCharCode((Number(m[4]) + 65536) % 65536);
      else if (m[5] === '*') skip = depth;
      else if (m[5] && '\\{}'.includes(m[5])) out += m[5];
      continue;
    }
    if (ch !== '\r' && ch !== '\n') out += ch;
  }
  return out.replace(/\n{2,}/g, '\n').trim();
}

const b64 = (s: string) => {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
};

/** ProPresenter 6 document (.pro6, XML). Groups become sections; one slide per element text. */
export function parsePro6(xml: string, fallback: string): SongDraft & { slides: { group: string; text: string }[] } {
  const title = /<RVPresentationDocument[^>]*CCLISongTitle="([^"]*)"/.exec(xml)?.[1] || fallback;
  const slides: { group: string; text: string }[] = [];
  const sections: SongSection[] = [];
  for (const g of xml.matchAll(/<RVSlideGrouping[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/RVSlideGrouping>/g)) {
    const group = g[1] || 'Slide';
    const section: SongSection = { label: group, lines: [] };
    for (const sl of g[2].matchAll(/<RVDisplaySlide[\s\S]*?<\/RVDisplaySlide>/g)) {
      const texts = [...sl[0].matchAll(/<NSString[^>]*rvXMLIvarName="PlainText"[^>]*>([^<]*)<\/NSString>/g)].map((m) => b64(m[1]))
        .concat([...sl[0].matchAll(/<NSString[^>]*rvXMLIvarName="RTFData"[^>]*>([^<]*)<\/NSString>/g)].map((m) => rtfToText(b64(m[1]))));
      const text = texts.find((t) => t.trim())?.trim() ?? '';
      slides.push({ group, text });
      section.lines.push(...text.split('\n'));
    }
    sections.push(section);
  }
  return { title, sections, slides };
}

import type { Presentation } from '../types';
import { parseLyrics, uid } from '../lyrics';
import { parseLyricsMarkdown, songToPresentation } from '../sunday/songs';

/** Turn any supported song file into a presentation (by extension, then by sniffing the content). */
export function presentationFromSongFile(name: string, text: string, linesPerSlide: number): Presentation {
  const base = name.replace(/\.[^.]+$/, '');
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';
  const opts = { themeId: 'theme_classic', linesPerSlide, folder: 'Songs' };
  if (ext === 'pro6' || text.includes('<RVPresentationDocument')) {
    const pro = parsePro6(text, base);
    return {
      id: uid('p'), title: pro.title, themeId: 'theme_classic', folder: 'Songs',
      slides: pro.slides.filter((s) => s.text).map((s) => ({ id: uid('s'), group: s.group, text: s.text })),
    };
  }
  if (['cho', 'chopro', 'chordpro', 'crd'].includes(ext) || /^\s*\{(title|t):/m.test(text)) return songToPresentation(parseChordPro(text, base), opts);
  if (text.includes('<song') && text.includes('openlyrics')) return songToPresentation(parseOpenLyrics(text, base), opts);
  if (text.includes('<song') && text.includes('<lyrics>')) return songToPresentation(parseOpenSong(text, base), opts);
  if (ext === 'md') return songToPresentation(parseLyricsMarkdown(text, base), opts);
  return { id: uid('p'), title: base, slides: parseLyrics(text), themeId: 'theme_classic', folder: 'Songs' };
}
