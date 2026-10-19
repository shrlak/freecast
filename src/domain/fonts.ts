// Fonts offered in the editor. Korean text falls back to the system Korean font when a
// Latin-only font (Arial, Calibri) is chosen. 나눔고딕 ships with the app (SIL OFL); Calibri and
// Arial are used from the computer when installed, otherwise their metric-compatible free twins
// (Carlito, Arimo), which are bundled.
const KO = '"Apple SD Gothic Neo", "Malgun Gothic", "Nanum Gothic", sans-serif';

export interface FontOption {
  label: string;
  family: string;
  /** Font name written into exported PowerPoint files. */
  pptx: string;
}

export const FONT_OPTIONS: FontOption[] = [
  { label: '나눔고딕', family: '"Nanum Gothic", NanumGothic, "나눔고딕", sans-serif', pptx: '나눔고딕' },
  { label: 'Arial', family: `Arial, Arimo, ${KO}`, pptx: 'Arial' },
  { label: 'Calibri', family: `Calibri, Carlito, ${KO}`, pptx: 'Calibri' },
  { label: 'Sans (기본)', family: 'Inter, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Helvetica, Arial, sans-serif', pptx: 'Malgun Gothic' },
  { label: 'Serif (명조)', family: 'Georgia, "Nanum Myeongjo", "AppleMyungjo", "Times New Roman", serif', pptx: 'Batang' },
  { label: 'Heavy', family: '"Arial Black", Impact, Inter, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", Helvetica, Arial, sans-serif', pptx: 'Arial Black' },
  { label: 'Mono', family: '"Courier New", monospace', pptx: 'Courier New' },
];

/** PowerPoint font name for a CSS font-family stack. */
export function pptxFont(family: string): string {
  const known = FONT_OPTIONS.find((f) => f.family === family);
  if (known) return known.pptx;
  const first = family.split(',')[0].replace(/"/g, '').trim();
  return first === 'Nanum Gothic' ? '나눔고딕' : first;
}
