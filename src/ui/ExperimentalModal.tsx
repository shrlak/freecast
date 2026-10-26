import { useState } from 'react';
import { FEATURES, loadFeatures, setFeature, type FeatureId } from '../domain/features';

/** 🧪 실험 기능: finished features that are still switched off until someone chooses to try them. */
export function ExperimentalModal({ onChange, onClose }: { onChange: () => void; onClose: () => void }) {
  const [on, setOn] = useState(loadFeatures);
  const toggle = (id: FeatureId, value: boolean) => { setFeature(id, value); setOn(loadFeatures()); onChange(); };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal" role="dialog" aria-label="실험 기능">
      <header className="modal-head"><h2>🧪 실험 기능</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <p className="hint">아직 기본으로 켜지 않은 기능입니다. 이 컴퓨터에서만 켜고 끌 수 있습니다.</p>
        {FEATURES.map((f) => <label key={f.id} className="check"><input type="checkbox" checked={on[f.id] === true} onChange={(e) => toggle(f.id, e.target.checked)} /> <span><strong>{f.label}</strong><br /><small className="muted">{f.detail}</small></span></label>)}
      </div>
    </div>
  </div>;
}
