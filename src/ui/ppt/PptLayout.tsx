import { useEffect, useMemo, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { Slide } from '../../domain/types';
import { uid } from '../../domain/lyrics';
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
      const step = { ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1 }[e.key];
      if (!step) return;
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
            <SlidePane state={state} dispatch={dispatch} rows={rows} p={p} item={item} selected={selected} pick={pick}
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
          <button onClick={() => { setMenu(null); setDesigning(true); }}>✏️ 개체 편집</button>
          <button onClick={() => slideMenu(menu.id, 'dup')}>⧉ 슬라이드 복제</button>
          <button onClick={() => slideMenu(menu.id, 'up')}>↑ 위로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'down')}>↓ 아래로 이동</button>
          <button onClick={() => slideMenu(menu.id, 'skip')}>⏭ 슬라이드 숨기기/해제</button>
          <button className="danger" onClick={() => slideMenu(menu.id, 'del')}>🗑 슬라이드 삭제</button>
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
