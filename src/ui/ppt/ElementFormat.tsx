import { useRef } from 'react';
import type { MediaFit, SlideElement } from '../../domain/types';
import { putMedia } from '../../domain/media';
import { uid } from '../../domain/lyrics';
import { CANVAS_H, CANVAS_W } from '../../domain/canvas';
import { TextFormatPanel, type TextFormatValue } from './TextFormatPanel';
import { changeCase } from '../../domain/textFormat';
import { AutoTextarea } from '../AutoTextarea';

const KIND: Record<string, string> = { text: '텍스트 상자', image: '그림', shape: '도형', video: '동영상', camera: '카메라' };

/** The size a text box shows (its first real line's size when lines are styled one by one). */
export const sizeOf = (el: SlideElement) => el.paragraphs?.find((p) => p.text.trim())?.fontSize ?? el.fontSize ?? 64;

/** What the format panel shows for a text box. */
export const textValue = (el: SlideElement): TextFormatValue => ({
  fontFamily: el.fontFamily, fontSize: sizeOf(el), bold: !!el.bold, italic: !!el.italic, underline: !!el.underline, strike: !!el.strike,
  shadow: !!el.shadow, letterSpacing: el.letterSpacing ?? 0, color: (el.paragraphs?.find((p) => p.text.trim())?.color ?? el.color ?? '#ffffff').slice(0, 7),
  highlight: el.highlight, align: el.align ?? 'center', vAlign: el.vAlign ?? 'middle', lineHeight: el.lineHeight ?? (el.paragraphs ? 1.2 : 1.25),
  list: el.list, indent: el.indent ?? 0, columns: el.columns ?? 1, vertical: !!el.vertical, autoFit: el.autoFit !== false,
});

/** A panel edit as a change to the element; a size becomes a scale of the box's own size (`from` = the size the panel showed). */
export const elementPatch = (el: SlideElement, { fontSize, ...rest }: Partial<TextFormatValue>, from = sizeOf(el)): Partial<SlideElement> =>
  ({ ...rest, ...(fontSize === undefined ? {} : { fontSize: fontSize * (el.fontSize ?? sizeOf(el)) / from }) });

export const CLEAR_TEXT_FORMAT: Partial<SlideElement> = { bold: false, italic: false, underline: undefined, strike: undefined, shadow: false, letterSpacing: undefined, highlight: undefined, list: undefined, indent: undefined, columns: undefined, vertical: undefined, lineHeight: undefined };

/**
 * Settings of the object selected on the slide, in the right-hand panel: its text, font, size,
 * colours, alignment, position and size, order on the slide — changes show at once.
 */
export function ElementFormat({ el, onChange, onDelete, onOrder, addMedia }: {
  el: SlideElement;
  onChange: (patch: Partial<SlideElement>) => void;
  onDelete: () => void;
  onOrder: (where: 'front' | 'back') => void;
  addMedia: (m: { id: string; name: string; type: 'image' }) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const num = (k: 'x' | 'y' | 'w' | 'h') => (
    <label className="ef-num">{({ x: 'X', y: 'Y', w: '너비', h: '높이' })[k]}
      <input type="number" step={1} value={Math.round(el[k])} onChange={(e) => onChange({ [k]: Number(e.target.value) } as Partial<SlideElement>)} />
    </label>
  );
  const replaceImage = async (file: File | undefined) => {
    if (!file) return;
    const id = uid('m');
    await putMedia(id, file);
    addMedia({ id, name: file.name, type: 'image' });
    onChange({ mediaId: id });
  };

  return (
    <div className="element-format">
      <div className="ef-head">
        <b>선택한 개체 · {KIND[el.kind] ?? el.kind}</b>
        <span className="grow" />
        <button className="mini-btn" title="맨 앞으로" onClick={() => onOrder('front')}>⬆ 앞</button>
        <button className="mini-btn" title="맨 뒤로" onClick={() => onOrder('back')}>⬇ 뒤</button>
        <button className="mini-btn danger" title="삭제 (Delete)" onClick={onDelete}>🗑</button>
      </div>

      {el.kind === 'text' && (
        <>
          <label className="stack">텍스트<AutoTextarea rows={Math.min(8, Math.max(2, (el.text ?? '').split('\n').length))} value={el.text ?? ''} onChange={(e) => onChange({ text: e.target.value })} /></label>
          <button onClick={() => onChange({ maximizeFont: true })}>상자 안 최대 크기</button>
          <TextFormatPanel
            value={textValue(el)}
            onChange={(patch) => onChange(elementPatch(el, patch))}
            onChangeCase={(kind) => onChange({ text: changeCase(el.text ?? '', kind) })}
            onClear={() => onChange(CLEAR_TEXT_FORMAT)}
          />
        </>
      )}

      {(el.kind === 'image' || el.kind === 'video') && (
        <div className="row gap-xs wrap">
          <select value={el.fit ?? 'contain'} onChange={(e) => onChange({ fit: e.target.value as MediaFit })} title="맞춤">
            <option value="fill">늘려서 채우기</option>
            <option value="contain">비율 유지 (전체)</option>
            <option value="cover">비율 유지 (꽉 차게)</option>
          </select>
          {el.kind === 'image' && <button onClick={() => fileRef.current?.click()}>그림 바꾸기…</button>}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { replaceImage(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}

      {el.kind === 'shape' && (
        <div className="row gap-xs wrap">
          <label className="fmt-color" title="채우기"><input type="color" value={(el.fill ?? '#ffffff').slice(0, 7)} onChange={(e) => onChange({ fill: e.target.value })} />채우기</label>
          <label className="fmt-color" title="테두리"><input type="color" value={(el.stroke ?? '#000000').slice(0, 7)} onChange={(e) => onChange({ stroke: e.target.value })} />테두리</label>
          <button className="mini-btn" onClick={() => onChange({ stroke: undefined })}>테두리 없음</button>
          <label className="check small"><input type="checkbox" checked={!!el.ellipse} onChange={(e) => onChange({ ellipse: e.target.checked })} /> 원</label>
        </div>
      )}

      <label className="ef-range">투명도<input type="range" min={0.1} max={1} step={0.05} value={el.opacity ?? 1} onChange={(e) => onChange({ opacity: Number(e.target.value) })} /></label>
      <div className="ef-grid">{num('x')}{num('y')}{num('w')}{num('h')}</div>
      <div className="row gap-xs">
        <button className="mini-btn" onClick={() => onChange({ x: Math.round((CANVAS_W - el.w) / 2) })}>가로 가운데</button>
        <button className="mini-btn" onClick={() => onChange({ y: Math.round((CANVAS_H - el.h) / 2) })}>세로 가운데</button>
      </div>
    </div>
  );
}
