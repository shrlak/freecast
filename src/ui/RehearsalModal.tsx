import { useEffect, useState, type MutableRefObject } from 'react';
import type { AppState } from '../domain/reducer';
import { createRehearsal, rehearsalCommand } from '../domain/rehearsal';
import { remoteSlideInfo, remoteSlideKey } from '../domain/remoteSlides';
import { SlideCanvas } from './SlideCanvas';
import { liveCanvasProps } from './liveProps';
import { activePlaylist } from '../domain/live';

export function RehearsalModal({ state, onPreview, commandRef, onClose }: {
  state: AppState; onPreview: (s: AppState | null) => void;
  commandRef: MutableRefObject<((command: Record<string, unknown>) => void) | null>; onClose: () => void;
}) {
  const [preview, setPreview] = useState(() => createRehearsal(state));
  const command = (c: Record<string, unknown>) => setPreview((s) => rehearsalCommand(s, c));
  useEffect(() => {
    commandRef.current = (c) => setPreview((s) => rehearsalCommand(s, c));
    return () => { commandRef.current = null; onPreview(null); };
  }, [commandRef, onPreview]);
  useEffect(() => onPreview(preview), [preview, onPreview]);
  useEffect(() => { setPreview((p) => ({ ...p, library: state.library })); }, [state.library]);
  const info = remoteSlideInfo(preview, preview.selectedId);
  return <div className="modal-backdrop"><section className="modal rehearsal-modal" role="dialog" aria-modal="true" aria-label="리허설 모드" onKeyDown={(e) => {
    if ((e.target as HTMLElement).closest('input,select,textarea')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation(); command({ type: ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? 'live/prev' : 'live/next' });
    }
  }}>
    <header className="modal-head"><h2>리허설 모드</h2><button aria-label="리허설 종료" onClick={onClose}>✕</button></header>
    <p className="rehearsal-banner" role="status">연습 중 · 실제 송출 화면은 바뀌지 않습니다. 연결된 리모컨도 이 연습 화면을 조작합니다.</p>
    <label className="row gap-s">연습할 재생목록<select aria-label="연습할 재생목록" value={preview.activePlaylistId} onChange={(e) => setPreview(createRehearsal({ ...preview, activePlaylistId: e.target.value }))}>{preview.library.playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="rehearsal-body"><div className="rehearsal-main"><SlideCanvas {...liveCanvasProps(preview.live)} animate={false} />
      <div className="row gap-s"><button autoFocus onClick={() => command({ type: 'live/prev' })}>◀ 이전</button><strong className="grow">{preview.live.title ?? '연습 종료'} · {preview.cursor ? preview.cursor.seq + 1 : '—'}</strong><button onClick={() => command({ type: 'live/next' })}>다음 ▶</button></div>
      <p>{preview.live.slide?.notes || '슬라이드 노트 없음'}</p><p className="muted small">슬라이드 동작·매크로·자동 미디어 재생은 실행하지 않습니다.</p></div>
      <div className="feature-scroll rehearsal-list" aria-label="리허설 슬라이드 목록">{info.all?.map((item) => <button key={remoteSlideKey(item)} aria-current={preview.cursor?.presentationId === item.presentationId && preview.cursor.seq === item.seq && preview.cursor.playlistIndex === item.playlistIndex ? 'true' : undefined} onClick={() => command({ type: 'live/go', presentationId: item.presentationId, seq: item.seq, playlistIndex: item.playlistIndex })}><SlideCanvas slide={item.slide} theme={info.themes[item.themeId]} background={item.background} /><span>{item.title} · {item.seq + 1}</span></button>)}</div></div>
    <footer className="modal-foot"><span className="grow muted small">{activePlaylist(preview)?.name} · 실제 발표 기록에는 남지 않습니다.</span><button onClick={onClose}>리허설 종료</button></footer>
  </section></div>;
}
