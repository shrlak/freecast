import { useRef, useState, type Dispatch, type ReactNode } from 'react';
import type { Action, AppState } from '../../domain/reducer';
import type { Background, Presentation, Slide, SlideStyle, Theme } from '../../domain/types';
import { BACKGROUND_PRESETS } from '../../domain/defaults';
import { FONT_OPTIONS } from '../../domain/fonts';
import { putMedia } from '../../domain/media';
import { uid } from '../../domain/lyrics';
import { assetUrl, slideTheme } from '../SlideCanvas';
import { useMediaUrl } from '../hooks';
import { SlideInspector } from '../SlideInspector';
import { patchElement } from '../../domain/templates/convert';
import { ElementFormat } from './ElementFormat';
import { FontSize } from './FontSize';

interface Props {
  state: AppState;
  dispatch: Dispatch<Action>;
  presentation: Presentation;
  slide: Slide;
  onDesign: () => void;
  /** The object selected on the slide (CanvasEditor); its settings show first. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

function Section({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="fmt-section" open={open}>
      <summary>{title}</summary>
      <div className="fmt-body">{children}</div>
    </details>
  );
}

function MediaThumb({ id, video }: { id: string; video: boolean }) {
  const url = useMediaUrl(id);
  if (!url) return <span className="fmt-swatch-fill" />;
  return video ? <video className="fmt-swatch-fill" src={url} muted /> : <img className="fmt-swatch-fill" src={url} alt="" />;
}


/**
 * PowerPoint-style Format pane for one slide: text, font (나눔고딕 / Arial / Calibri…),
 * size, colour, bold/italic/underline, alignment, spacing and background — for this slide
 * only, with "apply to all slides".
 */
export function SlideFormat({ state, dispatch, presentation: p, slide, onDesign, selectedId, onSelect }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const base: Theme = state.library.themes.find((t) => t.id === p.themeId) ?? state.library.themes[0];
  const t = slideTheme(base, slide);
  const st = slide.style ?? {};
  const upd = (patch: Partial<Slide>) => dispatch({ type: 'slide/update', presentationId: p.id, slideId: slide.id, patch });
  const setStyle = (patch: SlideStyle) => {
    const next: SlideStyle = { ...st, ...patch };
    for (const k of Object.keys(next) as (keyof SlideStyle)[]) if (next[k] === undefined || next[k] === base[k as keyof Theme]) delete next[k];
    upd({ style: Object.keys(next).length ? next : undefined });
  };
  const flash = (msg: string) => {
    setApplied(msg);
    setTimeout(() => setApplied(null), 1800);
  };
  const applyToAll = (what: 'style' | 'background') => {
    const slides = p.slides.map((s) => (what === 'style' ? { ...s, style: slide.style } : { ...s, background: slide.background }));
    dispatch({ type: 'presentation/update', id: p.id, patch: { slides } });
    flash(what === 'style' ? '글꼴 서식을 모든 슬라이드에 적용했습니다' : '배경을 모든 슬라이드에 적용했습니다');
  };
  const setBg = (bg: Background | undefined) => upd({ background: bg });
  const uploadBg = async (file: File | undefined) => {
    if (!file) return;
    const id = uid('m');
    const type = file.type.startsWith('video/') ? 'video' : 'image';
    await putMedia(id, file);
    dispatch({ type: 'media/add', media: { id, name: file.name, type } });
    setBg({ kind: 'media', mediaId: id, mediaType: type, fit: 'cover' });
    if (fileRef.current) fileRef.current.value = '';
  };
  const bg = slide.background;
  const bgColor = bg?.kind === 'color' ? bg.value : '#000000';

  const selected = slide.elements?.find((e) => e.id === selectedId);
  const elements = slide.elements ?? [];
  return (
    <div className="slide-format">
      {applied && <div className="fmt-flash">✓ {applied}</div>}
      {selected ? (
        <ElementFormat
          el={selected}
          onChange={(patch) => upd({ elements: elements.map((e) => (e.id === selected.id ? patchElement(e, patch) : e)) })}
          onDelete={() => { upd({ elements: elements.filter((e) => e.id !== selected.id) }); onSelect?.(null); }}
          onOrder={(where) => {
            const rest = elements.filter((e) => e.id !== selected.id);
            upd({ elements: where === 'front' ? [...rest, selected] : [selected, ...rest] });
          }}
          addMedia={(m) => dispatch({ type: 'media/add', media: m })}
        />
      ) : (
        <p className="hint">슬라이드에서 글자 · 로고 · 그림 · 도형을 클릭하면 여기서 바로 바꿀 수 있습니다. 글자는 두 번 클릭하면 슬라이드 위에서 바로 입력됩니다.</p>
      )}
      <Section title="텍스트">
        <label>제목 (굵은 머리글)<input value={slide.title ?? ''} onChange={(e) => upd({ title: e.target.value || undefined })} /></label>
        <label>본문<textarea rows={5} value={slide.text} onChange={(e) => upd({ text: e.target.value })} /></label>
        <label>둘째 줄 (번역 등)<textarea rows={2} value={slide.subtext ?? ''} onChange={(e) => upd({ subtext: e.target.value || undefined })} /></label>
        <button onClick={onDesign}>✏️ 개체 편집 (텍스트 상자 · 그림 · 도형)</button>
      </Section>

      <Section title="글꼴">
        <div className="fmt-row">
          <select className="grow" value={FONT_OPTIONS.find((f) => f.family === t.fontFamily)?.family ?? ''} onChange={(e) => setStyle({ fontFamily: e.target.value || undefined })}>
            {!FONT_OPTIONS.some((f) => f.family === t.fontFamily) && <option value="">테마 글꼴</option>}
            {FONT_OPTIONS.map((f) => <option key={f.label} value={f.family} style={{ fontFamily: f.family }}>{f.label}</option>)}
          </select>
          <FontSize value={t.fontSize} onChange={(n) => setStyle({ fontSize: n })} />
        </div>
        <div className="fmt-row">
          <button className={`fmt-tog ${t.fontWeight >= 700 ? 'on' : ''}`} title="굵게" onClick={() => setStyle({ fontWeight: t.fontWeight >= 700 ? 400 : 700 })}><b>B</b></button>
          <button className={`fmt-tog ${t.italic ? 'on' : ''}`} title="기울임" onClick={() => setStyle({ italic: !t.italic })}><i>I</i></button>
          <button className={`fmt-tog ${t.underline ? 'on' : ''}`} title="밑줄" onClick={() => setStyle({ underline: !t.underline })}><u>U</u></button>
          <button className={`fmt-tog ${t.shadow ? 'on' : ''}`} title="그림자" onClick={() => setStyle({ shadow: !t.shadow })}>S</button>
          <button className={`fmt-tog ${t.uppercase ? 'on' : ''}`} title="대문자" onClick={() => setStyle({ uppercase: !t.uppercase })}>Aa</button>
          <label className="fmt-color" title="글자 색"><span style={{ background: t.color }} />A<input type="color" value={t.color} onChange={(e) => setStyle({ color: e.target.value })} /></label>
          <label className="fmt-color" title="둘째 줄 색"><span style={{ background: t.subColor ?? t.color }} />2<input type="color" value={t.subColor ?? t.color} onChange={(e) => setStyle({ subColor: e.target.value })} /></label>
        </div>
        <div className="fmt-row">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button key={a} className={`fmt-tog ${t.align === a ? 'on' : ''}`} title={{ left: '왼쪽 맞춤', center: '가운데 맞춤', right: '오른쪽 맞춤' }[a]} onClick={() => setStyle({ align: a })}>{{ left: '⇤', center: '≡', right: '⇥' }[a]}</button>
          ))}
          <span className="fmt-sep" />
          {(['top', 'middle', 'bottom'] as const).map((a) => (
            <button key={a} className={`fmt-tog ${t.vAlign === a ? 'on' : ''}`} title={{ top: '위쪽', middle: '가운데', bottom: '아래쪽' }[a]} onClick={() => setStyle({ vAlign: a })}>{{ top: '⤒', middle: '↕', bottom: '⤓' }[a]}</button>
          ))}
        </div>
        <label>줄 간격 <span className="muted">{t.lineHeight.toFixed(2)}</span><input type="range" min={0.9} max={2.2} step={0.05} value={t.lineHeight} onChange={(e) => setStyle({ lineHeight: Number(e.target.value) })} /></label>
        <label>여백 <span className="muted">{t.padding}px</span><input type="range" min={0} max={400} step={10} value={t.padding} onChange={(e) => setStyle({ padding: Number(e.target.value) })} /></label>
        <label>윤곽선 <span className="muted">{t.strokeWidth ?? 0}px</span>
          <div className="fmt-row"><input className="grow" type="range" min={0} max={12} value={t.strokeWidth ?? 0} onChange={(e) => setStyle({ strokeWidth: Number(e.target.value) })} /><input type="color" value={t.strokeColor ?? '#000000'} onChange={(e) => setStyle({ strokeColor: e.target.value })} /></div>
        </label>
        <div className="fmt-row">
          <button className="grow" onClick={() => applyToAll('style')}>모든 슬라이드에 적용</button>
          <button disabled={!slide.style} onClick={() => upd({ style: undefined })} title="테마 서식으로 되돌리기">초기화</button>
        </div>
      </Section>

      <Section title="배경">
        <div className="fmt-swatches">
          <button className={`fmt-swatch ${!bg ? 'on' : ''}`} title="프레젠테이션 배경 사용" onClick={() => setBg(undefined)}><span className="fmt-swatch-fill fmt-none">자동</span></button>
          {BACKGROUND_PRESETS.map((b) => (
            <button key={b.name} className="fmt-swatch" title={b.name} onClick={() => setBg(b.background)}>
              {b.background.kind === 'image' ? <img className="fmt-swatch-fill" src={assetUrl(b.background.url)} alt="" />
                : <span className="fmt-swatch-fill" style={b.background.kind === 'color' ? { background: b.background.value } : { backgroundImage: (b.background as { value: string }).value }} />}
            </button>
          ))}
          {state.library.media.filter((m) => m.type !== 'audio').map((m) => (
            <button key={m.id} className="fmt-swatch" title={m.name} onClick={() => setBg({ kind: 'media', mediaId: m.id, mediaType: m.type === 'video' ? 'video' : 'image', fit: 'cover' })}>
              <MediaThumb id={m.id} video={m.type === 'video'} />
            </button>
          ))}
        </div>
        <div className="fmt-row">
          <label className="fmt-color grow" title="단색 배경"><span style={{ background: bgColor }} />단색<input type="color" value={bgColor} onChange={(e) => setBg({ kind: 'color', value: e.target.value })} /></label>
          <button onClick={() => fileRef.current?.click()}>그림 · 동영상…</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={(e) => uploadBg(e.target.files?.[0])} />
        </div>
        {bg && (bg.kind === 'media' || bg.kind === 'image') && (
          <div className="fmt-row">
            <span className="muted">맞춤</span>
            <button className={`fmt-tog ${(bg.fit ?? 'cover') === 'cover' ? 'on' : ''}`} onClick={() => setBg({ ...bg, fit: 'cover' })}>채우기</button>
            <button className={`fmt-tog ${bg.fit === 'contain' ? 'on' : ''}`} onClick={() => setBg({ ...bg, fit: 'contain' })}>맞추기</button>
          </div>
        )}
        <button disabled={!bg} onClick={() => applyToAll('background')}>이 배경을 모든 슬라이드에 적용</button>
      </Section>

      <Section title="기타 (전환 · 동작 · 노트)" open={false}>
        <SlideInspector slide={slide} library={state.library} compact
          onChange={(patch) => upd(patch)} onDesign={onDesign} onClose={() => undefined} />
      </Section>
    </div>
  );
}
