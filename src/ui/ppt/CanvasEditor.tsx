import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import type { Background, BackgroundEffect, Slide, SlideElement, Theme } from '../../domain/types';
import { CANVAS_H, CANVAS_W } from '../../domain/canvas';
import { patchElement } from '../../domain/templates/convert';
import { SlideCanvas, slideTheme } from '../SlideCanvas';
import { useWidth } from '../hooks';

/** The slide's own text (lyrics, scripture…) drawn by the theme, selectable like an object. */
export const SLIDE_TEXT = '__slide-text';

type Box = { x: number; y: number; w: number; h: number };
interface Drag { id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: Box }

interface Props {
  slide: Slide;
  theme: Theme;
  background: Background | null;
  bgEffect?: BackgroundEffect;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Apply a change to the slide (objects moved, resized, retyped, deleted). */
  onChange: (patch: Partial<Slide>) => void;
}

/**
 * The slide, edited in place like PowerPoint: click any object — text, logo, picture, box, or the
 * slide's own text — to select it; drag to move, drag the corner to resize, arrow keys to nudge,
 * Delete to remove; double-click (or click again) text to type on the slide. Changes apply as you
 * go, so a slide that is live updates on screen.
 */
export function CanvasEditor({ slide, theme: baseTheme, background, bgEffect, selectedId, onSelect, onChange }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const k = width / CANVAS_W || 1;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<{ id: string; box: Box } | null>(null);
  const drag = useRef<Drag | null>(null);
  const commitTimer = useRef<number | undefined>(undefined);
  const theme = slideTheme(baseTheme, slide);
  const elements = slide.elements ?? [];
  const textBox: Box = { x: theme.padding, y: theme.padding, w: CANVAS_W - theme.padding * 2, h: CANVAS_H - theme.padding * 2 };

  // A different slide: stop typing and drop the selection.
  useEffect(() => {
    setEditing(null);
    setPreview(null);
  }, [slide.id]);

  const boxOf = (el: SlideElement): Box => (preview?.id === el.id ? preview.box : { x: el.x, y: el.y, w: el.w, h: el.h });
  const updateElement = (id: string, patch: Partial<SlideElement>) =>
    onChange({ elements: elements.map((e) => (e.id === id ? patchElement(e, patch) : e)) });

  // What the canvas shows: the object being dragged where it is going, the text being typed hidden
  // underneath the typing box.
  const shown: Slide = {
    ...slide,
    text: editing === SLIDE_TEXT ? '' : slide.text,
    title: editing === SLIDE_TEXT ? undefined : slide.title,
    subtext: editing === SLIDE_TEXT ? undefined : slide.subtext,
    elements: elements.map((e) => {
      const b = boxOf(e);
      const moved = { ...e, ...b };
      return editing === e.id ? { ...moved, text: '', paragraphs: undefined } : moved;
    }),
  };

  const commitText = (id: string, text: string) => {
    if (id === SLIDE_TEXT) onChange({ text });
    else updateElement(id, { text });
  };
  const type = (text: string) => {
    setDraft(text);
    window.clearTimeout(commitTimer.current);
    const id = editing!;
    commitTimer.current = window.setTimeout(() => commitText(id, text), 250);
  };
  const startEditing = (id: string) => {
    const el = elements.find((e) => e.id === id);
    if (id !== SLIDE_TEXT && el?.kind !== 'text') return;
    setDraft(id === SLIDE_TEXT ? slide.text : el?.text ?? '');
    setEditing(id);
    onSelect(id);
  };
  const stopEditing = () => {
    if (editing) {
      window.clearTimeout(commitTimer.current);
      commitText(editing, draft);
    }
    setEditing(null);
  };

  const onPointerDown = (e: RPointerEvent, id: string, mode: Drag['mode']) => {
    if (editing === id) return;
    e.stopPropagation();
    if (editing) stopEditing();
    if (selectedId === id && mode === 'move' && e.detail >= 2) return startEditing(id);
    onSelect(id);
    (e.currentTarget.closest('.ce-root') as HTMLElement | null)?.focus();
    const el = elements.find((x) => x.id === id);
    if (!el) return;
    drag.current = { id, mode, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h } };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / k;
    const dy = (e.clientY - d.startY) / k;
    if (Math.abs(dx) + Math.abs(dy) < 2 && !preview) return;
    const box = d.mode === 'move'
      ? { ...d.orig, x: Math.round(d.orig.x + dx), y: Math.round(d.orig.y + dy) }
      : { ...d.orig, w: Math.max(20, Math.round(d.orig.w + dx)), h: Math.max(20, Math.round(d.orig.h + dy)) };
    setPreview({ id: d.id, box });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && preview?.id === d.id) updateElement(d.id, preview.box);
    setPreview(null);
  };

  const onKeyDown = (e: RKeyboardEvent) => {
    if (editing || !selectedId) return;
    const el = elements.find((x) => x.id === selectedId);
    const step = e.shiftKey ? 10 : 1;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (nudge && el) updateElement(el.id, { x: el.x + nudge[0], y: el.y + nudge[1] });
    else if ((e.key === 'Delete' || e.key === 'Backspace') && el) {
      onChange({ elements: elements.filter((x) => x.id !== el.id) });
      onSelect(null);
    } else if (e.key === 'Enter') startEditing(selectedId);
    else if (e.key === 'Escape') onSelect(null);
    else return;
    // Handled here: keep the slide navigation / end-show shortcuts from also acting on it.
    e.preventDefault();
    e.stopPropagation();
  };

  const editorStyle = (id: string): CSSProperties => {
    if (id === SLIDE_TEXT) {
      return {
        fontFamily: theme.fontFamily, fontSize: theme.fontSize * k, fontWeight: theme.fontWeight, color: theme.color,
        textAlign: theme.align, lineHeight: theme.lineHeight,
      };
    }
    const el = elements.find((e) => e.id === id)!;
    const size = el.paragraphs?.find((p) => p.text.trim())?.fontSize ?? el.fontSize ?? 64;
    return {
      fontFamily: el.fontFamily, fontSize: size * k, fontWeight: el.bold ? 700 : 400, fontStyle: el.italic ? 'italic' : undefined,
      color: el.color ?? '#ffffff', textAlign: el.align ?? 'center', lineHeight: 1.2,
    };
  };
  const at = (b: Box): CSSProperties => ({ left: b.x * k, top: b.y * k, width: b.w * k, height: b.h * k });
  const hasSlideText = !!(slide.text.trim() || slide.title || slide.subtext);

  return (
    <div className="ce-root" ref={ref} tabIndex={0} onKeyDown={onKeyDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onPointerDown={() => { if (editing) stopEditing(); onSelect(null); }}>
      <SlideCanvas slide={shown} theme={baseTheme} background={background} bgEffect={bgEffect} />
      <div className="ce-overlay">
        {hasSlideText && (
          <div className={`ce-box slide-text ${selectedId === SLIDE_TEXT ? 'on' : ''}`} style={at(textBox)}
            title="클릭: 선택 · 두 번 클릭: 바로 입력"
            onPointerDown={(e) => { e.stopPropagation(); if (editing && editing !== SLIDE_TEXT) stopEditing(); if (selectedId === SLIDE_TEXT && e.detail >= 2) startEditing(SLIDE_TEXT); else onSelect(SLIDE_TEXT); }}
            onDoubleClick={() => startEditing(SLIDE_TEXT)} />
        )}
        {elements.map((el) => (
          <div key={el.id} className={`ce-box ${el.kind} ${selectedId === el.id ? 'on' : ''}`} style={at(boxOf(el))}
            title={el.kind === 'text' ? '클릭: 선택 · 드래그: 이동 · 두 번 클릭: 바로 입력' : '클릭: 선택 · 드래그: 이동 · 모서리: 크기'}
            onPointerDown={(e) => onPointerDown(e, el.id, 'move')} onDoubleClick={() => startEditing(el.id)}>
            {selectedId === el.id && !editing && <span className="ce-handle" onPointerDown={(e) => onPointerDown(e, el.id, 'resize')} />}
          </div>
        ))}
        {editing && (
          <textarea className="ce-typing" autoFocus value={draft} style={{ ...at(editing === SLIDE_TEXT ? textBox : boxOf(elements.find((e) => e.id === editing)!)), ...editorStyle(editing) }}
            onChange={(e) => type(e.target.value)} onBlur={stopEditing} onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); stopEditing(); } }} />
        )}
      </div>
    </div>
  );
}
