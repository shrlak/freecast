import { useMemo, useRef, useState } from 'react';
import type { Presentation, SongMeta, Theme, Transition, TransitionKind } from '../domain/types';
import { parseLyrics, serializeLyrics, uid } from '../domain/lyrics';
import { useAutosave } from './hooks';
import { AutoTextarea } from './AutoTextarea';
import { isPdfSlide, PDF_READ_ONLY } from '../domain/importedSlides';

interface Props {
  presentation: Presentation | null;
  themes: Theme[];
  /** Called as the presentation is edited (autosave); `isNew` the first time a new one is saved. */
  onSave: (p: Presentation, isNew: boolean) => void;
  onClose: () => void;
}

const PLACEHOLDER = `[Verse 1]
First line of the verse
Second line of the verse

[Chorus]
Chorus line one
Chorus line two`;

export function EditorModal({ presentation, themes, onSave, onClose }: Props) {
  const hasPdf = presentation?.slides.some(isPdfSlide) ?? false;
  const [title, setTitle] = useState(presentation?.title ?? '');
  const [folder, setFolder] = useState(presentation?.folder ?? 'Songs');
  const [text, setText] = useState(() => (presentation ? serializeLyrics(presentation.slides) : ''));
  const [maxLines, setMaxLines] = useState(0);
  const [meta, setMeta] = useState<SongMeta>(presentation?.meta ?? {});
  const [transition, setTransition] = useState<Transition | undefined>(presentation?.transition);
  const [showCopyright, setShowCopyright] = useState(!!presentation?.showCopyright);
  const [bgEffect, setBgEffect] = useState(presentation?.bgEffect ?? { dim: 0, blur: 0 });
  const preview = useMemo(() => hasPdf ? presentation!.slides : parseLyrics(text, { maxLines }), [hasPdf, presentation, text, maxLines]);
  const setM = (k: keyof SongMeta, v: string) => setMeta((m) => ({ ...m, [k]: v || undefined }));

  const id = useRef(presentation?.id ?? uid('p'));
  const created = useRef(!!presentation);

  const build = (): Presentation => {
    // Keep slide ids and extras (headings, translations, notes, QR) where the slide still lines up.
    const old = presentation?.slides ?? [];
    const slides = preview.map((s, i) => {
      const o = old[i];
      if (!o) return s;
      if (o.text === s.text && o.group === s.group) return o;
      return o.group === s.group ? { ...o, text: s.text } : s;
    });
    return {
      ...(presentation ?? { themeId: themes[0].id }),
      id: id.current,
      title: title.trim() || 'Untitled',
      folder: folder.trim() || undefined,
      slides,
      meta: Object.values(meta).some(Boolean) ? meta : undefined,
      transition,
      showCopyright,
      bgEffect: bgEffect.dim || bgEffect.blur ? bgEffect : undefined,
    };
  };

  // Every edit saves itself; a new presentation appears once it has a title or text.
  useAutosave({ title, folder, text, maxLines, meta, transition, showCopyright, bgEffect }, () => {
    onSave(build(), !created.current);
    created.current = true;
  }, { enabled: !!presentation || !!title.trim() || !!text.trim() });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Edit presentation">
        <header className="modal-head">
          <h2>{presentation ? 'Edit presentation' : 'New presentation'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="editor-body">
          <div className="editor-col">
            <div className="row gap-s">
              <input className="title-input grow" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              <input placeholder="Folder" value={folder} onChange={(e) => setFolder(e.target.value)} style={{ width: 140 }} />
            </div>
            {hasPdf && <p className="hint">{PDF_READ_ONLY} 다른 슬라이드는 슬라이드별 편집을 사용해 주세요.</p>}
            <AutoTextarea className="lyrics-input" disabled={hasPdf} placeholder={PLACEHOLDER} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
            <p className="hint">
              Blank line = new slide. Section lines like <code>[Verse 1]</code>, <code>Chorus</code> or <code>Bridge:</code> label the slides that follow.
              Wrap a line in <code>**…**</code> to make it bold.
            </p>
          </div>
          <div className="editor-col preview-col">
            <details className="song-info" open={!!presentation?.meta}>
              <summary>Song info, copyright & transition</summary>
              <div className="form-grid">
                <label>Author<input value={meta.author ?? ''} onChange={(e) => setM('author', e.target.value)} /></label>
                <label>Copyright<input value={meta.copyright ?? ''} onChange={(e) => setM('copyright', e.target.value)} /></label>
                <label>CCLI #<input value={meta.ccli ?? ''} onChange={(e) => setM('ccli', e.target.value)} /></label>
                <label>Key<input value={meta.key ?? ''} onChange={(e) => setM('key', e.target.value)} /></label>
                <label>Tempo<input value={meta.tempo ?? ''} onChange={(e) => setM('tempo', e.target.value)} /></label>
                <label>Transition
                  <select value={transition?.kind ?? ''} onChange={(e) => setTransition(e.target.value ? { kind: e.target.value as TransitionKind, duration: transition?.duration ?? 1 } : undefined)}>
                    <option value="">Default (fade)</option>
                    <option value="cut">Cut</option><option value="fade">Fade</option><option value="slide">Slide</option><option value="zoom">Zoom</option>
                  </select>
                </label>
              </div>
              <label className="check small"><input type="checkbox" checked={showCopyright} onChange={(e) => setShowCopyright(e.target.checked)} /> Show copyright line on first and last slide</label>
              <div className="form-grid">
                <label>Background dim <span className="muted">{Math.round(bgEffect.dim * 100)}%</span><input type="range" min={0} max={0.9} step={0.05} value={bgEffect.dim} onChange={(e) => setBgEffect({ ...bgEffect, dim: Number(e.target.value) })} /></label>
                <label>Background blur <span className="muted">{bgEffect.blur}px</span><input type="range" min={0} max={40} value={bgEffect.blur} onChange={(e) => setBgEffect({ ...bgEffect, blur: Number(e.target.value) })} /></label>
              </div>
            </details>
            <div className="row space-between">
              <strong>{preview.length} slides</strong>
              <label className="field-inline">
                Max lines/slide
                <select disabled={hasPdf} value={maxLines} onChange={(e) => setMaxLines(Number(e.target.value))}>
                  <option value={0}>No limit</option>
                  {[1, 2, 3, 4, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </div>
            <ol className="preview-list">
              {preview.map((s) => (
                <li key={s.id}>
                  <span className="muted small">{s.group || 'Slide'}</span>
                  <div className="pre">{s.text}</div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">편집하면 자동으로 저장됩니다 (되돌리기: ⌘/Ctrl+Z)</span>
          <button className="primary" onClick={onClose}>닫기</button>
        </footer>
      </div>
    </div>
  );
}
