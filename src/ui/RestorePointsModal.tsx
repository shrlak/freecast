import { useEffect, useState } from 'react';
import type { Library } from '../domain/types';
import { libraryOf, listRestorePoints, saveRestorePoint, type RestorePoint } from '../domain/restorePoints';

const KIND = { auto: '자동', manual: '직접 저장', safety: '복원 직전' } as const;

/** 복원 지점: snapshots of the whole library taken automatically, to roll back a bad edit later. */
export function RestorePointsModal({ library, onRestore, onClose, notify }: {
  library: Library;
  onRestore: (lib: Library) => void;
  onClose: () => void;
  notify: (m: string) => void;
}) {
  const [points, setPoints] = useState<RestorePoint[] | null>(null);
  const reload = () => listRestorePoints().then(setPoints).catch(() => setPoints([]));
  useEffect(() => { void reload(); }, []);

  const saveNow = async () => {
    await saveRestorePoint(library, 'manual');
    notify('복원 지점을 저장했습니다');
    void reload();
  };
  const restore = async (p: RestorePoint) => {
    const lib = libraryOf(p);
    if (!lib) return notify('이 복원 지점을 읽을 수 없습니다');
    if (!confirm(`${new Date(p.at).toLocaleString()} 상태로 되돌릴까요? 지금 상태는 "복원 직전" 지점으로 먼저 저장되고, ⌘Z로도 되돌릴 수 있습니다.`)) return;
    await saveRestorePoint(library, 'safety');
    onRestore(lib);
    onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="복원 지점">
        <header className="modal-head">
          <h2>🕘 복원 지점</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="wizard-body stack">
          <p className="hint">FreeCast가 10분마다(바뀐 경우) 라이브러리를 자동 저장해 둡니다. 최근 30개까지 보관합니다.</p>
          <button onClick={saveNow}>지금 저장</button>
          {points === null ? <p className="muted">불러오는 중…</p> : !points.length ? <p className="muted">아직 복원 지점이 없습니다</p> : (
            <ul className="restore-list">
              {points.map((p) => (
                <li key={p.id}>
                  <span>{new Date(p.at).toLocaleString()}</span>
                  <span className="muted small">{KIND[p.kind]} · 프레젠테이션 {p.presentations} · 슬라이드 {p.slides}</span>
                  <button onClick={() => restore(p)}>복원</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
