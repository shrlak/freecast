import { memo, useRef, useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import type { Presentation, Slide, Theme } from '../domain/types';
import { groupColor, uid } from '../domain/lyrics';
import { groupsOf, sequence } from '../domain/arrangement';
import { ai } from '../domain/ai';
import { exportPptx } from '../domain/io/pptxExport';
import { SlideCanvas } from './SlideCanvas';
import { SlideInspector } from './SlideInspector';
import { SlideDesigner } from './SlideDesigner';
import { TimelineBar } from './TimelineBar';
import { resolveBackground } from '../domain/autoBackground';
import { NameDialog } from './NameDialog';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  onEdit: () => void;
  onEditSlide?: (id: string, seq: number) => void;
  onThemes: () => void;
  notify: (msg: string) => void;
  locked?: boolean;
}

const Thumb = memo(function Thumb(props: {
  slide: Slide; num: number; theme: Theme; pres: Presentation; live: boolean; onClick: () => void; onInspect: () => void; onDelete: () => void;
  bgEffect?: { dim: number; blur: number };
}) {
  const { slide } = props;
  return (
    <div data-slide-seq={props.num - 1} className={`thumb ${props.live ? 'live' : ''} ${slide.disabled ? 'disabled' : ''}`} style={{ ['--group' as string]: groupColor(slide.group) }} onKeyDown={(e) => {
      if (e.defaultPrevented || e.nativeEvent.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) props.onDelete();
      }
    }}>
      <button className="thumb-main" onClick={props.onClick} onContextMenu={(e) => { e.preventDefault(); props.onInspect(); }} title="Click: go live · Right-click: quick edit">
        <SlideCanvas slide={slide} theme={props.theme} background={resolveBackground(slide, props.pres)} bgEffect={props.bgEffect} />
        <span className="thumb-label">
          <span className="thumb-num">{props.num}</span>
          <span className="truncate">{slide.label || slide.group || 'Slide'}</span>
          {slide.notes && <span title="Has notes">✎</span>}
        </span>
      </button>
      <button className="thumb-edit mini-btn" title="Slide settings" onClick={props.onInspect}>⚙</button>
      {(slide.autoAdvance || slide.actions?.length || slide.hotkey) && (
        <span className="thumb-badges">{slide.hotkey && <b>{slide.hotkey.toUpperCase()}</b>}{slide.actions?.length ? '⚡' : ''}{slide.autoAdvance ? `⏱${slide.autoAdvance}s` : ''}</span>
      )}
    </div>
  );
});

