import { useEffect, useMemo, useState, type Dispatch } from 'react';
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
import { Ribbon } from './Ribbon';
import { PresenterView } from './PresenterView';
import type { Commands } from './commands';
import { SlidePane, paneSlideId } from './SlidePane';
import { paneSource, selectedRow, slidePaneRows, type PaneSlide } from './paneRows';
import { resolveBackground } from '../../domain/autoBackground';
import { AutoTextarea } from '../AutoTextarea';

const LOCK_MSG = '🔒 화면에 표시 중이라 삭제·추가가 잠겨 있습니다 — 상태 표시줄의 🔒를 눌러 해제하세요';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  cmd: Commands;
}

/** PowerPoint-style window: ribbon, slide list, slide editor with notes, Format pane, status bar. */
export function PptLayout({ state, dispatch, cmd }: Props) {
  const [leftTab, setLeftTab] = useState<'slides' | 'library'>('slides');
  const [designing, setDesigning] = useState(false);
  /** The object selected on the canvas (shown in the Format pane). */
  const [selEl, setSelEl] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const p = state.library.presentations.find((x) => x.id === state.selectedId) ?? null;
  const slide = p?.slides.find((s) => s.id === cmd.slideId) ?? p?.slides[0] ?? null;
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
  const selected = selectedRow(rows, paneKey, p?.id, slide?.id, state.playlistIndex);
  /** The playlist item the edited presentation is open from (null: shown on its own). */
  const item = selected?.itemIndex ?? (source && 'playlist' in source
    ? state.playlistIndex ?? source.playlist.items.findIndex((i) => i.kind !== 'header' && i.presentationId === p?.id)
    : null);
  /** Slides picked together (Shift/Ctrl-click) in the edited presentation; empty = just the one being edited. */
  const [multi, setMulti] = useState<string[]>([]);
  const sameBlock = (r: PaneSlide) => !!selected && r.presentation.id === selected.presentation.id && r.itemIndex === selected.itemIndex;
  const onClickSlide = (r: PaneSlide, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (selected && sameBlock(r) && e.shiftKey) {
      const a = paneSlides.indexOf(selected), b = paneSlides.indexOf(r);
      setMulti(paneSlides.slice(Math.min(a, b), Math.max(a, b) + 1).filter(sameBlock).map((x) => x.slide.id));
    } else if (selected && sameBlock(r) && (e.metaKey || e.ctrlKey)) {
      const cur = multi.length ? multi : [selected.slide.id];
      setMulti(cur.includes(r.slide.id) ? cur.filter((id) => id !== r.slide.id) : [...cur, r.slide.id]);
    } else {
      setMulti([]);
      pick(r);
    }
  };
  /** The slides an action (delete, section) applies to, in list order. */
  const picked = (): string[] => {
    const ids = multi.length && selected ? multi : slide ? [slide.id] : [];
    return p ? p.slides.filter((s) => ids.includes(s.id)).map((s) => s.id) : [];
  };
  const deleteSlides = (ids: string[]) => {
    if (!p || !ids.length) return;
    const left = p.slides.filter((s) => !ids.includes(s.id));
    const at = Math.min(Math.max(0, p.slides.findIndex((s) => ids.includes(s.id))), left.length - 1);
    updateSlides(left);
    cmd.setSlideId(left[at]?.id ?? null);
    setMulti([]);
  };
  const makeSection = (ids: string[]) => {
    if (!p || !ids.length) return;
    const name = prompt('섹션 이름', slide?.label || '새 섹션')?.trim();
    if (!name) return;
    const slides = p.slides.map((s) => (ids.includes(s.id) ? { ...s, group: name, label: undefined } : s));
    // A song's 진행 plays groups by name; a renamed group would drop out of it, so play the slides as listed.
    dispatch({ type: 'presentation/update', id: p.id, patch: p.arrangementId ? { slides, arrangementId: null } : { slides } });
    setMulti([]);
  };
  const pick = (r: PaneSlide) => {
    if (r.itemIndex !== null && r.itemIndex !== state.playlistIndex) dispatch({ type: 'playlist/select', index: r.itemIndex });
    cmd.setSlideId(r.slide.id);
    setPaneKey(r.key);
  };

  // Keep the selection valid when switching presentations.
  useEffect(() => {
    if (p && !p.slides.some((s) => s.id === cmd.slideId)) cmd.setSlideId(p.slides[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, p?.slides.length]);

  // Up/Down (and PageUp/PageDown) move through the slide pane's list while editing, like PowerPoint's
  // slide pane — on into the next presentation of the playlist.
  useEffect(() => {
    if (cmd.view === 'presenter') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!paneSlides.length || t.matches('input,textarea,select,[contenteditable="true"]') || document.querySelector('.modal-backdrop')) return;
      const locked = cmd.locked && !!state.live.slide;
      if ((e.key === 'Backspace' || e.key === 'Delete') && !selEl && selected) {
        e.preventDefault();
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
  const slideMenu = (id: string, action: 'dup' | 'del' | 'up' | 'down' | 'skip' | 'live') => {
    if (!p) return;
    const i = p.slides.findIndex((s) => s.id === id);
    const s = p.slides[i];
    const slides = [...p.slides];
    if (action === 'dup') slides.splice(i + 1, 0, { ...s, id: uid('s') });
    if (action === 'del') slides.splice(i, 1);
    if (action === 'up' && i > 0) [slides[i - 1], slides[i]] = [slides[i], slides[i - 1]];
    if (action === 'down' && i < slides.length - 1) [slides[i + 1], slides[i]] = [slides[i], slides[i + 1]];
    if (action === 'skip') slides[i] = { ...s, disabled: s.disabled ? undefined : true };
    if (action === 'live') {
      const seq = sequence(p).findIndex((x) => x.slide.id === s.id);
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
      <Ribbon state={state} dispatch={dispatch} cmd={cmd} presentation={p} slide={slide} onDesign={() => setDesigning(true)} />
      <div className="ppt-body">
        <aside className="ppt-left">
          <div className="ppt-left-tabs">
            <button className={leftTab === 'slides' ? 'on' : ''} onClick={() => setLeftTab('slides')}>슬라이드</button>
            <button className={leftTab === 'library' ? 'on' : ''} onClick={() => setLeftTab('library')}>라이브러리 · 재생목록</button>
          </div>
          {leftTab === 'library' ? (
            <LibraryPanel state={state} dispatch={dispatch} onNew={() => cmd.open('new')} online={cmd.online} onReloadOnline={cmd.reloadOnline} />
          ) : (
            <SlidePane state={state} dispatch={dispatch} rows={rows} p={p} item={item} selected={selected} pick={pick} multi={multi} onClickSlide={onClickSlide}
              heading={source && 'playlist' in source ? source.playlist.name : p?.title ?? ''}
              onMenu={(x, y, id) => setMenu({ x, y, id })}
              onAdd={() => { if (!p) return; const n = { id: uid('s'), group: slide?.group ?? 'Slide', text: '' }; updateSlides([...p.slides, n]); cmd.setSlideId(n.id); }} />
          )}
        </aside>

        {cmd.view === 'sorter' ? (
          <div className="ppt-sorter">
            <SlideGrid state={state} dispatch={dispatch} onEdit={() => cmd.open('edit')} onThemes={() => cmd.open('themes')} notify={cmd.notify} />
          </div>
        ) : (
          <main className="ppt-center">
            <div className="ppt-stage">
              {p && slide ? (
                <div className="ppt-canvas">
                  <CanvasEditor slide={slide} theme={theme} background={background} bgEffect={p.bgEffect}
                    selectedId={selEl} onSelect={setSelEl}
                    onLockedDelete={cmd.locked && state.live.slide?.id === slide.id ? () => cmd.notify(LOCK_MSG) : undefined}
                    onChange={(patch) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, patch })} />
                </div>
              ) : (
                <div className="ppt-empty">
                  <p>왼쪽 <b>라이브러리</b>에서 프레젠테이션을 고르거나, <b>예배</b> 탭에서 주일예배·수련회를 만드세요.</p>
                  <div className="row gap-s">
                    <button className="primary" onClick={() => cmd.open('sunday')}>⛪ 주일예배 만들기</button>
                    <button onClick={() => cmd.open('retreat')}>⛺ 수련회 만들기</button>
                    <button onClick={() => cmd.open('new')}>📄 새 프레젠테이션</button>
                  </div>
                </div>
              )}
            </div>
            {p && slide && (
              <AutoTextarea className="ppt-notes" placeholder="슬라이드 노트를 추가하려면 클릭하세요 (무대 화면에 표시)"
                value={slide.notes ?? ''} onChange={(e) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, patch: { notes: e.target.value || undefined } })} />
            )}
          </main>
        )}

        {cmd.view === 'normal' && p && slide && (
          <aside className="ppt-format">
            <div className="ppt-format-title">서식 · 슬라이드 {index + 1}</div>
            <SlideFormat state={state} dispatch={dispatch} presentation={p} slide={slide} onDesign={() => setDesigning(true)} selectedId={selEl} onSelect={setSelEl} />
          </aside>
        )}
      </div>
      <StatusBar cmd={cmd} text={p ? `슬라이드 ${index + 1} / ${p.slides.length} · ${p.title}` : '프레젠테이션 없음'} />

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => slideMenu(menu.id, 'live')}>▶ 지금 화면에 표시</button>
          <button onClick={() => { const ids = picked(); setMenu(null); makeSection(ids); }}>📑 섹션 만들기{multi.length > 1 ? ` (${multi.length}장)` : ''}</button>
          <button onClick={() => { setMenu(null); setDesigning(true); }}>✏️ 개체 편집</button>
          <button onClick={() => slideMenu(menu.id, 'dup')}>⧉ 슬라이드 복제</button>
          <button onClick={() => slideMenu(menu.id, 'up')}>↑ 위로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'down')}>↓ 아래로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'skip')}>⏭ 슬라이드 숨기기/해제</button>
          <button className="danger" onClick={() => { const ids = picked(); setMenu(null); deleteSlides(ids); }}>🗑 슬라이드 삭제{multi.length > 1 ? ` (${multi.length}장)` : ''}</button>
        </div>
      )}
      {designing && p && slide && (
        <SlideDesigner slide={slide} theme={theme} background={background} media={state.library.media}
          addMedia={(m) => dispatch({ type: 'media/add', media: m })}
          onClose={() => setDesigning(false)}
          onSave={(elements, text) => {
            dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, patch: { elements: elements.length ? elements : undefined, text } });
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
      <span className={`ppt-online ${cmd.online.status}`}>☁ {cmd.online.status === 'ok' ? `온라인 찬양 ${cmd.online.count}곡` : cmd.online.status === 'loading' ? '불러오는 중…' : '오프라인'}</span>
      <button className="ppt-cloud" onClick={() => cmd.open('account')} title={cmd.cloud.message ?? ''}>
        {cmd.cloud.session ? `☁ ${cmd.cloud.session.username} · ${cmd.cloud.state === 'syncing' ? '동기화 중' : cmd.cloud.state === 'error' ? '동기화 오류' : '동기화됨'}` : '☁ 로그인 안 됨 (이 컴퓨터에만 저장)'}
      </button>
      <button className={`ppt-cloud ppt-lock ${cmd.locked ? 'on' : ''}`} onClick={() => cmd.setLocked(!cmd.locked)}
        title={cmd.locked ? '잠금 켜짐: 화면에 표시 중에는 Enter·Delete로 슬라이드를 추가/삭제하지 않습니다 (클릭하면 해제)' : '잠금 꺼짐 (클릭하면 켜기)'}>{cmd.locked ? '🔒 잠금' : '🔓 잠금 해제됨'}</button>
      <button className="ppt-cloud" onClick={() => cmd.open('feedback')} title="고칠 점·원하는 기능을 개발자에게 보내기">💬 피드백</button>
      <span title={cmd.relayConnected ? '리모컨 연결됨' : '리모컨 오프라인'}><span className={`dot ${cmd.relayConnected ? 'on' : ''}`} /></span>
      <span className="ppt-views">
        <button className={cmd.view === 'normal' ? 'on' : ''} title="기본" onClick={() => cmd.setView('normal')}>▭</button>
        <button className={cmd.view === 'sorter' ? 'on' : ''} title="여러 슬라이드" onClick={() => cmd.setView('sorter')}>▦</button>
        <button className={cmd.view === 'presenter' ? 'on' : ''} title="발표자 보기" onClick={() => cmd.setView('presenter')}>🧑‍🏫</button>
        <button title="슬라이드 쇼 (F5)" onClick={() => cmd.startShow(true)}>▶</button>
      </span>
    </footer>
  );
}
