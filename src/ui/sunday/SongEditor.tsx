import { useMemo, useState, type Dispatch } from 'react';
import type { Action } from '../../domain/reducer';
import type { Library, Presentation } from '../../domain/types';
import { songToPresentation, findSong, type SongSection } from '../../domain/sunday/songs';
import { planSectionSlides } from '../../domain/sunday/slidePlanner';
import { deleteSharedSong, registerSharedSong } from '../../domain/online';
import { uid } from '../../domain/lyrics';

interface Part { id: string; label: string; text: string }

const ADMIN_KEY = 'freecast.adminPassword';
const readAdmin = () => {
  try {
    return sessionStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
};

/** A song's parts for editing: its source as written, else rebuilt from its slides (each slide break a blank line). */
function partsOf(song: Presentation | null): Part[] {
  if (song?.songSource?.sections.length) return song.songSource.sections.map((s) => ({ id: uid('pt'), label: s.label, text: s.lines.join('\n') }));
  const parts: Part[] = [];
  for (const s of song?.slides ?? []) {
    if (s.group === 'Title' || !s.text.trim()) continue;
    const last = parts[parts.length - 1];
    if (last && last.label === s.group) last.text += `\n\n${s.text}`;
    else parts.push({ id: uid('pt'), label: s.group, text: s.text });
  }
  return parts.length ? parts : [{ id: uid('pt'), label: 'V1', text: '' }];
}

const orderOf = (song: Presentation | null) => song?.songSource?.order ?? song?.meta?.order ?? [];

/**
 * 찬양 편집 · 등록, the way the ppt site's song card works: title, key, 진행 (I-V1-C-…), and the
 * lyrics by part — a line break is the next line, a blank line starts the next slide; each part is
 * split into slides of up to 4 lines (6 lines → 3 + 3). Saves to this computer, or registers the
 * song in the church's shared 찬양 라이브러리 (관리자 password, the same library the ppt site uses).
 */
export function SongEditor({ library, dispatch, song, onClose, notify, reloadOnline }: {
  library: Library; dispatch: Dispatch<Action>; song: Presentation | null; onClose: () => void; notify: (m: string) => void; reloadOnline: () => void;
}) {
  const [title, setTitle] = useState(song?.title ?? '');
  const [key, setKey] = useState(song?.meta?.key ?? '');
  const [order, setOrder] = useState(orderOf(song).join('-'));
  const [parts, setParts] = useState<Part[]>(() => partsOf(song));
  const [admin, setAdmin] = useState(readAdmin);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const per = library.sunday.linesPerSlide;

  const sections: SongSection[] = parts.map((p) => ({ label: p.label.trim() || 'V', lines: p.text.split('\n') }));
  const tokens = order.split(/[-–,\s]+/).map((t) => t.trim()).filter(Boolean);
  const plan = useMemo(() => planSectionSlides(sections, tokens.length ? tokens : undefined, per), [JSON.stringify(sections), order, per]); // eslint-disable-line react-hooks/exhaustive-deps
  const slideCount = plan.reduce((n, p) => n + p.slides.length, 0);
  const valid = !!title.trim() && slideCount > 0;

  const setPart = (id: string, patch: Partial<Part>) => setParts((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const entry = () => ({ title: title.trim(), key: key.trim() || undefined, sections: sections.map((s) => ({ ...s, lines: s.lines.map((l) => l.trimEnd()) })), order: tokens });

  /** This computer's copy (online songs become a local song of the same title). */
  const saveLocal = () => {
    const e = entry();
    const p = songToPresentation({ title: e.title, key: e.key, sections: e.sections, progression: tokens.length ? tokens : undefined }, { themeId: 'theme_sunday', linesPerSlide: per, folder: song && !song.online ? song.folder ?? 'Songs' : 'Songs' });
    const withSource = { ...p, songSource: { sections: e.sections, order: tokens.length ? tokens : undefined } };
    const local = song && !song.online ? song : library.presentations.find((x) => !x.online && x.title === e.title) ?? null;
    const { id: _newId, ...patch } = withSource;
    if (local) dispatch({ type: 'presentation/update', id: local.id, patch: { ...patch, templateKey: undefined } });
    else dispatch({ type: 'presentation/createMany', presentations: [withSource] });
    notify(`“${e.title}”을(를) 이 컴퓨터에 저장했습니다 — 슬라이드 ${slideCount}장`);
    onClose();
  };

  const withAdmin = async (label: string, job: () => Promise<void>) => {
    if (!admin) return setError('관리자 비밀번호를 입력하세요 (주일예배 생성기 관리자 설정과 같은 비밀번호).');
    setBusy(label);
    setError(null);
    try {
      await job();
      try {
        sessionStorage.setItem(ADMIN_KEY, admin);
      } catch {
        // private window: ask again next time
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
      return;
    }
    setBusy(null);
    reloadOnline();
    onClose();
  };

  const register = () => withAdmin('등록 중…', async () => {
    await registerSharedSong(entry(), admin);
    notify(`“${title.trim()}”을(를) 교회 찬양 라이브러리에 등록했습니다 — 주일예배 생성기와 모든 컴퓨터에서 보입니다`);
  });
  const remove = () => {
    if (!song || !confirm(`교회 찬양 라이브러리에서 “${song.title}”을(를) 삭제할까요? 모든 컴퓨터와 주일예배 생성기에서 사라집니다.`)) return;
    withAdmin('삭제 중…', async () => {
      await deleteSharedSong(song.title, admin);
      notify(`“${song.title}”을(를) 교회 찬양 라이브러리에서 삭제했습니다`);
    });
  };
  const duplicate = !song && title.trim() && findSong(library.presentations, title.trim());

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal song-editor" role="dialog" aria-label="찬양 편집">
        <header className="modal-head">
          <h2>🎵 {song ? '찬양 편집' : '새 찬양 등록'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="song-editor-body">
          <div className="stack song-editor-form">
            <div className="row gap-s">
              <label className="stack grow">제목<input autoFocus={!song} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="찬양 제목" /></label>
              <label className="stack" style={{ width: 80 }}>Key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="G" /></label>
            </div>
            {duplicate && <p className="muted small">라이브러리에 같은 제목의 찬양이 이미 있습니다 — 등록하면 그 찬양을 바꿉니다.</p>}
            <label className="stack">진행 <span className="muted small">(예: I-V1-V2-PC-C-B-C · 각 파트는 한 번씩, 처음 나오는 순서대로 슬라이드가 됩니다)</span>
              <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="I-V1-C-V2-C-B-C" />
            </label>
            <p className="hint">한 슬라이드에 최대 {per}줄. 줄바꿈은 다음 줄, <b>빈 줄은 다음 슬라이드</b>입니다. 6줄이면 3줄 + 3줄로 나눕니다.</p>
            {parts.map((p, i) => (
              <div key={p.id} className="song-part">
                <div className="row gap-xs">
                  <input className="song-part-label" value={p.label} onChange={(e) => setPart(p.id, { label: e.target.value })} title="파트 (V1, V2, PC, C, B, I, T …)" />
                  <span className="grow" />
                  <button className="mini-btn" disabled={i === 0} onClick={() => setParts((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}>▲</button>
                  <button className="mini-btn" disabled={i === parts.length - 1} onClick={() => setParts((l) => { const n = [...l]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; return n; })}>▼</button>
                  <button className="mini-btn" onClick={() => setParts((l) => l.filter((x) => x.id !== p.id))}>✕</button>
                </div>
                <textarea rows={Math.max(3, p.text.split('\n').length + 1)} value={p.text} onChange={(e) => setPart(p.id, { text: e.target.value })} placeholder="가사 (빈 줄 = 다음 슬라이드)" />
              </div>
            ))}
            <button onClick={() => setParts((l) => [...l, { id: uid('pt'), label: ['V1', 'C', 'V2', 'B', 'PC', 'T'][l.length] ?? `P${l.length + 1}`, text: '' }])}>＋ 파트 추가</button>
          </div>
          <div className="song-editor-preview">
            <div className="muted small">미리보기 · 제목 슬라이드 + 가사 슬라이드 {slideCount}장</div>
            <div className="song-preview-slide title">{title || '제목'}</div>
            {plan.flatMap((part) => part.slides.map((lines, k) => (
              <div key={`${part.section.label}-${k}`} className="song-preview-slide">
                <span className="song-preview-label">{part.section.label}</span>
                {lines.map((l, j) => <div key={j}>{l}</div>)}
              </div>
            )))}
          </div>
        </div>
        <footer className="song-editor-foot">
          {error && <div className="warn">{error}</div>}
          <label className="row gap-xs muted small">관리자 비밀번호
            <input type="password" value={admin} onChange={(e) => setAdmin(e.target.value)} autoComplete="off" style={{ width: 150 }} />
          </label>
          <span className="grow" />
          {song?.online && <button className="danger" disabled={!!busy} onClick={remove}>라이브러리에서 삭제</button>}
          <button disabled={!valid || !!busy} onClick={saveLocal}>이 컴퓨터에만 저장</button>
          <button className="primary" disabled={!valid || !!busy} onClick={register}>{busy ?? '교회 찬양 라이브러리에 등록'}</button>
        </footer>
      </div>
    </div>
  );
}
