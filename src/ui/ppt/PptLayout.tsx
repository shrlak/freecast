import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { Slide } from '../../domain/types';
import { blankSlide, uid } from '../../domain/lyrics';
import { putMedia } from '../../domain/media';
import { sequence } from '../../domain/arrangement';
import { activePlaylist } from '../../domain/live';
import { SlideFormat } from './SlideFormat';
import { CanvasEditor } from './CanvasEditor';
import { SlideDesigner } from '../SlideDesigner';
import { SlideGrid } from '../SlideGrid';
import { LibraryPanel } from '../LibraryPanel';
import { MediaBin } from '../MediaBin';
import { Ribbon } from './Ribbon';
import { PresenterView } from './PresenterView';
import type { Commands } from './commands';
import { SlidePane, paneSlideId } from './SlidePane';
import { paneSource, selectedRow, slidePaneRows, type PaneSlide } from './paneRows';
import { resolveBackground } from '../../domain/autoBackground';
import { NameDialog } from '../NameDialog';
import { AutoTextarea } from '../AutoTextarea';
import { PROTECTED_MESSAGE } from '../../domain/materialProtection';
import { AddToPlaylistMenu } from '../AddToPlaylist';

const LOCK_MSG = '🔒 화면에 표시 중이라 삭제·추가가 잠겨 있습니다 — 상태 표시줄의 🔒를 눌러 해제하세요';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  cmd: Commands;
}

