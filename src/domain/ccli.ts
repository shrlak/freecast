import type { Library, Presentation } from './types';
import { isSong } from './templates/fill';

export interface CcliRow {
  presentationId: string;
  title: string;
  ccli: string;
  author: string;
  copyright: string;
  /** How many times the song came on screen in the period. */
  count: number;
  firstAt: number;
  lastAt: number;
}

const endOfDay = (day: string) => new Date(`${day}T23:59:59.999`).getTime();
const startOfDay = (day: string) => new Date(`${day}T00:00:00`).getTime();

/** Songs shown in the period (YYYY-MM-DD, both ends included), grouped by song, with their CCLI details. */
export function ccliReport(lib: Library, from?: string, to?: string): CcliRow[] {
  const lo = from ? startOfDay(from) : -Infinity;
  const hi = to ? endOfDay(to) : Infinity;
  const rows = new Map<string, CcliRow>();
  for (const u of lib.usage) {
    if (u.at < lo || u.at > hi) continue;
    const p = lib.presentations.find((x) => x.id === u.presentationId);
    // Announcements and scripture decks are not songs; a deleted deck is kept if the log recorded a CCLI number.
    if (p ? !isSong(p) && !p.meta?.ccli : !u.ccli) continue;
    const key = p ? p.id : `title:${u.title}`;
    const old = rows.get(key);
    if (old) { old.count++; old.firstAt = Math.min(old.firstAt, u.at); old.lastAt = Math.max(old.lastAt, u.at); continue; }
    rows.set(key, {
      presentationId: u.presentationId, title: p?.title ?? u.title, ccli: p?.meta?.ccli ?? u.ccli ?? '',
      author: p?.meta?.author ?? '', copyright: p?.meta?.copyright ?? '', count: 1, firstAt: u.at, lastAt: u.at,
    });
  }
  return [...rows.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
}

const quote = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;

/** CSV for the church's yearly report; the BOM keeps Korean titles readable in Excel. */
export function ccliCsv(rows: CcliRow[]): string {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const lines = [['곡 제목', 'CCLI 번호', '작곡·저자', '저작권', '사용 횟수', '처음 사용', '마지막 사용'], ...rows.map((r) => [r.title, r.ccli, r.author, r.copyright, r.count, day(r.firstAt), day(r.lastAt)])];
  return `﻿${lines.map((l) => l.map(quote).join(',')).join('\r\n')}\r\n`;
}

/** Songs the report cannot fully describe. */
export function incompleteRows(rows: CcliRow[]): CcliRow[] {
  return rows.filter((r) => !r.ccli || !r.copyright);
}

export const hasCredit = (p: Presentation): boolean => !!(p.meta?.author || p.meta?.copyright || p.meta?.ccli);

/** Songs that have credit details but do not show them on screen yet. */
export function songsWithoutCreditLine(lib: Library): Presentation[] {
  return lib.presentations.filter((p) => isSong(p) && hasCredit(p) && !p.showCopyright);
}
