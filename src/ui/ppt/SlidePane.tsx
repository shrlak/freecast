import { Fragment, useEffect, type Dispatch } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { Presentation, Slide } from '../../domain/types';
import { groupColor } from '../../domain/lyrics';
import { SlideCanvas } from '../SlideCanvas';
import type { PaneRow, PaneSlide } from './paneRows';
import { resolveBackground } from '../../domain/autoBackground';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  rows: PaneRow[];
  /** What the list is: the playlist's name, or the presentation's title. */
  heading: string;
  /** The presentation being edited, and the playlist item it is open from (null: on its own). */
  p: Presentation | null;
  item: number | null;
  selected: PaneSlide | null;
  pick: (r: PaneSlide) => void;
  /** Slide ids picked together with Shift/Ctrl-click (empty: just `selected`). */
  multi: string[];
  /** A click on a slide; Shift extends the picked range, Ctrl/⌘ toggles one. */
  onClickSlide: (r: PaneSlide, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onMenu: (x: number, y: number, slideId: string, seq: number) => void;
  onAdd: () => void;
}

export const paneSlideId = (r: PaneSlide) => `pslide-${r.key}`;

/**
 * The left 슬라이드 pane: every slide of the playlist (or of the presentation) in one list,
 * divided by the playlist's sections, the presentations' titles and the parts inside them.
 */
export function SlidePane({ state, dispatch, rows, heading, p, item, selected, pick, multi, onClickSlide, onMenu, onAdd }: Props) {
  const { library } = state;
  const liveSlideId = state.live.slide?.id;

  // Bring the selected slide into view when the selection moves to another presentation.
  useEffect(() => {
    if (selected) document.getElementById(paneSlideId(selected))?.scrollIntoView({ block: 'nearest' });
  }, [selected?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const goLive = (r: PaneSlide) => {
    pick(r);
    dispatch({ type: 'live/go', presentationId: r.presentation.id, seq: r.seq });
  };
  const firstSlide = (itemIndex: number | null, presentationId: string) =>
    rows.find((r): r is PaneSlide => r.kind === 'slide' && r.itemIndex === itemIndex && r.presentation.id === presentationId);

  const thumb = (r: PaneSlide, s: Slide) => {
    const pres = r.presentation;
    const theme = library.themes.find((t) => t.id === pres.themeId) || library.themes[0];
    const inMulti = multi.includes(r.key) && r.presentation.id === selected?.presentation.id && r.itemIndex === selected?.itemIndex;
    const sel = r.key === selected?.key || inMulti;
    return (
      <div id={paneSlideId(r)} tabIndex={0} aria-label={`슬라이드 ${r.number} · ${pres.title} · ${s.label || s.group}`} className={`ppt-thumb ${sel ? 'sel' : ''} ${inMulti ? 'multi' : ''} ${s.disabled ? 'hidden-slide' : ''}`}
        onClick={(e) => onClickSlide(r, e)}
        onDoubleClick={() => goLive(r)}
        onContextMenu={(e) => { e.preventDefault(); e.currentTarget.focus(); if (!inMulti) onClickSlide(r, { shiftKey: false, metaKey: false, ctrlKey: false }); onMenu(e.clientX, e.clientY, s.id, r.seq); }}>
        <span className="ppt-num">{r.number}{s.id === liveSlideId && <b className="ppt-live-dot" title="Live" />}</span>
        <div className="ppt-thumb-frame" style={{ borderColor: sel ? undefined : 'transparent' }}>
          <SlideCanvas slide={s} theme={theme} background={resolveBackground(s, pres)} bgEffect={pres.bgEffect} />
          <span className="ppt-group" style={{ background: groupColor(s.group) }}>{s.label || s.group}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="ppt-slides">
      <div className="ppt-pres-title truncate" title={heading}>{heading || '프레젠테이션을 선택하세요'}</div>
      {rows.map((r) => (
        <Fragment key={r.key}>
          {r.kind === 'section' && <div className="ppt-pane-section">{r.title}</div>}
          {r.kind === 'presentation' && (
            <div className={`ppt-pane-pres truncate ${r.presentationId === p?.id && r.itemIndex === item ? 'on' : ''}`} title={r.title}
              onClick={() => {
                const first = firstSlide(r.itemIndex, r.presentationId);
                if (first) pick(first);
                else if (r.itemIndex !== null) dispatch({ type: 'playlist/select', index: r.itemIndex });
              }}>{r.title}</div>
          )}
          {r.kind === 'part' && <div className="ppt-section" style={{ borderColor: groupColor(r.group) }}>{r.label}</div>}
          {r.kind === 'slide' && thumb(r, r.slide)}
          {r.kind === 'end' && r.presentationId === p?.id && r.itemIndex === item && (
            <button className="ppt-add" onClick={onAdd}>＋ 새 슬라이드</button>
          )}
        </Fragment>
      ))}
    </div>
  );
}
