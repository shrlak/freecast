import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import type { Action } from '../../domain/reducer';
import type { Library, Presentation, Slide, Theme } from '../../domain/types';
import { renderPdf, blobToBase64 } from '../../domain/io/pdf';
import { ai } from '../../domain/ai';
import { putMedia } from '../../domain/media';
import { presentationFromSongFile } from '../../domain/io/songFormats';
import { findSong, songToPresentation, withProgression, type SongDraft } from '../../domain/sunday/songs';
import { CHURCH_BACKGROUNDS } from '../../domain/defaults';
import { mmdd, serviceDate, upcomingSunday } from '../../domain/sunday/notice';
import { parseRefs } from '../../domain/bible/refs';
import { loadScriptureChunks } from '../../domain/bible/slides';
import { uid } from '../../domain/lyrics';
import { loadServiceTemplates, pptxSlides, type ServiceTemplates } from '../../domain/templates/serviceTemplates';
import { templateDeckUpdates } from '../../domain/templates/register';
import { scriptureSlides, sermonTitleSlide, songInTemplate, templateLyricsTheme } from '../../domain/templates/fill';
import { createLiveService, findLiveService, insertIntoSection, liveFolder, SECTION, sectionPresentations, type SectionTitle } from '../../domain/sunday/liveDeck';
import { loadTranslations } from '../BibleModal';
import { filesToSlides } from '../importFiles';

/** The theme with a fingerprint of its own settings, so a later edit to it can be recognised. */
function themeWithFingerprint(theme: Theme): Theme {
  const { generated: _, ...rest } = theme;
  const text = JSON.stringify(rest);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return { ...rest, generated: (h >>> 0).toString(36) };
}

export interface ServiceUploads {
  templates: 'loading' | 'ok' | 'error';
  busy: string | null;
  /** Open (or create) this week's 주일예배 playlist. */
  open: () => Promise<void>;
  conti: (file: File) => Promise<void>;
  lyrics: (files: File[]) => Promise<void>;
  sermon: (files: File[]) => Promise<void>;
  /** Files dropped on the window: 콘티 PDF → 찬양, lyric files → 찬양, PPTX/PDF/images → 설교. */
  drop: (files: File[]) => void;
}

const LYRIC_FILE = /\.(txt|md|pro6|cho|chopro|chordpro|crd|xml)$/i;
const CONTI_NAME = /콘티|conti/i;
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Uploads go straight into this week's 주일예배 playlist (built from the church templates the
 * ppt program uses), section by section and slide by slide as they are read — the playlist can
 * be open, or live on screen, the whole time.
 */
