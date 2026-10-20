import { useEffect, useRef, useState } from 'react';

const PRESETS = [20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96, 110, 128, 150];

/**
 * Font size, PowerPoint-style: pick a size from the list, step by 1 with − / +, or double-click the
 * number to type any size.
 */
export function FontSize({ value, onChange, min = 6, max = 400 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState(String(Math.round(value)));
  const input = useRef<HTMLInputElement>(null);
  const shown = Math.round(value * 10) / 10;
  useEffect(() => setText(String(shown)), [shown]);
  useEffect(() => {
    if (typing) input.current?.select();
  }, [typing]);
  const set = (n: number) => {
    if (!Number.isFinite(n)) return;
    onChange(Math.min(max, Math.max(min, Math.round(n))));
  };
  const commit = () => {
    setTyping(false);
    set(Number(text));
  };
  return (
    <span className="font-size" title="글꼴 크기 — 두 번 클릭하면 숫자를 직접 입력합니다">
      <button type="button" className="fs-step" onClick={() => set(shown - 1)} aria-label="1 작게">−</button>
      {typing ? (
        <input ref={input} className="fs-input" type="number" step={1} min={min} max={max} value={text}
          onChange={(e) => setText(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setText(String(shown)); setTyping(false); } }} />
      ) : (
        <select className="fs-select" value={shown} onChange={(e) => set(Number(e.target.value))} onDoubleClick={() => setTyping(true)}>
          {[...new Set([...PRESETS, shown])].sort((a, b) => a - b).map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      <button type="button" className="fs-step" onClick={() => set(shown + 1)} aria-label="1 크게">+</button>
      {!typing && <button type="button" className="fs-type" onClick={() => setTyping(true)} title="숫자로 입력">✎</button>}
    </span>
  );
}
