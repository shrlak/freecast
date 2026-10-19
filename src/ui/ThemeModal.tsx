import { useState, type Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Background, Theme } from '../domain/types';
import { uid } from '../domain/lyrics';
import { SlideCanvas } from './SlideCanvas';
import { FONT_OPTIONS } from '../domain/fonts';

interface Props {
  themes: Theme[];
  initialId: string;
  background: Background | null;
  dispatch: Dispatch<Action>;
  onClose: () => void;
}

const FONTS = FONT_OPTIONS.map((f) => [f.family, f.label] as const);

export function ThemeModal({ themes, initialId, background, dispatch, onClose }: Props) {
  const [id, setId] = useState(initialId);
  const theme = themes.find((t) => t.id === id) ?? themes[0];
  const set = <K extends keyof Theme>(key: K, value: Theme[K]) => dispatch({ type: 'theme/upsert', theme: { ...theme, [key]: value } });

  const duplicate = () => {
    const copy = { ...theme, id: uid('theme'), name: `${theme.name} copy` };
    dispatch({ type: 'theme/upsert', theme: copy });
    setId(copy.id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Themes">
        <header className="modal-head">
          <h2>Themes</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="theme-body">
          <ul className="list theme-list">
            {themes.map((t) => (
              <li key={t.id} className={`list-item ${t.id === theme.id ? 'selected' : ''}`} onClick={() => setId(t.id)}>
                {t.name}
              </li>
            ))}
            <li className="row gap-xs pad-s">
              <button onClick={duplicate}>Duplicate</button>
              <button
                className="danger"
                disabled={themes.length <= 1}
                onClick={() => {
                  dispatch({ type: 'theme/delete', id: theme.id });
                  setId(themes.find((t) => t.id !== theme.id)!.id);
                }}
              >
                Delete
              </button>
            </li>
          </ul>
          <div className="theme-form">
            <label>Name<input value={theme.name} onChange={(e) => set('name', e.target.value)} /></label>
            <label>Font
              <select value={theme.fontFamily} onChange={(e) => set('fontFamily', e.target.value)}>
                {FONTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
              </select>
            </label>
            <label>Size <span className="muted">{theme.fontSize}px</span>
              <input type="range" min={28} max={180} value={theme.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} />
            </label>
            <label>Weight
              <select value={theme.fontWeight} onChange={(e) => set('fontWeight', Number(e.target.value))}>
                {[300, 400, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </label>
            <label>Line height <span className="muted">{theme.lineHeight.toFixed(2)}</span>
              <input type="range" min={0.9} max={2} step={0.05} value={theme.lineHeight} onChange={(e) => set('lineHeight', Number(e.target.value))} />
            </label>
            <label>Margin <span className="muted">{theme.padding}px</span>
              <input type="range" min={0} max={400} step={10} value={theme.padding} onChange={(e) => set('padding', Number(e.target.value))} />
            </label>
            <label>Colour<input type="color" value={theme.color} onChange={(e) => set('color', e.target.value)} /></label>
            <label>Second-line colour<input type="color" value={theme.subColor ?? theme.color} onChange={(e) => set('subColor', e.target.value)} /></label>
            <label>Second-line size <span className="muted">{Math.round((theme.subScale ?? 0.62) * 100)}%</span>
              <input type="range" min={0.3} max={1} step={0.02} value={theme.subScale ?? 0.62} onChange={(e) => set('subScale', Number(e.target.value))} />
            </label>
            <label>Horizontal
              <select value={theme.align} onChange={(e) => set('align', e.target.value as Theme['align'])}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </label>
            <label>Vertical
              <select value={theme.vAlign} onChange={(e) => set('vAlign', e.target.value as Theme['vAlign'])}>
                <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={theme.shadow} onChange={(e) => set('shadow', e.target.checked)} /> Text shadow</label>
            <label className="check"><input type="checkbox" checked={theme.uppercase} onChange={(e) => set('uppercase', e.target.checked)} /> All caps</label>
            <label className="check"><input type="checkbox" checked={theme.autoFit !== false} onChange={(e) => set('autoFit', e.target.checked)} /> Shrink text to fit</label>
            <label>Outline <span className="muted">{theme.strokeWidth ?? 0}px</span>
              <div className="row gap-xs">
                <input type="range" min={0} max={12} value={theme.strokeWidth ?? 0} onChange={(e) => set('strokeWidth', Number(e.target.value))} />
                <input type="color" value={theme.strokeColor ?? '#000000'} onChange={(e) => set('strokeColor', e.target.value)} />
              </div>
            </label>
            <label>Glow
              <div className="row gap-xs">
                <input type="color" value={theme.glowColor ?? '#000000'} onChange={(e) => set('glowColor', e.target.value)} />
                <button type="button" className="mini-btn" onClick={() => set('glowColor', undefined)}>none</button>
              </div>
            </label>
            <label>Gradient fill
              <select value={theme.gradient ?? ''} onChange={(e) => set('gradient', e.target.value || undefined)}>
                <option value="">None (solid colour)</option>
                <option value="linear-gradient(180deg,#ffffff,#fde68a)">White → gold</option>
                <option value="linear-gradient(180deg,#ffffff,#93c5fd)">White → sky</option>
                <option value="linear-gradient(90deg,#f472b6,#a78bfa,#60a5fa)">Pink → violet → blue</option>
                <option value="linear-gradient(180deg,#fef3c7,#f59e0b)">Warm gold</option>
              </select>
            </label>
          </div>
          <div className="theme-preview">
            <SlideCanvas slide={{ id: 'preview', group: '', text: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!', subtext: '놀라운 은혜 그 얼마나 귀한지' }} theme={theme} background={background} />
            <p className="hint">Changes apply instantly, including to the live output.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