export function useServiceUploads(library: Library, dispatch: Dispatch<Action>, notify: (m: string) => void): ServiceUploads {
  const [templates, setTemplates] = useState<ServiceUploads['templates']>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const lib = useRef(library);
  lib.current = library;
  const tpl = useRef<ServiceTemplates | null>(null);

  useEffect(() => {
    loadServiceTemplates()
      .then((t) => {
        tpl.current = t;
        // The lyrics theme follows the church template — unless the operator has changed it since.
        const theme = themeWithFingerprint(templateLyricsTheme(t));
        const have = lib.current.themes.find((x) => x.id === theme.id);
        // (A theme from before fingerprints was written by FreeCast alone, so it counts as untouched.)
        const untouched = !have || !have.generated || have.generated === themeWithFingerprint(have).generated;
        if (untouched && have?.generated !== theme.generated) dispatch({ type: 'theme/upsert', theme });
        setTemplates('ok');
      })
      .catch(() => setTemplates('error'));
  }, [dispatch]);

  // The library's 주일예배 Front / Back decks follow the church templates and this season's 고백송
  // (re-checked as songs load from the server and when the 고백송 setting changes).
  // Re-checked every 30 minutes too, so the Front deck moves on to the next Sunday's date by itself.
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (templates !== 'ok' || !tpl.current) return;
    for (const u of templateDeckUpdates(library, tpl.current, new Date(clock))) dispatch({ type: 'presentation/update', id: u.id, patch: u.patch });
  }, [templates, library, dispatch, clock]);

  const templatesNow = async () => tpl.current ?? (await loadServiceTemplates().catch(() => null));
  const playlist = (id: string) => lib.current.playlists.find((p) => p.id === id);

  /** This week's playlist id, created from the templates when it does not exist yet. */
  const ensure = useCallback(async (date = upcomingSunday(new Date())): Promise<string> => {
    const existing = findLiveService(lib.current, date);
    if (existing) {
      dispatch({ type: 'playlist/set', playlist: existing, activate: true });
      return existing.id;
    }
    const built = createLiveService(lib.current, await templatesNow(), date);
    dispatch({ type: 'presentation/createMany', presentations: built.presentations, playlist: built.playlist });
    await tick();
    return built.playlist.id;
  }, [dispatch]);

  const place = async (id: string, section: SectionTitle, ids: string[], replace = false) => {
    await tick();
    const pl = playlist(id);
    if (pl) dispatch({ type: 'playlist/set', playlist: insertIntoSection(pl, section, ids, { replace }) });
  };

  /** Select a presentation of the service so its slides show (and fill in) in the slide pane. */
  const show = async (id: string, presentationId: string | undefined) => {
    await tick();
    const index = playlist(id)?.items.findIndex((i) => i.kind !== 'header' && i.presentationId === presentationId) ?? -1;
    if (index >= 0) dispatch({ type: 'playlist/select', index });
  };

  const add = async (p: Presentation) => {
    dispatch({ type: 'presentation/createMany', presentations: [p] });
    await tick();
  };

  const run = async (label: string, job: () => Promise<string | void>) => {
    setBusy(label);
    try {
      const done = await job();
      setBusy(done ? `✓ ${done}` : null);
      if (done) setTimeout(() => setBusy((b) => (b === `✓ ${done}` ? null : b)), 5000);
    } catch (e) {
      setBusy(null);
      notify(`${label.replace(/…$/, '')} 실패: ${(e as Error).message}`);
    }
  };

  const songFor = (draft: SongDraft, folder: string, t: ServiceTemplates | null): { pres: Presentation; isNew: boolean } => {
    const existing = findSong(lib.current.presentations, draft.title);
    const progression = draft.progression?.length ? draft.progression : undefined;
    let base: Presentation;
    if (existing && (!draft.sections.length || existing.online)) base = progression ? withProgression(existing, progression) : existing;
    else base = songToPresentation({ ...draft, progression }, { themeId: 'theme_sunday', linesPerSlide: lib.current.sunday.linesPerSlide, folder });
    if (t) return { pres: songInTemplate(base, t, folder), isNew: true };
    if (base === existing) return { pres: existing, isNew: false };
    return { pres: { ...base, id: base.id === existing?.id ? uid('p') : base.id, online: undefined, folder, background: CHURCH_BACKGROUNDS.watercolor }, isNew: true };
  };

  /** Sermon title + 성경 말씀 from the 콘티's service info. */
  const serviceInfo = async (id: string, info: { scripture: string; sermonTitle: string; preacher: string }, t: ServiceTemplates | null) => {
    if (!t || (!info.scripture.trim() && !info.sermonTitle.trim())) return;
    const refs = parseRefs(info.scripture).refs;
    const pl = playlist(id);
    const sermonId = pl && sectionPresentations(pl, SECTION.sermon)[0];
    const sermon = sermonId && lib.current.presentations.find((p) => p.id === sermonId);
    if (sermon) {
      const title = sermonTitleSlide(t, { refs, sermonTitle: info.sermonTitle, preacher: info.preacher });
      const rest = sermon.slides[0]?.group === '설교' ? sermon.slides.slice(1) : sermon.slides;
      dispatch({ type: 'presentation/update', id: sermon.id, patch: { slides: [title, ...rest] } });
    }
    if (!refs.length) return;
    const { sunday } = lib.current;
    const all = loadTranslations();
    const translations = sunday.translations.map((x) => all.find((tr) => tr.id === x)).filter((x): x is (typeof all)[number] => !!x);
    if (!translations.length) return;
    const chunks = await loadScriptureChunks(refs, { translations, versesPerSlide: sunday.versesPerSlide });
    const slides = scriptureSlides(t, { refs, chunks });
    if (!slides.length) return;
    const p: Presentation = { id: uid('p'), title: '성경 말씀', slides, themeId: 'theme_classic', folder: liveFolder(upcomingSunday(new Date())), background: { kind: 'color', value: '#000000' } };
    await add(p);
    await place(id, SECTION.bible, [p.id], true);
  };

  const conti = (file: File) => run('콘티 읽는 중…', async () => {
    const pages = await renderPdf(file, { scale: 1.6, maxPages: 30, quality: 0.8 });
    setBusy(`AI가 콘티 ${pages.length}쪽을 읽는 중… (1분 정도 걸릴 수 있어요)`);
    const payload = await Promise.all(pages.map(async (p) => ({ page: p.page, data: await blobToBase64(p.blob), text: p.text })));
    const r = await ai.conti(payload, []);
    if (!r.songs.length) throw new Error('콘티에서 찬양을 찾지 못했습니다.');
    const [y, m, d] = r.date.split('-').map(Number);
    const date = serviceDate(m ? { year: y, month: m, day: d } : undefined, new Date());
    const id = await ensure(date);
    const t = await templatesNow();
    const folder = liveFolder(date);
    const cleared = new Set<SectionTitle>();
    for (const [i, song] of r.songs.entries()) {
      setBusy(`찬양 넣는 중 ${i + 1}/${r.songs.length}: ${song.title}`);
      const { pres, isNew } = songFor({ ...song, key: song.key || undefined }, folder, t);
      if (isNew) await add(pres);
      const section = song.postSermon ? SECTION.after : SECTION.songs;
      await place(id, section, [pres.id], !cleared.has(section));
      if (!cleared.size) await show(id, pres.id);
      cleared.add(section);
    }
    for (const section of [SECTION.songs, SECTION.after]) if (!cleared.has(section)) await place(id, section, [], true);
    await serviceInfo(id, r, t);
    return `${mmdd(date)} 콘티: ${r.songs.length}곡을 예배에 넣었습니다`;
  });

  const lyrics = (files: File[]) => run('가사 넣는 중…', async () => {
    const id = await ensure();
    const t = await templatesNow();
    const folder = liveFolder(upcomingSunday(new Date()));
    for (const f of files) {
      const song = presentationFromSongFile(f.name, await f.text(), lib.current.sunday.linesPerSlide);
      const pres = t ? songInTemplate(song, t, folder) : { ...song, folder };
      await add(pres);
      await place(id, SECTION.songs, [pres.id]);
      await show(id, pres.id);
    }
    return `가사 ${files.length}곡을 찬양에 넣었습니다`;
  });

  const sermon = (files: File[]) => run('설교 슬라이드 넣는 중…', async () => {
    const id = await ensure();
    await tick();
    const pl = playlist(id);
    let sermonId = pl ? sectionPresentations(pl, SECTION.sermon)[0] : undefined;
    if (!sermonId) {
      const p: Presentation = { id: uid('p'), title: `${mmdd(upcomingSunday(new Date()))} 설교`, slides: [], themeId: 'theme_classic', folder: liveFolder(upcomingSunday(new Date())), background: { kind: 'color', value: '#000000' } };
      await add(p);
      await place(id, SECTION.sermon, [p.id]);
      sermonId = p.id;
    }
    await show(id, sermonId);
    const start = lib.current.presentations.find((p) => p.id === sermonId)?.slides ?? [];
    const added: Slide[] = [];
    const push = (s: Slide) => {
      added.push(s);
      dispatch({ type: 'presentation/update', id: sermonId!, patch: { slides: [...start, ...added] } });
    };
    for (const file of files) {
      const name = file.name.replace(/\.[^.]+$/, '');
      if (/\.pptx$/i.test(file.name)) {
        await pptxSlides(await file.arrayBuffer(), {
          group: () => name,
          mediaId: () => uid('m'),
          store: async (mid, blob) => {
            await putMedia(mid, blob);
            dispatch({ type: 'media/add', media: { id: mid, name: `${name} ${added.length + 1}`, type: 'image' } });
          },
          onSlide: (s, n, total) => {
            setBusy(`설교 슬라이드 ${n + 1}/${total}: ${name}`);
            push(s);
          },
        });
      } else {
        for (const s of await filesToSlides([file], (m) => dispatch({ type: 'media/add', media: m }), setBusy)) push(s);
      }
    }
    return `설교 슬라이드 ${added.length}장을 넣었습니다`;
  });

  const drop = (files: File[]) => {
    const lyricFiles = files.filter((f) => LYRIC_FILE.test(f.name));
    const contiFile = files.find((f) => /\.pdf$/i.test(f.name) && CONTI_NAME.test(f.name));
    const sermonFiles = files.filter((f) => !lyricFiles.includes(f) && f !== contiFile && (/\.(pptx|pdf)$/i.test(f.name) || f.type.startsWith('image/')));
    (async () => {
      if (contiFile) await conti(contiFile);
      if (lyricFiles.length) await lyrics(lyricFiles);
      if (sermonFiles.length) await sermon(sermonFiles);
    })();
  };

  const open = () => run('예배 여는 중…', async () => {
    const id = await ensure();
    const pl = playlist(id);
    await show(id, pl && sectionPresentations(pl, SECTION.front)[0]);
  });

  return { templates, busy, open, conti, lyrics, sermon, drop };
}
