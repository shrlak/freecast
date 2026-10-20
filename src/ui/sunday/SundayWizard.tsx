import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { MediaMeta, Slide } from '../../domain/types';
import type { SongDraft } from '../../domain/sunday/songs';
import { parsePrayerTopics, planPrayerSlides } from '../../domain/sunday/prayer';
import { parseAnnouncements } from '../../domain/sunday/announcements';
import { mdy, mmdd, serviceDate, upcomingSunday } from '../../domain/sunday/notice';
import { buildService } from '../../domain/sunday/service';
import { parseRefs, formatRef } from '../../domain/bible/refs';
import { buildScripture, loadScriptureChunks } from '../../domain/bible/slides';
import { loadServiceTemplates } from '../../domain/templates/serviceTemplates';
import { exportPptx } from '../../domain/io/pptxExport';
import { qrDataUrl } from '../../domain/io/qr';
import { loadTranslations } from '../BibleModal';
import { filesToSlides } from '../importFiles';
import { SundaySongs, type CoverInfo } from './SundaySongs';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onClose: () => void;
  notify: (msg: string) => void;
}

interface Draft {
  date: string;
  notice: string;
  songs: SongDraft[];
  refs: string;
  sermonTitle: string;
  preacher: string;
  confession: string;
  sermonSlides: Slide[];
  prayer: string;
  announcements: string;
  extraSlides: Slide[];
}

const DRAFT_KEY = 'freecast.sundayDraft';
const STEPS = ['찬양', '성경 말씀', '설교', '기도제목', '광고', '추가 자료', '생성'] as const;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function emptyDraft(): Draft {
  return { date: iso(upcomingSunday(new Date())), notice: '', songs: [], refs: '', sermonTitle: '', preacher: '', confession: '', sermonSlides: [], prayer: '', announcements: '', extraSlides: [] };
}

function loadDraft(): Draft {
  try {
    return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') };
  } catch {
    return emptyDraft();
  }
}

