import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { holdToConfirm } from '../domain/holdToConfirm';

export function HoldToEndButton({ disabled, onConfirm }: { disabled: boolean; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const latest = useRef({ disabled, onConfirm }); latest.current = { disabled, onConfirm };
  const description = useId();
  const gesture = useMemo(() => holdToConfirm(() => latest.current.onConfirm(), setHolding,
    () => !latest.current.disabled && document.visibilityState !== 'hidden'), []);
  const pointer = useRef<number | null>(null);
  const key = useRef<string | null>(null);
  const cancel = () => { gesture.cancel(); pointer.current = null; key.current = null; };
  useEffect(() => { if (disabled) cancel(); }, [disabled]);
  useEffect(() => {
    const blur = () => cancel();
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('blur', blur); document.addEventListener('visibilitychange', visibility);
    return () => { gesture.dispose(); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); };
  }, [gesture]);
  return <>
    <button className={`remote-end hold-to-end${holding ? ' holding' : ''}`} aria-label="End slideshow" aria-describedby={description}
      title="발표 종료: 1초간 길게 누르세요" disabled={disabled}
      onClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || pointer.current !== null || key.current) return;
        e.preventDefault(); pointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); gesture.start();
      }}
      onPointerMove={(e) => {
        if (e.pointerId !== pointer.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) cancel();
      }}
      onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel} onPointerLeave={cancel} onBlur={cancel}
      onKeyDown={(e) => {
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        if (e.repeat || pointer.current !== null || key.current) return;
        key.current = e.key; gesture.start();
      }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); cancel(); } }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
      <span>{holding ? '계속 누르세요' : 'End · 1초'}</span>
    </button>
    <span id={description} className="hold-instructions">발표 종료는 버튼 또는 Space·Enter 키를 1초간 누르세요. 중간에 떼면 취소됩니다.</span>
  </>;
}
