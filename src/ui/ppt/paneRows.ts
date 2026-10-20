// What the left 슬라이드 pane lists: every slide of the playlist being worked on (the 주일예배's
// Front, 찬양, 기도, 성경 말씀, 설교 … Back), one continuous list divided by the playlist's section
// headers, each presentation's title and the parts inside it — or the slides of a presentation
// picked from the library on its own.
import type { Library, Playlist, Presentation, Slide } from '../../domain/types';
import { sequence } from '../../domain/arrangement';

export interface PaneSlide {
  kind: 'slide';
  key: string;
  slide: Slide;
  presentation: Presentation;
  /** The playlist item the slide belongs to; null for a presentation shown on its own. */
  itemIndex: number | null;
  /** Position in the presentation's play order (what going live takes). */
  seq: number;
  /** 1-based, counted through the whole list. */
  number: number;
}

export type PaneRow =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'presentation'; key: string; title: string; presentationId: string; itemIndex: number | null }
  | { kind: 'part'; key: string; group: string; label: string }
  | PaneSlide
  /** After a presentation's last slide (where its "new slide" button goes). */
  | { kind: 'end'; key: string; presentationId: string; itemIndex: number | null };

export type PaneSource = { playlist: Playlist } | { presentation: Presentation } | null;

/**
 * The whole playlist when a playlist item is selected or the selected presentation is in the
 * active playlist; otherwise the selected presentation alone.
 */
export function paneSource(lib: Library, playlist: Playlist | undefined, playlistIndex: number | null, selectedId: string | null): PaneSource {
  const selected = selectedId ? lib.presentations.find((p) => p.id === selectedId) ?? null : null;
  const inPlaylist = !!playlist && (playlistIndex !== null || (!!selectedId && playlist.items.some((i) => i.kind !== 'header' && i.presentationId === selectedId)));
  if (playlist && inPlaylist) return { playlist };
  return selected ? { presentation: selected } : null;
}

export function slidePaneRows(lib: Library, source: PaneSource): PaneRow[] {
  const rows: PaneRow[] = [];
  let number = 0;
  const block = (p: Presentation, itemIndex: number | null, withTitle: boolean) => {
    const tag = itemIndex === null ? p.id : `${itemIndex}`;
    if (withTitle) rows.push({ kind: 'presentation', key: `p-${tag}`, title: p.title, presentationId: p.id, itemIndex });
    sequence(p).forEach(({ slide }, seq, all) => {
      if (seq === 0 || all[seq - 1].slide.group !== slide.group) {
        rows.push({ kind: 'part', key: `g-${tag}-${seq}`, group: slide.group, label: slide.label || slide.group });
      }
      rows.push({ kind: 'slide', key: `s-${tag}-${seq}`, slide, presentation: p, itemIndex, seq, number: ++number });
    });
    rows.push({ kind: 'end', key: `e-${tag}`, presentationId: p.id, itemIndex });
  };
  if (!source) return rows;
  if ('presentation' in source) {
    block(source.presentation, null, false);
    return rows;
  }
  source.playlist.items.forEach((item, i) => {
    if (item.kind === 'header') {
      rows.push({ kind: 'section', key: `h-${i}`, title: item.title });
      return;
    }
    const p = lib.presentations.find((x) => x.id === item.presentationId);
    if (p) block(p, i, true);
  });
  return rows;
}

/** Is this row the slide being edited? (`playlistIndex` tells apart two items that show the same presentation.) */
export const isSelectedRow = (r: PaneSlide, presentationId: string | undefined, slideId: string | undefined, playlistIndex: number | null) =>
  r.presentation.id === presentationId && r.slide.id === slideId && (r.itemIndex === null || playlistIndex === null || r.itemIndex === playlistIndex);

/**
 * The row being edited: the one last picked (`key`) while it still shows that slide — a 진행 can
 * play a slide twice — else the first row that does.
 */
export function selectedRow(rows: PaneRow[], key: string | null, presentationId: string | undefined, slideId: string | undefined, playlistIndex: number | null): PaneSlide | null {
  const slides = rows.filter((r): r is PaneSlide => r.kind === 'slide' && isSelectedRow(r, presentationId, slideId, playlistIndex));
  return slides.find((r) => r.key === key) ?? slides[0] ?? null;
}