/** PowerPoint-style window: ribbon, slide list, slide editor with notes, Format pane, status bar. */
export function PptLayout({ state, dispatch, cmd }: Props) {
  const [sectionRequest, setSectionRequest] = useState<{ presentationId: string; ids: string[]; initialValue: string } | null>(null);
  const [leftTab, setLeftTab] = useState<'slides' | 'library' | 'media'>('slides');
  const [designing, setDesigning] = useState(false);
  /** The object selected on the canvas (shown in the Format pane). */
  const [selEl, setSelEl] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string; seq: number } | null>(null);
  const [addMenu, setAddMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [findTick, setFindTick] = useState(0);
  // ⌘/Ctrl+F (or 홈 → 찾기) opens the 라이브러리 tab and its search box, wherever the left pane was.
  useEffect(() => {
    const onFind = () => { setLeftTab('library'); setFindTick((n) => n + 1); };
    window.addEventListener('freecast:find-library', onFind);
    return () => window.removeEventListener('freecast:find-library', onFind);
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const x = Math.max(8, Math.min(menu.x, window.innerWidth - rect.width - 8));
    const y = Math.max(8, Math.min(menu.y, window.innerHeight - rect.height - 8));
    if (x !== menu.x || y !== menu.y) setMenu({ ...menu, x, y });
  }, [menu]);
  const p = state.library.presentations.find((x) => x.id === state.selectedId) ?? null;
  const slide = (p && cmd.slideSeq != null ? sequence(p)[cmd.slideSeq]?.slide : null) ?? p?.slides.find((s) => s.id === cmd.slideId) ?? p?.slides[0] ?? null;
  const index = p && slide ? p.slides.indexOf(slide) : -1;
  const theme = (p && state.library.themes.find((t) => t.id === p.themeId)) || state.library.themes[0];
  const background = slide ? resolveBackground(slide, p) : null;

  // The 슬라이드 pane lists the whole playlist (or the presentation picked on its own).
  const playlist = activePlaylist(state);
  const source = paneSource(state.library, playlist, state.playlistIndex, state.selectedId);
  const rows = useMemo(() => slidePaneRows(state.library, source),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.library.presentations, state.library.playlists, state.activePlaylistId, state.playlistIndex, state.selectedId]);
  const paneSlides = useMemo(() => rows.filter((r): r is PaneSlide => r.kind === 'slide'), [rows]);
  const [paneKey, setPaneKey] = useState<string | null>(null);
  const selected = (cmd.slideSeq != null ? paneSlides.find((r) => r.presentation.id === p?.id && r.seq === cmd.slideSeq && (r.itemIndex === null || state.playlistIndex === null || r.itemIndex === state.playlistIndex)) : null)
    ?? selectedRow(rows, paneKey, p?.id, slide?.id, state.playlistIndex);
  /** The playlist item the edited presentation is open from (null: shown on its own). */
  const item = selected?.itemIndex ?? (source && 'playlist' in source
    ? state.playlistIndex ?? source.playlist.items.findIndex((i) => i.kind !== 'header' && i.presentationId === p?.id)
    : null);
  /** Slides picked together (Shift/Ctrl-click) in the edited presentation; empty = just the one being edited. */
  const [multi, setMulti] = useState<string[]>([]);
  useEffect(() => { setMulti([]); setSelEl(null); }, [p?.id, state.activePlaylistId, item]);
  const sameBlock = (r: PaneSlide) => !!selected && r.presentation.id === selected.presentation.id && r.itemIndex === selected.itemIndex;
  const onClickSlide = (r: PaneSlide, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    setSelEl(null);
    if (selected && sameBlock(r) && e.shiftKey) {
      const a = paneSlides.indexOf(selected), b = paneSlides.indexOf(r);
      setMulti(paneSlides.slice(Math.min(a, b), Math.max(a, b) + 1).filter(sameBlock).map((x) => x.key));
    } else if (selected && sameBlock(r) && (e.metaKey || e.ctrlKey)) {
      const cur = multi.length ? multi : [selected.key];
      setMulti(cur.includes(r.key) ? cur.filter((key) => key !== r.key) : [...cur, r.key]);
    } else {
      setMulti([]);
      pick(r);
    }
  };
  /** Each row identifies one occurrence, even when it shares a master slide ID. */
  const picked = (): PaneSlide[] => multi.length && selected ? paneSlides.filter((r) => sameBlock(r) && multi.includes(r.key)) : selected ? [selected] : [];
  const deleteSlides = (pickedRows: PaneSlide[]) => {
    if (!p || !pickedRows.length) return;
    if (p.protected) return cmd.notify(PROTECTED_MESSAGE);
    const seqs = pickedRows.map((r) => r.seq);
    dispatch({ type: 'slide/delete', presentationId: p.id, slideIds: pickedRows.map((r) => r.slide.id), seqs });
    const pages = sequence(p);
    const at = Math.min(...seqs);
    const left = pages.filter((_, i) => !seqs.includes(i));
    const next = Math.min(at, left.length - 1);
    cmd.setSlideId(left[next]?.slide.id ?? null, next >= 0 ? next : undefined);
    setMulti([]); setSelEl(null);
  };
  const editDispatch: Dispatch<Action> = (a) => dispatch(a.type === 'slide/update' && a.presentationId === p?.id && a.slideId === slide?.id ? { ...a, seq: selected?.seq, sequenceLength: p ? sequence(p).length : 0 } : a);
  const makeSection = (ids: string[]) => {
    if (!p || !ids.length) return;
    setSectionRequest({ presentationId: p.id, ids, initialValue: slide?.label || '새 섹션' });
  };
  const pick = (r: PaneSlide) => {
    setSelEl(null);
    if (r.itemIndex !== null && r.itemIndex !== state.playlistIndex) dispatch({ type: 'playlist/select', index: r.itemIndex });
    cmd.setSlideId(r.slide.id, r.seq);
    setPaneKey(r.key);
  };

  // Keep the selection valid when switching presentations.
  useEffect(() => {
    const page = p && cmd.slideSeq != null ? sequence(p)[cmd.slideSeq]?.slide : null;
    if (page && page.id !== cmd.slideId) cmd.setSlideId(page.id, cmd.slideSeq!);
    else if (p && !p.slides.some((s) => s.id === cmd.slideId)) cmd.setSlideId(p.slides[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.slides, cmd.slideSeq, cmd.slideId]);

  // Up/Down (and PageUp/PageDown) move through the slide pane's list while editing, like PowerPoint's
  // slide pane — on into the next presentation of the playlist.
  useEffect(() => {
    if (cmd.view === 'presenter') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.defaultPrevented || e.isComposing || !paneSlides.length || t.isContentEditable || t.closest('input,textarea,select') || document.querySelector('.modal-backdrop')) return;
      if (cmd.view === 'sorter' && t.closest('.slides-panel')) return;
      const locked = cmd.locked && !!state.live.slide;
      if ((e.key === 'Backspace' || e.key === 'Delete') && !selEl && selected) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        if (e.repeat) return;
        if (locked) cmd.notify(LOCK_MSG);
        else deleteSlides(picked());
        return;
      }
      // ⌘/Ctrl+D duplicates the slide, as in PowerPoint.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'd' && p && slide) {
        e.preventDefault();
        const copy = { ...slide, id: uid('s') };
        const slides = [...p.slides];
        slides.splice(p.slides.indexOf(slide) + 1, 0, copy);
        updateSlides(slides);
        cmd.setSlideId(copy.id);
        setMulti([]);
        return;
      }
      // Enter adds a blank white slide after the current one (Enter on a focused button still presses it).
      if (e.key === 'Enter' && !selEl && p && slide && !e.metaKey && !e.ctrlKey && !e.altKey && !t.closest('button,a,[role="button"]')) {
        e.preventDefault();
        if (p.protected) return cmd.notify(PROTECTED_MESSAGE);
        if (locked) return cmd.notify(LOCK_MSG);
        const n = blankSlide(slide.group);
        const slides = [...p.slides];
        slides.splice(p.slides.indexOf(slide) + 1, 0, n);
        updateSlides(slides);
        cmd.setSlideId(n.id);
        setMulti([]);
        return;
      }
      const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (!step) return;
      setMulti([]);
      e.preventDefault();
      const at = selected ? paneSlides.indexOf(selected) : -1;
      const next = paneSlides[Math.min(paneSlides.length - 1, Math.max(0, at + step))];
      if (next) {
        pick(next);
        document.getElementById(paneSlideId(next))?.scrollIntoView({ block: 'nearest' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Paste a screenshot or picture: it becomes a new slide after the current one.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (!p || cmd.view === 'presenter' || t.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('.modal-backdrop')) return;
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      if (p.protected) return cmd.notify(PROTECTED_MESSAGE);
      const id = uid('m');
      const at = slide ? p.slides.indexOf(slide) + 1 : p.slides.length;
      putMedia(id, file).then(() => {
        dispatch({ type: 'media/add', media: { id, name: file.name || '붙여넣은 그림', type: 'image' } });
        const n: Slide = { id: uid('s'), group: slide?.group ?? 'Image', text: '', background: { kind: 'media', mediaId: id, mediaType: 'image', fit: 'contain' } };
        const slides = [...p.slides];
        slides.splice(at, 0, n);
        updateSlides(slides);
        cmd.setSlideId(n.id);
        cmd.notify('붙여넣은 그림을 새 슬라이드로 추가했습니다');
      }).catch(() => cmd.notify('그림을 붙여넣지 못했습니다'));
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const updateSlides = (slides: Slide[]) => p && dispatch({ type: 'presentation/update', id: p.id, patch: { slides } });
  const slideMenu = (id: string, action: 'dup' | 'up' | 'down' | 'skip' | 'live') => {
    if (!p) return;
    const i = p.slides.findIndex((s) => s.id === id);
    const s = p.slides[i];
    const slides = [...p.slides];
    if (action === 'dup') slides.splice(i + 1, 0, { ...s, id: uid('s') });
    if (action === 'up' && i > 0) [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]];
    if (action === 'down' && i < slides.length - 1) [slides[i + 1], slides[i]] = [slides[i], slides[i + 1]];
    if (action === 'skip') slides[i] = { ...s, disabled: s.disabled ? undefined : true };
    if (action === 'live') {
      const seq = menu?.seq ?? selected?.seq ?? sequence(p).findIndex((x) => x.slide.id === s.id);
      if (seq >= 0) dispatch({ type: 'live/go', presentationId: p.id, seq });
    } else updateSlides(slides);
    setMenu(null);
  };

  if (cmd.view === 'presenter') {
    return (
      <div className="ppt">
        <Ribbon state={state} dispatch={dispatch} cmd={cmd} presentation={p} slide={slide} onDesign={() => setDesigning(true)} />
        <PresenterView state={state} dispatch={dispatch} cmd={cmd} />
        <StatusBar cmd={cmd} text={`발표자 보기 · ${state.live.title ?? '라이브 없음'}`} />
      </div>
    );
  }

  return (
    <div className="ppt" onClick={() => menu && setMenu(null)}>
      {sectionRequest && <NameDialog title="섹션 이름" initialValue={sectionRequest.initialValue} onClose={() => setSectionRequest(null)} onSave={(name) => {
        const target = state.library.presentations.find((p) => p.id === sectionRequest.presentationId);
        if (!target) return '프레젠테이션이 삭제되었습니다.';
        const slides = target.slides.map((s) => sectionRequest.ids.includes(s.id) ? { ...s, group: name, label: undefined } : s);
        dispatch({ type: 'presentation/update', id: target.id, patch: target.arrangementId ? { slides, arrangementId: null } : { slides } });
        setMulti([]);
      }} />}
      <Ribbon state={state} dispatch={dispatch} cmd={cmd} presentation={p} slide={slide} onDesign={() => setDesigning(true)} />
      <div className="ppt-body">
        <aside className="ppt-left">
          <div className="ppt-left-tabs">
            <button className={leftTab === 'slides' ? 'on' : ''} onClick={() => setLeftTab('slides')}>슬라이드</button>
            <button className={leftTab === 'library' ? 'on' : ''} onClick={() => setLeftTab('library')} title="라이브러리 · 재생목록">라이브러리</button>
            <button className={leftTab === 'media' ? 'on' : ''} onClick={() => setLeftTab('media')} title="배경 · 그림 · 영상 · 카메라">미디어</button>
          </div>
          {leftTab === 'library' ? (
            <LibraryPanel state={state} dispatch={dispatch} onNew={() => cmd.open('new')} notify={cmd.notify} focusSearch={findTick} online={cmd.online} onReloadOnline={cmd.reloadOnline} />
          ) : leftTab === 'media' ? (
            <MediaBin state={state} dispatch={dispatch} />
          ) : (
            <SlidePane state={state} dispatch={dispatch} rows={rows} p={p} item={item} selected={selected} pick={pick} multi={multi} onClickSlide={onClickSlide} notify={cmd.notify}
              playlistId={source && 'playlist' in source ? source.playlist.id : null}
              heading={source && 'playlist' in source ? source.playlist.name : p?.title ?? ''}
              onMenu={(x, y, id, seq) => setMenu({ x, y, id, seq })}
              onAdd={() => { if (!p) return; const n = { id: uid('s'), group: slide?.group ?? 'Slide', text: '' }; updateSlides([...p.slides, n]); cmd.setSlideId(n.id); }} />
          )}
        </aside>

        {cmd.view === 'sorter' ? (
          <div className="ppt-sorter">
            <SlideGrid state={state} dispatch={dispatch} locked={cmd.locked} onEdit={() => cmd.open('edit')} onEditSlide={(id, seq) => { cmd.setSlideId(id, seq); cmd.open('edit'); }} onThemes={() => cmd.open('themes')} notify={cmd.notify} />
          </div>
        ) : (
          <main className="ppt-center">
            <div className="ppt-stage">
              {p && slide ? (
                <div className="ppt-canvas">
                  <CanvasEditor key={`${p.id}:${selected?.key}`} readOnly={p.protected} slide={slide} theme={theme} background={background} bgEffect={p.bgEffect}
                    selectedId={selEl} onSelect={setSelEl}
                    onLockedDelete={cmd.locked && state.live.slide?.id === slide.id ? () => cmd.notify(LOCK_MSG) : undefined}
                    onChange={(patch) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, seq: selected?.seq, sequenceLength: sequence(p).length, patch })} />
                </div>
              ) : (
                <div className="ppt-empty">
                  <h2>무엇을 준비할까요?</h2>
                  <p>왼쪽 <b>라이브러리</b>에서 프레젠테이션을 고르거나 아래에서 시작하세요. 파일을 창에 끌어다 놓으면 이번 주 예배에 바로 들어갑니다.</p>
                  <div className="ppt-start">
                    <button className="ppt-start-card primary" onClick={() => cmd.service.open()}>
                      <span className="ppt-start-icon">⛪</span><b>이번 주 예배 열기</b><small>교회 템플릿으로 주일예배를 열고 콘티 · 가사 · 설교를 올립니다</small>
                    </button>
                    <button className="ppt-start-card" onClick={() => cmd.open('sunday')}>
                      <span className="ppt-start-icon">📝</span><b>주일예배 마법사</b><small>순서 · 찬양 · 광고를 단계별로 채웁니다</small>
                    </button>
                    <button className="ppt-start-card" onClick={() => cmd.open('retreat')}>
                      <span className="ppt-start-icon">⛺</span><b>수련회 만들기</b><small>주제에 어울리는 움직이는 배경까지</small>
                    </button>
                    <button className="ppt-start-card" onClick={() => cmd.open('new')}>
                      <span className="ppt-start-icon">📄</span><b>새 프레젠테이션</b><small>빈 슬라이드에서 시작합니다</small>
                    </button>
                  </div>
                </div>
              )}
            </div>
            {p && slide && (
              <AutoTextarea disabled={p.protected} className="ppt-notes" placeholder="슬라이드 노트를 추가하려면 클릭하세요 (무대 화면에 표시)"
                value={slide.notes ?? ''} onChange={(e) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, seq: selected?.seq, sequenceLength: sequence(p).length, patch: { notes: e.target.value || undefined } })} />
            )}
          </main>
        )}

        {cmd.view === 'normal' && p && slide && (
          <aside className="ppt-format">
            <div className="ppt-format-title">서식 · 슬라이드 {index + 1}</div>
            <SlideFormat state={state} dispatch={editDispatch} presentation={p} slide={slide} onDesign={() => setDesigning(true)} selectedId={selEl} onSelect={setSelEl} />
          </aside>
        )}
      </div>
      <StatusBar cmd={cmd} text={p ? `슬라이드 ${index + 1} / ${p.slides.length} · ${p.title}` : '프레젠테이션 없음'} />

      {menu && (
        <div ref={menuRef} className="ctx-menu" style={{ left: menu.x, top: menu.y, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => slideMenu(menu.id, 'live')}>▶ 지금 화면에 표시</button>
          <button onClick={() => { cmd.setSlideId(menu.id, menu.seq); setMenu(null); cmd.open('edit'); }}>✎ 이 슬라이드 편집</button>
          <button onClick={() => { const ids = picked(); setMenu(null); makeSection(ids.map((r) => r.slide.id)); }}>📑 섹션 만들기{multi.length > 1 ? ` (${multi.length}장)` : ''}</button>
          <button onClick={() => { setMenu(null); setDesigning(true); }}>✏️ 개체 편집</button>
          <button onClick={() => slideMenu(menu.id, 'dup')}>⧉ 슬라이드 복제</button>
          <button onClick={() => slideMenu(menu.id, 'up')}>↑ 위로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'down')}>↓ 아래로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'skip')}>⏭ 슬라이드 숨기기/해제</button>
          {p && <button onClick={() => { setAddMenu({ id: p.id, x: menu.x, y: menu.y }); setMenu(null); }}>📋 “{p.title}” 재생목록에 넣기…</button>}
          <button className="danger" onClick={() => {
            const row = paneSlides.find((r) => r.presentation.id === p?.id && r.seq === menu.seq && r.itemIndex === selected?.itemIndex);
            setMenu(null); if (row) deleteSlides([row]);
          }}>🗑 이 슬라이드만 삭제</button>
          {multi.length > 1 && <button className="danger" onClick={() => { const chosen = picked(); setMenu(null); deleteSlides(chosen); }}>🗑 선택한 슬라이드 삭제 ({multi.length}장)</button>}
        </div>
      )}
      {addMenu && <AddToPlaylistMenu state={state} dispatch={dispatch} presentationId={addMenu.id} x={addMenu.x} y={addMenu.y} notify={cmd.notify} onClose={() => setAddMenu(null)} />}
      {designing && p && slide && (
        <SlideDesigner readOnly={p.protected} slide={slide} theme={theme} background={background} media={state.library.media}
          addMedia={(m) => dispatch({ type: 'media/add', media: m })}
          onClose={() => setDesigning(false)}
          onSave={(elements, text) => {
            dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, seq: selected?.seq, sequenceLength: sequence(p).length, patch: { elements: elements.length ? elements : undefined, text } });
          }} />
      )}
    </div>
  );
}

