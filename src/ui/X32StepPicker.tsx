import { useState } from 'react';
import type { MacroStep } from '../domain/types';
import { formatDb, sceneName, stripAddress, stripName, X32_STRIPS } from '../domain/x32';
import { useX32 } from './x32';

type Kind = 'mute' | 'unmute' | 'fader' | 'scene';

/**
 * Adds an X32 step to a macro or slide action: mute / unmute a strip, set its fader to where it is
 * on the mixer right now, or recall a scene. Names come from the mixer when it is connected.
 */
export function X32StepPicker({ onAdd }: { onAdd: (step: MacroStep) => void }) {
  const mixer = useX32();
  const [kind, setKind] = useState<Kind>('unmute');
  const [strip, setStrip] = useState('main/st');
  const [scene, setScene] = useState(0);
  const fader = mixer.values[stripAddress(strip, 'fader')];
  const canFader = typeof fader === 'number';

  const add = () => {
    if (kind === 'scene') onAdd({ type: 'x32', action: 'scene', scene });
    else if (kind === 'fader') { if (canFader) onAdd({ type: 'x32', action: 'fader', strip, value: fader }); }
    else onAdd({ type: 'x32', action: kind, strip });
  };

  return (
    <div className="row gap-xs wrap x32-picker" role="group" aria-label="X32 믹서 동작 추가">
      <span className="muted small">X32 믹서</span>
      <select aria-label="동작" value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
        <option value="unmute">뮤트 해제 (켜기)</option>
        <option value="mute">뮤트</option>
        <option value="fader">페이더를 지금 값으로</option>
        <option value="scene">장면 불러오기</option>
      </select>
      {kind === 'scene'
        ? <select aria-label="장면" value={scene} onChange={(e) => setScene(Number(e.target.value))}>
            {Array.from({ length: 100 }, (_, n) => <option key={n} value={n}>{sceneName(n, mixer.values)}</option>)}
          </select>
        : <select aria-label="채널" value={strip} onChange={(e) => setStrip(e.target.value)}>
            {X32_STRIPS.map((s) => <option key={s.id} value={s.id}>{stripName(s.id, mixer.values)}</option>)}
          </select>}
      {kind === 'fader' && <span className="small muted">{canFader ? formatDb(fader) : '믹서를 연결하면 지금 값을 읽습니다'}</span>}
      <button disabled={kind === 'fader' && !canFader} onClick={add}>추가</button>
    </div>
  );
}
