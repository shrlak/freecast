import { useEffect, useMemo, useState } from 'react';
import type { Presentation, Slide } from '../domain/types';
import { parseRefs, formatRef } from '../domain/bible/refs';
import { loadTranslation, searchBible, TRANSLATIONS, type SearchHit, type Translation } from '../domain/bible/data';
import { BIBLE_BOOKS } from '../domain/bible/books';
import { buildScripture } from '../domain/bible/slides';
import { uid } from '../domain/lyrics';

/** Translations available from the content server. */
export function loadTranslations(): Translation[] {
  return TRANSLATIONS;
}

interface Props {
  initialRefs?: string;
  onClose: () => void;
  onCreate: (p: Presentation, goLive: boolean) => void;
}

/** Scripture slides: type references ("요3:16 롬8:28-30" or "John 3:16"), pick up to two translations. */
export function BibleModal({ initialRefs = '', onClose, onCreate }: Props) {
  const [input, setInput] = useState(initialRefs);
  const translations = TRANSLATIONS;
  const [chosen, setChosen] = useState<string[]>(['nkrv']);
  const [perSlide, setPerSlide] = useState(2);
  const [sermonTitle, setSermonTitle] = useState('');
  const [slides, setSlides] = useState<Slide[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const runSearch = async () => {
    const t = translations.find((x) => x.id === chosen[0]) ?? translations[0];
    try {
      setHits(searchBible(await loadTranslation(t), query));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const addHit = (h: SearchHit) => {
    const token = `${BIBLE_BOOKS[h.bookIndex].abbrKo[0]}${h.chapter}:${h.verse}`;
    setInput((v) => (v.trim() ? `${v.trim()} ${token}` : token));
  };
  const { refs, invalid } = useMemo(() => parseRefs(input), [input]);
  const picked = chosen.map((id) => translations.find((t) => t.id === id)).filter(Boolean) as Translation[];

  useEffect(() => {
    if (!refs.length || !picked.length) {
      setSlides([]);
      return;
    }
    let alive = true;
    const t = setTimeout(() => {
      buildScripture(refs, { translations: picked, versesPerSlide: perSlide, sermonTitle })
        .then((s) => { if (alive) { setSlides(s); setError(null); } })
        .catch((e: Error) => alive && setError(e.message));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, chosen.join(), perSlide, sermonTitle]);

  const toggle = (id: string) => setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2)));

  const create = (live: boolean) => {
    const title = refs.map((r) => formatRef(r, picked[0]?.language ?? 'ko')).join(', ');
    onCreate({ id: uid('p'), title, slides, themeId: 'theme_scripture', folder: 'Scripture' }, live);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Bible">
        <header className="modal-head">
          <h2>📖 성경 말씀 · Bible</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="editor-body">
          <div className="editor-col">
            <label className="stack">References
              <input className="title-input" autoFocus placeholder="행1:8-10 요3:16 롬8:28  ·  로마서 5장 1-11절  ·  John 3:16; Ps 23" value={input} onChange={(e) => setInput(e.target.value)} />
            </label>
            <div className="muted small">
              {refs.map((r) => formatRef(r)).join(' · ') || 'Type one or more references'}
              {invalid.length > 0 && <span className="warn"> · not recognised: {invalid.join(', ')}</span>}
            </div>
            <label className="stack">Sermon title (optional — adds a title slide)
              <input value={sermonTitle} onChange={(e) => setSermonTitle(e.target.value)} />
            </label>
            <div className="stack">
              <span>Translations (up to 2 — the second shows underneath)</span>
              <div className="row gap-xs wrap">
                {translations.map((t) => (
                  <button key={t.id} className={chosen.includes(t.id) ? 'active' : ''} onClick={() => toggle(t.id)}>
                    {chosen.indexOf(t.id) >= 0 ? `${chosen.indexOf(t.id) + 1}. ` : ''}{t.name}
                  </button>
                ))}
              </div>
              <p className="hint">☁ Loaded from the online server when used — nothing is stored on this computer.</p>
            </div>
            <label className="field-inline">Verses per slide
              <select value={perSlide} onChange={(e) => setPerSlide(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            {error && <div className="warn">{error}</div>}
            <form className="stack" onSubmit={(e) => { e.preventDefault(); runSearch(); }}>
              <span>🔎 Search the Bible by words (in the first selected translation)</span>
              <div className="row gap-xs"><input className="grow" placeholder="사랑 오래 참고 · shepherd" value={query} onChange={(e) => setQuery(e.target.value)} /><button type="submit">Search</button></div>
            </form>
            {hits.length > 0 && (
              <ol className="preview-list search-hits">
                {hits.map((h) => (
                  <li key={`${h.bookIndex}-${h.chapter}-${h.verse}`} onClick={() => addHit(h)} title="Click to add this verse">
                    <span className="muted small">{BIBLE_BOOKS[h.bookIndex].nameKo} {h.chapter}:{h.verse}</span>
                    <div>{h.text}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="editor-col preview-col">
            <strong>{slides.length} slides</strong>
            <ol className="preview-list">
              {slides.map((s) => (
                <li key={s.id}>
                  <span className="muted small">{s.title}</span>
                  <div className="pre">{s.text}</div>
                  {s.subtext && <div className="pre muted small">{s.subtext}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
        <footer className="modal-foot">
          <button onClick={onClose}>Cancel</button>
          <button disabled={!slides.length} onClick={() => create(false)}>Add to library</button>
          <button className="primary" disabled={!slides.length} onClick={() => create(true)}>Go live</button>
        </footer>
      </div>
    </div>
  );
}
