import { useMemo } from 'react';
import type { RetreatLook, Slide, Theme } from '../domain/types';
import { MOTION_STYLES, motionBackground, motionFallback, withAuto, withStyle, withTheme } from '../domain/motion';
import { SlideCanvas } from './SlideCanvas';

const COLOR_LABELS = ['바탕', '포인트', '밝은 빛'];

/**
 * Edits the 수련회 moving background: the theme text picks a look by its words (자동), and the style,
 * colours, speed and darkness can be set by hand. Used in the 수련회 builder and in 수련회 배경.
 */
export function RetreatLookEditor({ look, theme, onChange, showTheme = true }: { look: RetreatLook; theme: Theme; onChange: (look: RetreatLook) => void; showTheme?: boolean }) {
  const sample = useMemo<Slide>(() => ({ id: 'retreat-look-sample', group: 'Title', text: look.theme.trim() || '수련회 주제', subtext: '움직이는 배경 미리보기' }), [look.theme]);
  const background = motionBackground(look.style, look.colors, look.speed);
  const set = (patch: Partial<RetreatLook>) => onChange({ ...look, ...patch });
  return (
    <div className="retreat-look">
      <div className="retreat-look-controls stack">
        {showTheme && <label className="stack">수련회 주제 (theme)
          <input value={look.theme} placeholder="예: 빛으로 나아가라 · 광야에서 만난 하나님" onChange={(e) => onChange(withTheme(look, e.target.value))} />
        </label>}
        <label className="row gap-xs"><input type="checkbox" checked={look.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> 움직이는 배경 사용</label>
        <label className="row gap-xs"><input type="checkbox" checked={look.auto} onChange={(e) => onChange(withAuto(look, e.target.checked))} /> 주제에 맞춰 자동으로 고르기</label>
        <div className="motion-styles" role="radiogroup" aria-label="배경 종류">
          {MOTION_STYLES.map((s) => (
            <button key={s.id} role="radio" aria-checked={look.style === s.id} className={look.style === s.id ? 'motion-style on' : 'motion-style'} title={s.hint}
              onClick={() => onChange(withStyle(look, s.id))}>
              <span className="motion-style-swatch" style={{ background: motionFallback(motionBackground(s.id)) }} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
        <div className="row gap-s wrap">
          {COLOR_LABELS.map((label, i) => (
            <label key={label} className="stack small">{label}
              <input type="color" value={look.colors[i]} onChange={(e) => set({ auto: false, colors: look.colors.map((c, k) => (k === i ? e.target.value : c)) })} />
            </label>
          ))}
          <button title="이 종류의 기본 색으로" onClick={() => onChange(withStyle(look, look.style))}>색 되돌리기</button>
        </div>
        <label className="row gap-s">속도 <input type="range" min={0.25} max={3} step={0.05} value={look.speed} onChange={(e) => set({ speed: Number(e.target.value) })} /> <span className="muted small">{look.speed.toFixed(2)}×</span></label>
        <label className="row gap-s">가사가 잘 보이게 어둡게 <input type="range" min={0} max={0.9} step={0.05} value={look.dim} onChange={(e) => set({ dim: Number(e.target.value) })} /> <span className="muted small">{Math.round(look.dim * 100)}%</span></label>
        <p className="hint">{look.auto ? '주제에 들어 있는 낱말(빛, 바다, 불, 별, 생명, 은혜 …)을 보고 어울리는 배경을 고릅니다. 직접 종류나 색을 바꾸면 자동이 꺼집니다.' : '직접 고른 배경입니다. 자동을 켜면 주제에 맞춰 다시 고릅니다.'}</p>
      </div>
      <div className="retreat-look-preview">
        {look.enabled
          ? <SlideCanvas slide={sample} theme={theme} background={background} bgEffect={{ dim: look.dim, blur: 0 }} animate />
          : <div className="retreat-look-off">움직이는 배경을 쓰지 않습니다</div>}
      </div>
    </div>
  );
}
