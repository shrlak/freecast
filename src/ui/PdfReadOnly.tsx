import type { Slide } from '../domain/types';
import { PDF_READ_ONLY } from '../domain/importedSlides';
import { AutoTextarea } from './AutoTextarea';

export function PdfReadOnly({ slide, onChange }: { slide: Slide; onChange: (patch: Partial<Slide>) => void }) {
  return <div className="stack"><p className="hint" role="note">{PDF_READ_ONLY}</p>
    <label>슬라이드 노트<AutoTextarea aria-label="슬라이드 노트" rows={3} value={slide.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value || undefined })} /></label>
  </div>;
}
