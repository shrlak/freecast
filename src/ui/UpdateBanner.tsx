import { useEffect, useState } from 'react';
import { desktop, type UpdateState } from '../domain/desktop';

/** Update notice (desktop app): downloading → "restart to update". */
export function UpdateBanner() {
  const [st, setSt] = useState<UpdateState | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!desktop) return;
    desktop.updateState().then(setSt);
    return desktop.onUpdate((s) => {
      setSt(s);
      if (s.status === 'ready') setHidden(false);
    });
  }, []);
  if (!desktop || !st || hidden) return null;
  if (st.status === 'downloading') {
    return (
      <div className="update-banner">
        <span>⬇ FreeCast {st.version} 업데이트를 내려받는 중… {st.progress}%</span>
        <progress max={100} value={st.progress} />
        <button className="mini-btn" onClick={() => setHidden(true)}>숨기기</button>
      </div>
    );
  }
  if (st.status === 'ready') {
    return (
      <div className="update-banner ready">
        <span>✅ FreeCast {st.version} 업데이트가 준비되었습니다.</span>
        <button className="primary" onClick={() => desktop!.installUpdate()}>지금 재시작하여 업데이트</button>
        <button onClick={() => setHidden(true)}>나중에 (종료할 때 설치)</button>
      </div>
    );
  }
  return null;
}

/** "Check for updates" control for settings. */
export function UpdateCheck() {
  const [st, setSt] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!desktop) return;
    desktop.updateState().then(setSt);
    return desktop.onUpdate(setSt);
  }, []);
  if (!desktop) return null;
  const label = !st ? '' : st.status === 'checking' ? '확인 중…' : st.status === 'none' ? '최신 버전입니다' : st.status === 'downloading' ? `내려받는 중 ${st.progress}%` : st.status === 'ready' ? `${st.version} 준비됨` : st.status === 'error' ? `오류: ${st.error}` : '';
  return (
    <div className="row gap-xs">
      <button onClick={() => desktop!.checkUpdates().then((s) => s && setSt(s))}>업데이트 확인</button>
      {st?.status === 'ready' && <button className="primary" onClick={() => desktop!.installUpdate()}>재시작하여 설치</button>}
      <span className="muted small">{label}</span>
    </div>
  );
}