function ArrangementBar({ p, dispatch }: { p: Presentation; dispatch: Dispatch<Action> }) {
  const [editing, setEditing] = useState<string[] | null>(null);
  const groups = groupsOf(p);
  return (
    <div className="arrangement-bar">
      <span className="muted small">Arrangement</span>
      <select value={p.arrangementId ?? ''} onChange={(e) => dispatch({ type: 'arrangement/select', presentationId: p.id, id: e.target.value || null })}>
        <option value="">Master (as written)</option>
        {p.arrangements?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      {editing ? (
        <>
          <div className="chips">
            {editing.map((g, i) => (
              <button key={i} className="chip" style={{ background: groupColor(g) }} title="Remove" onClick={() => setEditing(editing.filter((_, k) => k !== i))}>{g} ✕</button>
            ))}
          </div>
          <span className="muted small">add:</span>
          {groups.map((g) => <button key={g} className="chip outline" style={{ borderColor: groupColor(g) }} onClick={() => setEditing([...editing, g])}>{g}</button>)}
          <button className="primary" disabled={!editing.length} onClick={() => {
            const name = prompt('Arrangement name', editing.map((g) => g.replace(/[a-z\s-]/g, '') || g[0]).join('-'));
            if (name) dispatch({ type: 'arrangement/upsert', presentationId: p.id, arrangement: { id: uid('arr'), name, groups: editing } });
            setEditing(null);
          }}>Save</button>
          <button onClick={() => setEditing(null)}>Cancel</button>
        </>
      ) : (
        <>
          <button onClick={() => setEditing([])}>New…</button>
          {p.arrangementId && <button className="danger" onClick={() => dispatch({ type: 'arrangement/delete', presentationId: p.id, id: p.arrangementId! })}>진행 구성 삭제</button>}
        </>
      )}
    </div>
  );
}

export function SlideGrid({ state, dispatch, onEdit, onEditSlide, onThemes, notify, locked }: Props) {
  const [inspect, setInspect] = useState<string | null>(null);
  const [design, setDesign] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const p = state.library.presentations.find((x) => x.id === state.selectedId);
  if (!p) {
    return <main className="panel center-empty"><p>Select a presentation from the library, or create a new one.</p></main>;
  }
  const theme = state.library.themes.find((t) => t.id === p.themeId) ?? state.library.themes[0];
  const seq = sequence(p);
  const liveSeq = state.cursor?.presentationId === p.id ? state.cursor.seq : -1;
  const inspected = p.slides.find((s) => s.id === inspect);

  const translate = async () => {
    setBusy(true);
    try {
      const res = await ai.translate(p.title, p.slides.map((s) => ({ id: s.id, text: s.text })));
      const byId = new Map(res.lines.map((l) => [l.id, l.text]));
      dispatch({ type: 'presentation/update', id: p.id, patch: { slides: p.slides.map((s) => (byId.has(s.id) ? { ...s, subtext: byId.get(s.id) } : s)) } });
      notify('English lines added under each slide');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="panel slides-panel">
      <div className="toolbar">
        <h1 className="truncate">{p.title}{p.meta?.key && <span className="key-badge">{p.meta.key}</span>}</h1>
        <div className="row gap-s wrap">
          <label className="field-inline">
            Theme
            <select value={p.themeId} onChange={(e) => dispatch({ type: 'presentation/update', id: p.id, patch: { themeId: e.target.value } })}>
              {state.library.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button onClick={onThemes}>Themes…</button>
          {p.background && <button title="Remove this presentation's own background" onClick={() => dispatch({ type: 'presentation/update', id: p.id, patch: { background: undefined } })}>Unpin BG</button>}
          <button onClick={onEdit}>Edit</button>
          <button className={p.loop ? 'active' : ''} title="Loop: after the last slide go back to the first (use with auto-advance for announcement loops)"
            onClick={() => dispatch({ type: 'presentation/update', id: p.id, patch: { loop: !p.loop } })}>⟲ Loop</button>
          <button title="Run this presentation in the announcements layer, on top of whatever is live" onClick={() => dispatch({ type: 'announce/start', presentationId: p.id })}>📣 Announce</button>
          <button title="Add a slide" onClick={() => dispatch({ type: 'presentation/update', id: p.id, patch: { slides: [...p.slides, { id: uid('s'), group: p.slides[p.slides.length - 1]?.group ?? 'Slide', text: '' }] } })}>＋ Slide</button>
          <button disabled={busy} title="AI: add an English translation line under each slide" onClick={translate}>{busy ? 'Translating…' : '✨ Translate'}</button>
          <button title="Download as PowerPoint" onClick={() => exportPptx(state.library, { presentation: p }, p.title).catch((e) => notify(String(e)))}>⇩ PPTX</button>
          <button title="Duplicate" onClick={() => dispatch({ type: 'presentation/create', presentation: { ...p, id: uid('p'), title: `${p.title} copy`, slides: p.slides.map((s) => ({ ...s, id: uid('s') })) } })}>⧉</button>
          <button className="danger" onClick={() => setDeleting(true)}>자료 전체 삭제…</button>
        </div>
      </div>
      <ArrangementBar p={p} dispatch={dispatch} />
      <TimelineBar key={p.id} p={p} state={state} dispatch={dispatch} />
      <div ref={gridRef} className="grid">
        {seq.map(({ slide }, i) => (
          <Thumb
            key={`${slide.id}-${i}`}
            slide={slide}
            num={i + 1}
            theme={theme}
            pres={p}
            live={i === liveSeq}
            bgEffect={p.bgEffect}
            onClick={() => dispatch({ type: 'live/go', presentationId: p.id, seq: i, now: Date.now() })}
            onInspect={() => onEditSlide ? onEditSlide(slide.id, i) : setInspect(slide.id)}
            onDelete={() => {
              if (locked && state.live.slide) return notify('🔒 화면에 표시 중이라 삭제가 잠겨 있습니다 — 상태 표시줄의 🔒를 눌러 해제하세요');
              dispatch({ type: 'slide/delete', presentationId: p.id, slideIds: [slide.id], seqs: [i] });
              const next = Math.min(i, seq.length - 2);
              requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-slide-seq="${next}"] .thumb-main`)?.focus());
            }}
          />
        ))}
        {!seq.length && <div className="empty">No slides yet. Click “Edit” to add some.</div>}
      </div>
      {deleting && <NameDialog title="자료 전체 삭제 확인" initialValue="" inputLabel="삭제할 자료 제목" saveLabel="자료 전체 삭제" maxLength={Math.max(120, p.title.length)}
        description={`“${p.title}”의 모든 슬라이드를 삭제합니다. 한 장만 삭제하려면 취소 후 해당 슬라이드의 편집 버튼을 사용하세요. 전체 삭제하려면 제목을 직접 입력하세요.`}
        onClose={() => setDeleting(false)} onSave={(name) => {
          if (name !== p.title.trim()) return '자료 제목이 일치하지 않습니다.';
          dispatch({ type: 'presentation/delete', id: p.id });
        }} />}
      {inspected && (
        <SlideInspector
          slide={inspected}
          library={state.library}
          onChange={(patch) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: inspected.id, patch })}
          onDesign={() => setDesign(inspected.id)}
          onClose={() => setInspect(null)}
        />
      )}
      {design && (() => {
        const sl = p.slides.find((x) => x.id === design);
        if (!sl) return null;
        return (
          <SlideDesigner
            slide={sl} theme={theme} background={resolveBackground(sl, p)} media={state.library.media}
            addMedia={(m) => dispatch({ type: 'media/add', media: m })}
            onClose={() => setDesign(null)}
            onSave={(elements, text) => {
              dispatch({ type: 'slide/update', presentationId: p.id, slideId: sl.id, patch: { elements: elements.length ? elements : undefined, text } });
            }}
          />
        );
      })()}
    </main>
  );
}
