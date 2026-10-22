import { useEffect, useRef, useState } from 'react';

/** Electron does not implement window.prompt; use the same accessible form in desktop and web. */
export function NameDialog({ title, initialValue, onSave, onClose }: {
  title: string; initialValue: string; onSave: (name: string) => string | void; onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    input.current?.focus(); input.current?.select();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <form ref={form} className="modal name-dialog" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
        if (e.key === 'Tab') {
          const controls = form.current?.querySelectorAll<HTMLElement>('input, button:not(:disabled)');
          const first = controls?.[0], last = controls?.[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }} onSubmit={(e) => {
        e.preventDefault();
        const name = value.trim();
        if (!name) return setError('이름을 입력하세요.');
        const message = onSave(name);
        if (message) setError(message); else onClose();
      }}>
      <header className="modal-head"><h2>{title}</h2><button type="button" onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack"><label className="stack">이름<input ref={input} maxLength={120} value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="row"><button type="button" onClick={onClose}>취소</button><button className="primary" type="submit" disabled={!value.trim()}>저장</button></div>
      </div>
    </form>
  </div>;
}