/** 주일예배 builder: 7 steps that become this Sunday's playlist (and an optional MMDD.pptx). */
export function SundayWizard({ state, dispatch, onClose, notify }: Props) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(loadDraft);
  const [busy, setBusy] = useState<string | null>(null);
  const sermonRef = useRef<HTMLInputElement>(null);
  const extraRef = useRef<HTMLInputElement>(null);
  const { sunday } = state.library;
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const date = useMemo(() => new Date(`${d.date}T12:00:00`), [d.date]);
  const translations = loadTranslations();
  const chosen = sunday.translations.map((id) => translations.find((t) => t.id === id)).filter(Boolean) as typeof translations;

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem(DRAFT_KEY, JSON.stringify(d)), 300);
    return () => clearTimeout(t);
  }, [d]);

  const onCover = (c: CoverInfo) => setD((x) => ({
    ...x,
    date: c.date ? iso(serviceDate(c.date, new Date())) : x.date,
    refs: c.scripture || x.refs,
    sermonTitle: c.sermonTitle || x.sermonTitle,
    preacher: c.preacher || x.preacher,
    confession: c.confession || x.confession,
  }));

  const refs = parseRefs(d.refs);
  const topics = parsePrayerTopics(d.prayer);
  const prayerPlan = planPrayerSlides(topics);
  const ann = parseAnnouncements(d.announcements);
  const addMedia = (m: MediaMeta) => dispatch({ type: 'media/add', media: m });

  const importInto = async (files: FileList | null, key: 'sermonSlides' | 'extraSlides') => {
    if (!files?.length) return;
    setBusy('Importing…');
    try {
      const slides = await filesToSlides(Array.from(files), addMedia, setBusy);
      set({ [key]: [...d[key], ...slides] } as Partial<Draft>);
    } catch (e) {
      notify(`Import failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const build = async (thenExport: boolean) => {
    setBusy('Building the service…');
    try {
      const scriptureSlides = refs.refs.length && chosen.length
        ? await buildScripture(refs.refs, { translations: chosen, versesPerSlide: sunday.versesPerSlide, sermonTitle: d.sermonTitle, preacher: d.preacher })
        : [];
      // The church .pptx templates (same as the ppt program); the old look is the fallback offline.
      const templates = await loadServiceTemplates().catch(() => null);
      const chunks = templates && refs.refs.length && chosen.length
        ? await loadScriptureChunks(refs.refs, { translations: chosen, versesPerSlide: sunday.versesPerSlide })
        : [];
      const built = buildService(state.library, {
        date, songs: d.songs, scriptureSlides, sermonSlides: d.sermonSlides, prayerTopics: topics,
        announcements: ann, extraSlides: d.extraSlides, confessionSong: d.confession,
        templates, scripture: { refs: refs.refs, chunks, sermonTitle: d.sermonTitle, preacher: d.preacher },
      });
      dispatch({ type: 'presentation/createMany', presentations: built.presentations, playlist: built.playlist });
      if (d.prayer.trim()) dispatch({ type: 'sunday/settings', patch: { prayerText: d.prayer.trim() } });
      if (thenExport) {
        setBusy('Writing PPTX…');
        const lib = { ...state.library, presentations: [...state.library.presentations, ...built.presentations] };
        await exportPptx(lib, { playlist: built.playlist }, `${mmdd(date)}.pptx`);
      }
      notify(`Playlist “${built.playlist.name}” created${built.warnings.length ? ` — ${built.warnings.join('; ')}` : ''}`);
      onClose();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const slideList = (slides: Slide[], key: 'sermonSlides' | 'extraSlides') => (
    <ol className="file-list">
      {slides.map((s, i) => (
        <li key={s.id}>
          <span className="truncate">{i + 1}. {s.group}{s.title ? ` · ${s.title}` : ''}{s.text ? ` · ${s.text.slice(0, 40)}` : s.background ? ' · image' : ''}</span>
          <button className="mini-btn" disabled={i === 0} onClick={() => { const n = [...slides]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set({ [key]: n } as Partial<Draft>); }}>↑</button>
          <button className="mini-btn" disabled={i === slides.length - 1} onClick={() => { const n = [...slides]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; set({ [key]: n } as Partial<Draft>); }}>↓</button>
          <button className="mini-btn" onClick={() => set({ [key]: slides.filter((_, k) => k !== i) } as Partial<Draft>)}>✕</button>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="modal-backdrop">
      <div className="modal wizard" role="dialog" aria-label="주일예배 builder">
        <header className="modal-head">
          <h2>⛪ 주일예배 · {mmdd(date)}</h2>
          <div className="steps-nav">
            {STEPS.map((s, i) => <button key={s} className={i === step ? 'tab active' : 'tab'} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="wizard-body">
          {busy && <div className="card busy">⏳ {busy}</div>}
          {step === 0 && (
            <SundaySongs songs={d.songs} setSongs={(songs) => set({ songs })} notice={d.notice} setNotice={(notice) => set({ notice })}
              library={state.library.presentations} linesPerSlide={sunday.linesPerSlide} confessionSong={d.confession || sunday.confessionSong}
              setLinesPerSlide={(n) => dispatch({ type: 'sunday/settings', patch: { linesPerSlide: n } })} onCover={onCover} notify={notify} />
          )}
          {step === 1 && (
            <div className="stack narrow">
              <label className="stack">본문 (예: 롬5:1-11 · 로마서 5장 1-11절 · 행1:8-10 요3:16)
                <input className="title-input" value={d.refs} onChange={(e) => set({ refs: e.target.value })} />
              </label>
              <div className="muted small">{refs.refs.map((r) => formatRef(r)).join(' · ') || '—'}{refs.invalid.length ? <span className="warn"> · not recognised: {refs.invalid.join(', ')}</span> : null}</div>
              <label className="stack">설교 제목<input value={d.sermonTitle} onChange={(e) => set({ sermonTitle: e.target.value })} /></label>
              <label className="stack">설교자<input value={d.preacher} onChange={(e) => set({ preacher: e.target.value })} /></label>
              <div className="row gap-xs wrap">
                <span>번역본 (최대 2개):</span>
                {translations.map((t) => (
                  <button key={t.id} className={sunday.translations.includes(t.id) ? 'active' : ''}
                    onClick={() => dispatch({ type: 'sunday/settings', patch: { translations: sunday.translations.includes(t.id) ? sunday.translations.filter((x) => x !== t.id) : [...sunday.translations, t.id].slice(-2) } })}>{t.name}</button>
                ))}
              </div>
              <label className="field-inline">슬라이드당 절 수
                <select value={sunday.versesPerSlide} onChange={(e) => dispatch({ type: 'sunday/settings', patch: { versesPerSlide: Number(e.target.value) } })}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
              </label>
              <p className="hint">More translations (개역개정, ESV, NASB…) can be imported from the 📖 Bible window.</p>
            </div>
          )}
          {step === 2 && (
            <div className="stack narrow">
              <p>설교 PPT (.pptx) or PDF — its slides go right after the scripture. Skip if there is none.</p>
              <button className="primary" onClick={() => sermonRef.current?.click()}>Upload sermon file</button>
              <input ref={sermonRef} type="file" accept=".pptx,.pdf,image/*" multiple hidden onChange={(e) => { importInto(e.target.files, 'sermonSlides'); e.target.value = ''; }} />
              {slideList(d.sermonSlides, 'sermonSlides')}
            </div>
          )}
          {step === 3 && (
            <div className="two-col">
              <textarea rows={16} placeholder={'1. 회개와 마음의 정결\n- 지난 한 주간 …\n- …\n\n2. 예배를 위한 기도\n- …'} value={d.prayer} onChange={(e) => set({ prayer: e.target.value })} />
              <div className="stack">
                <strong>기도제목 {topics.length}개 → 기도 준비 슬라이드 {prayerPlan.length || 1}장</strong>
                {prayerPlan.map((g, i) => <div key={i} className="card small">{i + 1}장: {g.map((t) => t.title).join(' · ')}</div>)}
                <p className="hint">Numbered lines start a topic; lines under it become ● points. Up to 3 topics per slide, spread evenly. Empty = the template's placeholder slide.</p>
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="two-col">
              <textarea rows={16} placeholder={'1. <새가족 환영>\n오늘 처음 오신 분들을 환영합니다!\n\n2. <여름수련회 안내>\n- 장소: …\n- 신청: https://forms.gle/…'} value={d.announcements} onChange={(e) => set({ announcements: e.target.value })} />
              <div className="stack">
                <strong>광고 {ann.length}개</strong>
                {ann.map((a, i) => (
                  <div key={i} className="card small ann-preview">
                    <div><strong>{i + 1}. {a.title}</strong><div className="pre">{a.body.join('\n')}</div></div>
                    {a.links.map((l) => <img key={l} src={qrDataUrl(l)} alt={l} title={l} />)}
                  </div>
                ))}
                <p className="hint">“N. &lt;제목&gt;” starts an item and numbering is redone. Links are removed from the text and shown as QR codes.</p>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="stack narrow">
              <p>추가 자료: PDF (one slide per page), images, PPTX. They go after the Back/End slides, in this order.</p>
              <button onClick={() => extraRef.current?.click()}>＋ Add files</button>
              <input ref={extraRef} type="file" accept=".pdf,.pptx,image/*" multiple hidden onChange={(e) => { importInto(e.target.files, 'extraSlides'); e.target.value = ''; }} />
              {slideList(d.extraSlides, 'extraSlides')}
            </div>
          )}
          {step === 6 && (
            <div className="stack narrow">
              <label className="field-inline">예배 날짜 (일요일)<input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} /> <span className="muted">{mdy(date)} → playlist “{mmdd(date)} 주일예배”, file {mmdd(date)}.pptx</span></label>
              <label className="field-inline">공동체 고백 song<input value={d.confession} placeholder={sunday.confessionSong || 'title from the library'} onChange={(e) => set({ confession: e.target.value })} /></label>
              <div className="form-grid">
                {(['frontId', 'prayerId', 'backId'] as const).map((k) => (
                  <label key={k}>{k === 'frontId' ? 'Front slides' : k === 'prayerId' ? '기도 slide' : 'Back / End slides'}
                    <select value={sunday[k] ?? ''} onChange={(e) => dispatch({ type: 'sunday/settings', patch: { [k]: e.target.value || null } })}>
                      <option value="">None</option>
                      {state.library.presentations.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <ol className="order-preview">
                <li>Front (기도제목 {topics.length}개, 날짜 {mdy(date)})</li>
                <li>찬양: {d.songs.filter((s) => !s.postSermon).map((s) => s.title).join(', ') || '—'} → 기도</li>
                <li>성경 말씀: {refs.refs.map((r) => formatRef(r)).join(', ') || '—'} {d.sermonTitle && `· “${d.sermonTitle}”`}</li>
                <li>설교: {d.sermonSlides.length} slides → 기도</li>
                <li>설교 후 찬양: {d.songs.filter((s) => s.postSermon).map((s) => s.title).join(', ') || '—'}</li>
                <li>광고: {ann.length}</li>
                <li>Back / End (공동체 고백: {d.confession || sunday.confessionSong || '—'})</li>
                <li>추가 자료: {d.extraSlides.length} slides</li>
              </ol>
              <div className="row gap-s">
                <button className="primary" disabled={!!busy} onClick={() => build(false)}>Create playlist</button>
                <button disabled={!!busy} onClick={() => build(true)}>Create + download {mmdd(date)}.pptx</button>
                <button className="danger" onClick={() => confirm('Clear this week’s draft?') && setD(emptyDraft())}>Start over</button>
              </div>
            </div>
          )}
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">Draft saved automatically</span>
          <button disabled={step === 0} onClick={() => setStep(step - 1)}>이전</button>
          <button className="primary" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>다음</button>
        </footer>
      </div>
    </div>
  );
}
