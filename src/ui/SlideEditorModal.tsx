import { useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Presentation, Slide } from '../domain/types';
import { resolveBackground } from '../domain/autoBackground';
import { songSourceFromSlides } from '../domain/slideEditing';
import { isLibrarySong } from '../domain/sunday/dedupe';
import { isSong } from '../domain/templates/fill';
import { registerSharedSong } from '../domain/online';
import { SlideCanvas } from './SlideCanvas';
import { CanvasEditor } from './ppt/CanvasEditor';
import { SlideFormat } from './ppt/SlideFormat';
import { SlideContentEditor } from './SlideContentEditor';
import { SlideDesigner } from './SlideDesigner';
import { AutoTextarea } from './AutoTextarea';
import { sequence } from '../domain/arrangement';

/** One persistent slide at a time, for songs, scripture, announcements and imported decks. */
export function SlideEditorModal({ state, dispatch, presentation: p, slideId, slideSeq, onSelect, onSource, onClose }: {
  state: AppState; dispatch: Dispatch<Action>; presentation: Presentation; slideId: string | null; slideSeq: number | null;
  onSelect: (id: string, seq?: number) => void; onSource: () => void; onClose: () => void;
}) {
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [designing, setDesigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const pages = sequence(p);
  const index = slideSeq != null && pages[slideSeq] ? slideSeq : Math.max(0, pages.findIndex((x) => x.slide.id === slideId));
  const slide = pages[index]?.slide;
  const theme = state.library.themes.find((t) => t.id === p.themeId) ?? state.library.themes[0];
  const update = (patch: Partial<Slide>) => slide && dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, seq: index, sequenceLength: pages.length, patch });
  const editDispatch: Dispatch<Action> = (a) => dispatch(a.type === 'slide/update' && a.presentationId === p.id && a.slideId === slide?.id ? { ...a, seq: index, sequenceLength: pages.length } : a);
  const pick = (id: string, seq: number) => { setSelectedElement(null); onSelect(id, seq); };
  const remove = () => {
    if (!slide) return;
    const next = pages[index + 1]?.slide ?? pages[index - 1]?.slide;
    dispatch({ type: 'slide/delete', presentationId: p.id, slideIds: [slide.id], seqs: [index] });
    setSelectedElement(null); setDesigning(false); setMessage('슬라이드 한 장을 삭제했습니다. 실행 취소로 복원할 수 있습니다.');
    if (next) {
      onSelect(next.id, Math.min(index, pages.length - 2));
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus());
    }
  };
  const shared = isLibrarySong(p) && isSong(p);
  const publishLyrics = async () => {
    const source = songSourceFromSlides(p);
    if (!source.sections.some((s) => s.lines.some((l) => l.trim()))) return setMessage('등록할 가사를 입력해 주세요.');
    setSaving(true); setMessage(null);
    try {
      await registerSharedSong({ title: p.title, key: p.meta?.key, sections: source.sections, order: source.order ?? [] });
      setMessage('교회 찬양 라이브러리에 가사를 반영했습니다.');
    } catch (e) { setMessage(`가사를 반영하지 못했습니다: ${(e as Error).message}`); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-editor-modal" role="dialog" aria-modal="true" aria-label="슬라이드별 편집" onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
        const target = e.target as HTMLElement;
        if (e.defaultPrevented || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey || target.isContentEditable || target.closest('input,textarea,select')) return;
        if ((e.key === 'Backspace' || e.key === 'Delete') && target.closest('.slide-editor-list, .ce-root') && !selectedElement) {
          e.preventDefault(); e.stopPropagation();
          if (!e.repeat) remove();
        }
      }}>
        <header className="modal-head"><h2>슬라이드별 편집 · {p.title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></header>
        <div className="slide-editor-body">
          <nav ref={listRef} className="slide-editor-list" aria-label="편집할 슬라이드">
            <p className="hint">슬라이드를 선택한 뒤 Backspace / Delete로 한 장씩 삭제할 수 있습니다.</p>
            {pages.map(({ slide: s }, i) => (
              <button key={i} className={i === index ? 'on' : ''} aria-label={`슬라이드 ${i + 1} 편집`} autoFocus={i === index} aria-current={i === index ? 'true' : undefined} onClick={() => pick(s.id, i)}>
                <SlideCanvas slide={s} theme={theme} background={resolveBackground(s, p)} bgEffect={p.bgEffect} />
                <span>{i + 1} · {s.label || s.group || '슬라이드'}</span>
              </button>
            ))}
          </nav>
          {slide ? <>
            <section className="slide-editor-main">
              <div className="slide-editor-position"><strong>슬라이드 {index + 1} / {pages.length}</strong>
                <span>{state.live.slide?.id === slide.id ? '● 화면에 표시 중 — 수정하면 바로 반영됩니다' : '이 슬라이드에만 적용됩니다'}</span>
                <button className="danger" onClick={remove}>이 슬라이드만 삭제</button>
              </div>
              <CanvasEditor key={`${p.id}:${index}`} slide={slide} theme={theme} background={resolveBackground(slide, p)} bgEffect={p.bgEffect}
                selectedId={selectedElement} onSelect={setSelectedElement} onChange={update} />
              {!slide.text && !slide.elements?.length && slide.background && <p className="hint">그림·PDF 슬라이드에는 본문을 입력해 텍스트를 추가할 수 있습니다. 이미지 안의 글자는 원본 파일에서 수정해 주세요.</p>}
              <SlideContentEditor slide={slide} onChange={update} />
              <label className="stack">슬라이드 노트<AutoTextarea aria-label="슬라이드 노트" rows={2} value={slide.notes ?? ''} onChange={(e) => update({ notes: e.target.value || undefined })} /></label>
            </section>
            <aside className="slide-editor-format">
              <SlideFormat key={`${p.id}:${index}`} state={state} dispatch={editDispatch} presentation={p} slide={slide} showContent={false}
                selectedId={selectedElement} onSelect={setSelectedElement} onDesign={() => setDesigning(true)} />
            </aside>
          </> : <p className="empty">슬라이드가 없습니다. 전체 텍스트 편집에서 추가할 수 있습니다.</p>}
        </div>
        <footer className="modal-foot">
          <span className="muted small grow">{message ?? '수정 내용은 자동 저장됩니다 · 실행 취소: ⌘/Ctrl+Z'}</span>
          <button disabled={!state.past.length} onClick={() => dispatch({ type: 'undo' })}>실행 취소</button>
          <button onClick={onSource}>{isSong(p) ? '전체 가사 편집' : '전체 텍스트 편집'}</button>
          {shared && <button disabled={saving} onClick={publishLyrics}>{saving ? '반영 중…' : '교회 찬양 라이브러리에 가사 반영'}</button>}
          <button className="primary" onClick={onClose}>닫기</button>
        </footer>
      </div>
      {designing && slide && <SlideDesigner slide={slide} theme={theme} background={resolveBackground(slide, p)} media={state.library.media}
        addMedia={(media) => dispatch({ type: 'media/add', media })} onClose={() => setDesigning(false)} onSave={(elements, text) => update({ elements: elements.length ? elements : undefined, text })} />}
    </div>
  );
}
