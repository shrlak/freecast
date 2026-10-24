import type { Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Presentation } from '../domain/types';
import { PROTECTED_MESSAGE } from '../domain/materialProtection';

export function MaterialProtectionButton({ presentation: p, dispatch, compact = false, className = '' }: { presentation: Presentation; dispatch: Dispatch<Action>; compact?: boolean; className?: string }) {
  return <button className={`${compact ? 'mini-btn' : ''} ${className}`} aria-pressed={!!p.protected}
    aria-label={`${p.title} · ${p.protected ? '자료 보호 해제' : '자료 보호'}`} title={p.protected ? '보호 중: 수정·삭제·덮어쓰기를 막습니다. 클릭하면 보호를 해제합니다.' : '필수 자료로 보호: 수정·삭제·덮어쓰기 방지'}
    onClick={(e) => {
      e.stopPropagation();
      if (p.protected && !confirm(`“${p.title}” 자료 보호를 해제할까요? 해제하면 수정·교체·삭제와 예배 자동 정리가 가능합니다.`)) return;
      dispatch({ type: 'presentation/protect', id: p.id, on: !p.protected });
    }}><span aria-hidden="true">{p.protected ? '🔒' : '🔓'}</span>{!compact && <span>{p.protected ? ' 자료 보호 중' : ' 자료 보호'}</span>}</button>;
}

export function ProtectedMaterialNotice({ presentation, dispatch }: { presentation: Presentation; dispatch: Dispatch<Action> }) {
  return <div className="protected-material-notice" role="note"><strong>🔒 필수 자료 보호 중</strong><p>{PROTECTED_MESSAGE}</p>
    <p className="hint">발표와 재생목록 추가는 가능합니다. 예배 자동 정리에서도 자료와 연결된 미디어를 보관합니다.</p>
    <MaterialProtectionButton presentation={presentation} dispatch={dispatch} />
  </div>;
}
