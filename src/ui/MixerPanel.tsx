import { useState } from 'react';
import { CURRENT_SCENE, formatDb, SCENE_ADDRESS, sceneName, stripAddress, stripName, X32_STRIPS, type X32Strip } from '../domain/x32';
import { useX32, x32 } from './x32';
import { X32StripModal } from './X32StripModal';

const SCENES = Array.from({ length: 100 }, (_, i) => i);
const GROUPS: { kind: X32Strip['kind'][]; title: string }[] = [
  { kind: ['main', 'dca'], title: 'Main · DCA' },
  { kind: ['ch'], title: '채널' },
  { kind: ['auxin'], title: 'Aux In' },
  { kind: ['bus'], title: '버스 (모니터)' },
];

/**
 * The X32 by hand: faders and mutes of every strip, scene recall, and each strip's full editor
 * (gain, low cut, gate, compressor, EQ, monitor sends) — the same things as on the console.
 */
export function MixerPanel() {
  const mixer = useX32();
  const [allStrips, setAllStrips] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const current = mixer.values[CURRENT_SCENE];
  const [scene, setScene] = useState<number>(typeof current === 'number' ? current : 0);

  if (mixer.status !== 'connected') {
    return (
      <div className="stack">
        <p className="muted small">{mixer.status === 'unavailable' ? 'X32 믹서 조작은 FreeCast 데스크톱 앱에서 됩니다.' : mixer.status === 'off' ? 'X32 믹서가 연결되어 있지 않습니다.' : mixer.status === 'lost' ? `X32 응답 없음 · ${mixer.ip ?? ''} — 다시 연결하는 중…` : 'X32에 연결하는 중…'}</p>
        <p className="hint">⚙ 설정 → 장비 · 연결 → Behringer X32 믹서에서 연결하세요.</p>
      </div>
    );
  }

  const named = (s: X32Strip) => {
    const n = mixer.values[stripAddress(s.id, 'name')];
    return typeof n === 'string' && n.trim() !== '';
  };
  const shown = (s: X32Strip) => s.kind === 'main' || s.kind === 'dca' || allStrips || named(s);

  return (
    <div className="stack mixer-panel">
      <div className="row gap-xs">
        <span className="dot on" />
        <strong className="grow truncate">X32 {mixer.name ?? mixer.ip}</strong>
        {typeof current === 'number' && <span className="muted small">장면 {sceneName(current, mixer.values)}</span>}
      </div>
      <div className="row gap-xs">
        <select className="grow" aria-label="장면" value={scene} onChange={(e) => setScene(Number(e.target.value))}>
          {SCENES.map((n) => <option key={n} value={n}>{sceneName(n, mixer.values)}</option>)}
        </select>
        <button onClick={() => { if (confirm(`X32 장면 ${sceneName(scene, mixer.values)}을(를) 불러올까요? 믹서 설정이 그 장면으로 바뀝니다.`)) x32.set(SCENE_ADDRESS, scene); }}>장면 불러오기</button>
      </div>
      {mixer.error && <p className="warn small">{mixer.error}</p>}
      <div className="mixer-strips">
        {GROUPS.map((g) => {
          const list = X32_STRIPS.filter((s) => g.kind.includes(s.kind) && shown(s));
          if (!list.length) return null;
          return (
            <div key={g.title} className="mixer-group">
              <span className="mixer-group-title">{g.title}</span>
              {list.map((s) => {
                const onAddr = stripAddress(s.id, 'on');
                const faderAddr = stripAddress(s.id, 'fader');
                const muted = mixer.values[onAddr] === 0;
                const fader = typeof mixer.values[faderAddr] === 'number' ? (mixer.values[faderAddr] as number) : 0;
                const name = stripName(s.id, mixer.values);
                return (
                  <div key={s.id} className={`mixer-strip ${s.kind}`}>
                    <button className="mixer-name truncate" title={s.kind === 'dca' ? name : `${name} — 게인 · 로우 컷 · 게이트 · 컴프레서 · EQ · 센드`} onClick={() => setEditing(s.id)}>{name}</button>
                    <button className={`mixer-mute ${muted ? 'muted' : ''}`} aria-pressed={muted} title={muted ? '뮤트 해제' : '뮤트'} onClick={() => x32.set(onAddr, muted ? 1 : 0)}>뮤트</button>
                    <input type="range" className="grow" min={0} max={1} step={1 / 1023} value={fader} aria-label={`${name} 페이더`} onChange={(e) => x32.setSoon(faderAddr, Number(e.target.value))} />
                    <span className="mixer-db small">{formatDb(fader)}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <label className="check small"><input type="checkbox" checked={allStrips} onChange={(e) => setAllStrips(e.target.checked)} /> 이름 없는 채널 · Aux · 버스도 보기</label>
      <p className="hint">채널 이름을 누르면 게인 · 로우 컷 · 게이트 · 컴프레서 · EQ · 모니터 센드를 조절합니다.</p>
      {editing && <X32StripModal stripId={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
