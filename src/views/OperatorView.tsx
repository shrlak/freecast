import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createInitialState, reducer, type Action } from '../domain/reducer';
import { loadLibrary, normalizeLibrary, saveLibrary } from '../domain/persistence';
import { activePlaylist, findPres, upcomingCursors } from '../domain/live';
import { sequence } from '../domain/arrangement';
import { uid } from '../domain/lyrics';
import { presentationFromSongFile } from '../domain/io/songFormats';
import { exportBackup, importBackup } from '../domain/io/backup';
import { exportPptx } from '../domain/io/pptxExport';
import type { Presentation, Theme } from '../domain/types';
import { useLiveBroadcast, useRelay } from '../ui/hooks';
import { LibraryPanel } from '../ui/LibraryPanel';
import { SlideGrid } from '../ui/SlideGrid';
import { LivePanel } from '../ui/LivePanel';
import { MediaBin } from '../ui/MediaBin';
import { EditorModal } from '../ui/EditorModal';
import { ThemeModal } from '../ui/ThemeModal';
import { BibleModal } from '../ui/BibleModal';
import { AiModal } from '../ui/AiModal';
import { ScreensModal } from '../ui/ScreensModal';
import { SongLibraryModal } from '../ui/sunday/SongLibraryModal';
import { SundayWizard } from '../ui/sunday/SundayWizard';
import { RetreatWizard } from '../ui/RetreatWizard';
import { fetchOnlineSongs } from '../domain/online';
import { runExternal } from '../domain/effects';
import type { Macro, SlideAction } from '../domain/types';
import { AudioPlayer } from '../ui/AudioPanel';
import { filesToSlides } from '../ui/importFiles';
import type { RemoteInfo } from './RemoteView';
import { resolveBackground } from '../domain/autoBackground';
import { mediaIdsFor, resetSentMedia, sendMediaToRemotes } from '../domain/remoteMedia';
import { useMidi } from '../ui/midi';
import { ClassicToolbar } from '../ui/ClassicToolbar';
import { UpdateBanner } from '../ui/UpdateBanner';
import { useCloudSync } from '../ui/useCloudSync';
import { purgeMedia } from '../domain/cloud';
import { finishedServices } from '../domain/sunday/cleanup';
import { useServiceUploads } from '../ui/ppt/useServiceUploads';
import { AccountModal } from '../ui/AccountModal';
import { ConfessionSetting } from '../ui/sunday/ConfessionSetting';
import { AiUsage } from '../ui/AiUsage';
import { FeedbackModal } from '../ui/FeedbackModal';
import { PrayerSetting } from '../ui/sunday/PrayerSetting';
import { SongEditor } from '../ui/sunday/SongEditor';
import { reviewNote } from '../ui/ppt/contiReview';
import { PptLayout } from '../ui/ppt/PptLayout';
import { presentOutput } from '../ui/LivePanel';
import { desktop } from '../domain/desktop';
import type { Commands, Layout, Modal, PptViewMode } from '../ui/ppt/commands';


const KEYS: Record<string, Action> = {
  ArrowRight: { type: 'live/next' }, ArrowDown: { type: 'live/next' }, PageDown: { type: 'live/next' }, ' ': { type: 'live/next' },
  ArrowLeft: { type: 'live/prev' }, ArrowUp: { type: 'live/prev' }, PageUp: { type: 'live/prev' },
  F1: { type: 'live/clearAll' }, F2: { type: 'live/clearText' }, F3: { type: 'live/clearBackground' },
  F4: { type: 'prop/clearAll' }, F5: { type: 'live/message', message: null }, F6: { type: 'announce/stop' },
  b: { type: 'live/toggleBlack' }, B: { type: 'live/toggleBlack' }, l: { type: 'live/logo' }, L: { type: 'live/logo' },
};

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

