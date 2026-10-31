import { MixerPanel } from './MixerPanel';

/** 슬라이드 쇼 → X32 믹서: the Mixer outside the slide show, in its own window. */
export function MixerModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal mixer-modal" role="dialog" aria-modal="true" aria-label="X32 믹서" onKeyDown={(e) => { if (e.key === 'Escape' && !document.querySelector('.x32-strip-modal')) onClose(); }}>
        <header className="modal-head">
          <h2>🎚 X32 믹서</h2>
          <button autoFocus aria-label="닫기" onClick={onClose}>✕</button>
        </header>
        <div className="feature-scroll"><MixerPanel /></div>
      </section>
    </div>
  );
}
