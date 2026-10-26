import { useMemo } from 'react';
import { stageLines } from '../domain/chordChart';

/** Lyrics with each chord drawn exactly over the word it belongs to (any font, Korean or English). */
export function StageChords({ text, show }: { text: string; show: (chord: string) => string }) {
  const lines = useMemo(() => stageLines(text, show), [text, show]);
  return (
    <div className="stage-chords">
      {lines.map((line, i) => (
        <div className="chart-line" key={i}>
          {line.segments.length
            ? line.segments.map((seg, n) => <span className="chart-seg" key={n}><span className="chart-chord">{seg.chord || ' '}</span><span className="chart-words">{seg.text || ' '}</span></span>)
            : ' '}
        </div>
      ))}
    </div>
  );
}