function download(name: string, data: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function OperatorView() {
  const [state, dispatchRaw] = useReducer(reducer, undefined, () => createInitialState(loadLibrary()));
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [midiOn, setMidiOn] = useState(() => localStorage.getItem('freecast.midi') === '1');
  const [online, setOnline] = useState<{ status: 'loading' | 'ok' | 'error'; count: number; error?: string }>({ status: 'loading', count: 0 });
  const [layout, setLayoutState] = useState<Layout>(() => (localStorage.getItem('freecast.layout') as Layout) || 'ppt');
  const [view, setView] = useState<PptViewMode>('normal');
  const [slideId, setSlideId] = useState<string | null>(null);
  const setLayout = (l: Layout) => { localStorage.setItem('freecast.layout', l); setLayoutState(l); };
  const fileRef = useRef<HTMLInputElement>(null);
  const importKind = useRef<'library' | 'slides' | 'lyrics' | 'backup'>('slides');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Stamp time on actions that record usage or touch timers, keeping the reducer pure.
  // OBS steps in macros/schedules are side effects, so they run here rather than in the reducer.
  const macrosRef = useRef<Macro[]>([]);
  const schedulesRef = useRef<{ id: string; macroId: string }[]>([]);
  const dispatch = useMemo(() => (a: Action) => {
    if ((a.type === 'live/go' || a.type === 'live/next') && a.now == null) a = { ...a, now: Date.now() };
    const macroId = a.type === 'macro/run' ? a.id : a.type === 'schedule/ran' ? schedulesRef.current.find((x) => x.id === a.id)?.macroId : undefined;
    const macro = macroId ? macrosRef.current.find((m) => m.id === macroId) : undefined;
    macro?.steps.forEach(runExternal);
    dispatchRaw(a);
  }, []);
  const notifyRef = useRef<(m: string) => void>(() => undefined);
  const notify = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  useEffect(() => saveLibrary(state.library), [state.library]);
  const cloud = useCloudSync(state.library, dispatch, (m) => notifyRef.current(m));
  // Sunday 5 pm: the finished 주일예배 (playlist + its decks) is removed here and from the church server.
  useEffect(() => {
    const clear = () => {
      const done = finishedServices(latestLib.current, new Date());
      if (done.playlistIds.length || done.presentationIds.length) dispatch({ type: 'services/finish', ...done });
      void purgeMedia(done.mediaIds);
    };
    clear();
    const t = setInterval(clear, 60_000);
    return () => clearInterval(t);
  }, [dispatch]);
  const service = useServiceUploads(state.library, dispatch, (m) => notifyRef.current(m), state.activePlaylistId);
  // Files dragged onto the window go straight into this week's 주일예배.
  const [dragging, setDragging] = useState(false);
  const serviceRef = useRef(service);
  serviceRef.current = service;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) serviceRef.current.drop(files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  macrosRef.current = state.library.macros;
  schedulesRef.current = state.library.schedules;

  // OBS steps in slide actions (directly or through a macro) run when the slide goes live.
  useEffect(() => {
    const run = (acts: SlideAction[] | undefined) => acts?.forEach((a) => {
      if (a.type === 'runMacro') macrosRef.current.find((m) => m.id === a.macroId)?.steps.forEach(runExternal);
      else runExternal(a);
    });
    run(state.live.slide?.actions);
  }, [state.live.slide]);

  // The 찬양 라이브러리 comes from the online server every session (kept in memory, never saved).
  const loadOnline = () => {
    setOnline({ status: 'loading', count: 0 });
    fetchOnlineSongs(state.library.sunday.linesPerSlide)
      .then((list) => {
        dispatch({ type: 'online/songs', presentations: list });
        setOnline({ status: 'ok', count: list.length });
      })
      .catch((e: Error) => setOnline({ status: 'error', count: 0, error: e.message }));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadOnline, []);
  const latestLib = useRef(state.library);
  latestLib.current = state.library;

  const [remotes, setRemotes] = useState(0);
  const lastLibrary = useRef(state.library);
  const relay = useRelay({ type: 'hello', role: 'host' }, (m) => {
    if (m.type === 'remotes') setRemotes(Number(m.count) || 0);
    if (m.type !== 'command' || !m.command) return;
    let c = m.command as Action & { now?: number };
    // Slide show from the remote: same as the Start / End buttons on this computer.
    const show = (m.command as { type: string }).type;
    if (show === 'show/start') return startShowRef.current(false);
    if (show === 'show/end') return endShowRef.current();
    if (c.type === 'macro/run') {
      const id = c.id;
      const macro = latestLib.current.macros.find((x) => x.id === id) ?? latestLib.current.macros.find((x) => x.name.toLowerCase() === id.toLowerCase());
      if (!macro) return;
      c = { ...c, id: macro.id };
    }
    if (c.type === 'macro/run' || c.type === 'timer/op') dispatch({ ...c, now: Date.now() } as Action);
    else dispatch(c);
  });
  useLiveBroadcast(state.live, relay.send);

  // Share the selected presentation's slides with remotes.
  const selected = state.library.presentations.find((p) => p.id === state.selectedId) ?? null;

  const playlist = activePlaylist(state);
  useEffect(() => {
    let cancelled = false;
    const themes: Record<string, Theme> = {};
    const upcoming: RemoteInfo['upcoming'] = [];
    let lastPres = state.cursor?.presentationId ?? null;
    for (const c of upcomingCursors(state, state.selectedId)) {
      const p = findPres(state.library, c.presentationId);
      const slide = p ? sequence(p)[c.seq]?.slide : undefined;
      if (!p || !slide) continue;
      themes[p.themeId] ??= state.library.themes.find((t) => t.id === p.themeId) ?? state.library.themes[0];
      upcoming.push({
        presentationId: p.id, seq: c.seq, playlistIndex: c.playlistIndex ?? state.playlistIndex ?? null,
        title: p.title, heading: p.id !== lastPres, themeId: p.themeId, bgEffect: p.bgEffect ?? null,
        slide, background: resolveBackground(slide, p),
      });
      lastPres = p.id;
    }
    const info: RemoteInfo = { upcoming, themes };
    // One message may not exceed the relay's 4 MB limit: a very long show sends the nearest slides only.
    while (upcoming.length > 1 && JSON.stringify(info).length > 3_000_000) upcoming.length = Math.ceil(upcoming.length / 2);
    // The slide list goes out at once (right away when only the live slide moved, a moment after an edit);
    // pictures follow in the background, nearest slides first, and appear on the phone as they arrive.
    const ids = mediaIdsFor({ slides: upcoming.map((x) => x.slide), backgrounds: upcoming.map((x) => x.background) });
    const edited = lastLibrary.current !== state.library;
    lastLibrary.current = state.library;
    const t = setTimeout(() => {
      if (cancelled) return;
      relay.send({ type: 'info', info });
      if (remotes > 0) sendMediaToRemotes(ids);
    }, edited ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.library, state.selectedId, state.cursor, state.playlistIndex, state.activePlaylistId, relay.connected, remotes]);

  // A restarted server has forgotten the media it was given.
  useEffect(() => resetSentMedia(), [relay.connected]);

  // What is live (background, logo, props) goes to remotes too.
  useEffect(() => {
    if (remotes > 0) sendMediaToRemotes(mediaIdsFor({ live: state.live }));
  }, [remotes, state.live]);

  useMidi(midiOn, (a) => dispatch(a), state.library.macros);

  // Slide auto-advance ("go to next" timers) — restarts whenever a different slide goes live.
  const liveSlide = state.live.slide;
  useEffect(() => {
    if (!liveSlide?.autoAdvance) return;
    const t = setTimeout(() => dispatch({ type: 'live/next' }), liveSlide.autoAdvance * 1000);
    return () => clearTimeout(t);
  }, [liveSlide, dispatch]);

  // Announcements layer loops on its own: each slide's auto-advance, or 8 seconds.
  const ann = state.live.announcement;
  useEffect(() => {
    if (!ann) return;
    const t = setTimeout(() => dispatch({ type: 'announce/next' }), (ann.slide.autoAdvance ?? 8) * 1000);
    return () => clearTimeout(t);
  }, [ann, dispatch]);

  // Scheduled macros: checked every 15 s; each schedule fires once per day/time slot.
  const schedules = state.library.schedules;
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const slot = `${now.toISOString().slice(0, 10)} ${hhmm}`;
      for (const sc of schedules) {
        if (sc.enabled && sc.time === hhmm && sc.days.includes(now.getDay()) && sc.lastRun !== slot) {
          dispatch({ type: 'schedule/ran', id: sc.id, slot, now: Date.now() });
          notify(`Scheduled: ${sc.name}`);
        }
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !modal) {
        e.preventDefault();
        const box = document.getElementById('library-search') as HTMLInputElement | null;
        box?.focus();
        box?.select();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !isTyping(e.target)) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (modal || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (layoutRef.current === 'ppt') {
        if (e.key === 'F5') {
          e.preventDefault();
          startShowRef.current(e.shiftKey);
          return;
        }
        if (viewRef.current !== 'presenter' && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key)) return;
      }
      // Slide hotkeys of the selected presentation win over global keys.
      const sel = state.library.presentations.find((p) => p.id === state.selectedId);
      if (sel && e.key.length === 1) {
        const seq = sequence(sel).findIndex(({ slide }) => slide.hotkey === e.key.toLowerCase());
        if (seq >= 0) {
          e.preventDefault();
          dispatch({ type: 'live/go', presentationId: sel.id, seq });
          return;
        }
      }
      const action = KEYS[e.key];
      if (!action) return;
      e.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, dispatch, state.library.presentations, state.selectedId]);

  const startShow = (fromCurrent: boolean) => {
    const pres = state.library.presentations.find((x) => x.id === state.selectedId);
    if (!pres) return notify('먼저 프레젠테이션을 선택하세요');
    const seq = fromCurrent && slideId ? Math.max(0, sequence(pres).findIndex((x) => x.slide.id === slideId)) : 0;
    dispatch({ type: 'live/go', presentationId: pres.id, seq });
    setView('presenter');
    presentOutput();
  };
  const endShow = () => {
    dispatch({ type: 'live/clearAll' });
    setView('normal');
    desktop?.endShow();
  };
  const startShowRef = useRef(startShow);
  startShowRef.current = startShow;
  const endShowRef = useRef(endShow);
  endShowRef.current = endShow;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const viewRef = useRef(view);
  viewRef.current = view;

  const pickFiles = (kind: typeof importKind.current, accept: string) => {
    importKind.current = kind;
    if (fileRef.current) {
      fileRef.current.accept = accept;
      fileRef.current.click();
    }
  };

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const kind = importKind.current;
    try {
      if (kind === 'backup') {
        notify('Restoring backup…');
        const lib = await importBackup(files[0]);
        if (confirm('Replace your current library with this backup? (You can undo with ⌘Z.)')) dispatch({ type: 'library/replace', library: lib });
      } else if (kind === 'library') {
        const lib = normalizeLibrary(JSON.parse(await files[0].text()));
        if (!lib) throw new Error('Not a FreeCast library file');
        if (confirm('Replace your current library with this file? (You can undo with ⌘Z.)')) dispatch({ type: 'library/replace', library: lib });
      } else if (kind === 'lyrics') {
        const created: Presentation[] = [];
        for (const f of files) created.push(presentationFromSongFile(f.name, await f.text(), state.library.sunday.linesPerSlide));
        dispatch({ type: 'presentation/createMany', presentations: created });
        notify(`Imported ${created.length} song${created.length === 1 ? '' : 's'}`);
      } else {
        notify('Importing…');
        const approx: string[] = [];
        const toSlides = (list: File[]) => filesToSlides(list, (m) => dispatch({ type: 'media/add', media: m }), notify, (n) => approx.push(n));
        const isPptx = (f: File) => /\.pptx$/i.test(f.name);
        let total = 0;
        // Each PowerPoint file becomes its own presentation in a new 재생목록 named after the file.
        for (const f of files.filter(isPptx)) {
          const slides = await toSlides([f]);
          const title = f.name.replace(/\.[^.]+$/, '');
          const id = uid('p');
          dispatch({
            type: 'presentation/createMany',
            presentations: [{ id, title, slides, themeId: 'theme_classic', folder: 'Imported' }],
            playlist: { id: uid('pl'), name: title, items: [{ id: uid('pli'), presentationId: id }] },
          });
          total += slides.length;
        }
        const others = files.filter((f) => !isPptx(f));
        if (others.length) {
          const slides = await toSlides(others);
          const title = others.length === 1 ? others[0].name.replace(/\.[^.]+$/, '') : 'Imported slides';
          dispatch({ type: 'presentation/create', presentation: { id: uid('p'), title, slides, themeId: 'theme_classic', folder: 'Imported' } });
          total += slides.length;
        }
        notify(approx.length
          ? `Imported ${total} slides — ${approx.join(', ')} could not be drawn exactly (PowerPoint or LibreOffice is needed), so some text may differ`
          : `Imported ${total} slides`);
      }
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportUsage = () => {
    const rows = [['date', 'time', 'title', 'ccli'], ...state.library.usage.map((u) => {
      const d = new Date(u.at);
      return [d.toISOString().slice(0, 10), d.toTimeString().slice(0, 5), u.title, u.ccli ?? ''];
    })];
    download(`freecast-song-usage-${new Date().toISOString().slice(0, 10)}.csv`, rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  const exportPlaylistPptx = () => {
    if (!playlist) return notify('재생목록이 없습니다');
    exportPptx(state.library, { playlist }, playlist.name.replace(/\s*주일예배$/, '') || 'playlist').catch((e) => notify(String(e)));
  };
  const exportBackupZip = async () => {
    notify('Packing backup…');
    const blob = await exportBackup(state.library);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `freecast-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
  };
  const cmd: Commands = {
    open: setModal,
    notify,
    pickFiles,
    exportPlaylistPptx,
    exportBackup: exportBackupZip,
    exportLibrary: () => download(`freecast-library-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...state.library, presentations: state.library.presentations.filter((p) => !p.online) }, null, 2), 'application/json'),
    exportUsage,
    clearUsage: () => confirm('Clear the song usage log?') && dispatch({ type: 'usage/clear' }),
    reloadOnline: loadOnline,
    startShow,
    endShow,
    setView,
    setLayout,
    online,
    relayConnected: relay.connected,
    view,
    slideId,
    setSlideId,
    cloud: cloud.status,
    service,
  };
  notifyRef.current = notify;

  return (
    <div className={`app ${layout === 'ppt' ? 'app-ppt' : ''}`}>
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
      {layout === 'ppt' ? (
        <PptLayout state={state} dispatch={dispatch} cmd={cmd} />
      ) : (
        <>
          <ClassicToolbar state={state} dispatch={dispatch} cmd={cmd} hasSelection={!!selected} />
          <div className="workspace">
            <LibraryPanel state={state} dispatch={dispatch} onNew={() => setModal('new')} online={online} onReloadOnline={loadOnline} />
            <div className="center-col">
              <SlideGrid state={state} dispatch={dispatch} onEdit={() => selected && setModal('edit')} onThemes={() => setModal('themes')} notify={notify} />
              <MediaBin state={state} dispatch={dispatch} />
            </div>
            <LivePanel state={state} dispatch={dispatch} />
          </div>
        </>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <b>이번 주 주일예배에 바로 넣기</b>
            <span>콘티 PDF (이름에 “콘티”) → 찬양 · 가사 파일 → 찬양 · PPTX/PDF/그림 → 설교</span>
          </div>
        </div>
      )}
      <UpdateBanner />
      <AudioPlayer state={state} dispatch={dispatch} />
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}

      {(modal === 'edit' || modal === 'new') && (
        <EditorModal
          presentation={modal === 'new' ? null : selected}
          themes={state.library.themes}
          onClose={() => setModal(null)}
          onSave={(p, isNew) => {
            if (isNew) dispatch({ type: 'presentation/create', presentation: p });
            else dispatch({ type: 'presentation/update', id: p.id, patch: p });
          }}
        />
      )}
      {modal === 'themes' && (
        <ThemeModal themes={state.library.themes} initialId={selected?.themeId ?? state.library.themes[0].id}
          background={selected?.background ?? state.live.background} dispatch={dispatch} onClose={() => setModal(null)} />
      )}
      {modal === 'bible' && (
        <BibleModal service={service.scripture} onClose={() => setModal(null)} onCreate={(p, live) => {
          dispatch({ type: 'presentation/create', presentation: p });
          if (live) dispatch({ type: 'live/go', presentationId: p.id, seq: 0 });
          setModal(null);
        }} />
      )}
      {modal === 'ai' && <AiModal onClose={() => setModal(null)} onCreate={(p) => { dispatch({ type: 'presentation/create', presentation: p }); setModal(null); }} />}
      {modal === 'screens' && (
        <ScreensModal state={state} dispatch={dispatch} relayConnected={relay.connected} midi={midiOn}
          onMidi={(on) => { setMidiOn(on); localStorage.setItem('freecast.midi', on ? '1' : '0'); }} onClose={() => setModal(null)} />
      )}
      {modal === 'sunday' && <SundayWizard state={state} dispatch={dispatch} onClose={() => setModal(null)} notify={notify} service={service} />}
      {modal === 'retreat' && <RetreatWizard state={state} dispatch={dispatch} onClose={() => setModal(null)} notify={notify} />}
      {modal === 'account' && <AccountModal cloud={cloud} onClose={() => setModal(null)} />}
      {(modal === 'song' || modal === 'songNew') && (
        <SongEditor library={state.library} dispatch={dispatch} song={modal === 'song' ? selected ?? null : null} notify={notify} reloadOnline={loadOnline} onClose={() => setModal(null)} />
      )}
      {modal === 'songLibrary' && (
        <SongLibraryModal songs={state.library.presentations} dispatch={dispatch} reloadOnline={loadOnline} notify={notify} onClose={() => setModal(null)}
          onEdit={(id) => { dispatch({ type: 'select', id }); setModal('song'); }} />
      )}
      {service.review && (() => {
        const r = service.review;
        const song = r.reading.songs[r.index];
        return (
          <SongEditor key={song.id} library={state.library} dispatch={dispatch} song={null} notify={notify} reloadOnline={loadOnline} onClose={service.cancelReview}
            review={{ draft: song.draft, index: r.index, total: r.reading.songs.length, note: reviewNote(song, r), warn: song.needsReview, pageImages: song.pageImages,
              onAccept: service.answerReview, onSkip: () => service.answerReview(null), onCancel: () => confirm('콘티 확인을 그만둘까요? 아직 예배에 넣지 않은 곡은 버려집니다.') && service.cancelReview() }} />
        );
      })()}
      {modal === 'prayer' && <PrayerSetting library={state.library} dispatch={dispatch} notify={notify} onClose={() => setModal(null)} />}
      {modal === 'aiUsage' && <AiUsage onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackModal notify={notify} onClose={() => setModal(null)} />}
      {modal === 'confession' && <ConfessionSetting library={state.library} dispatch={dispatch} notify={notify} onClose={() => setModal(null)} />}

    </div>
  );
}