function StatusBar({ cmd, text }: { cmd: Commands; text: string }) {
  return (
    <footer className="ppt-status">
      <span className="truncate">{text}</span>
      <span className="ppt-team" title="KCCP 빛주사랑 대학청년부 미디어팀"><img src="/media-team-logo.png" alt="" />KCCP 미디어팀</span>
      <button className={`ppt-cloud ppt-lock ${cmd.locked ? 'on' : ''}`} onClick={() => cmd.setLocked(!cmd.locked)}
        title={cmd.locked ? '잠금 켜짐: 화면에 표시 중에는 Enter·Delete로 슬라이드를 추가/삭제하지 않습니다 (클릭하면 해제)' : '잠금 꺼짐 (클릭하면 켜기)'}>{cmd.locked ? '🔒 잠금' : '🔓 잠금 해제됨'}</button>
      <span className="ppt-views" role="group" aria-label="보기">
        <button className={cmd.view === 'normal' ? 'on' : ''} title="기본 — 슬라이드 하나씩 편집" onClick={() => cmd.setView('normal')}>▭ 기본</button>
        <button className={cmd.view === 'sorter' ? 'on' : ''} title="여러 슬라이드 — 한눈에 보고 순서 바꾸기" onClick={() => cmd.setView('sorter')}>▦ 여러 슬라이드</button>
        <button className={cmd.view === 'presenter' ? 'on' : ''} title="발표자 보기 — 지금 · 다음 슬라이드와 노트" onClick={() => cmd.setView('presenter')}>🧑‍🏫 발표자</button>
      </span>
    </footer>
  );
}
