import { useRef, useState } from 'react';
import { CURRENT_SCENE, formatDb, SCENE_ADDRESS, sceneName, stripAddress, stripName, X32_STRIPS, type X32Strip } from '../domain/x32';
import { useX32, x32 } from './x32';

const SCENES = Array.from({ length: 100 }, (_, i) => i);

/** Live panel → Mixer: operate the X32 by hand — mutes, faders, scene recall. */
export function MixerPanel() {
  const mixer = useX32();
  const [allChannels, setAllChannels] = useState(false);
  const current = mixer.values[CURRENT_SCENE];
  const [scene, setScene] = useState<number>(typeof current === 'number' ? current : 0);
  // Fader drags send at most every 50 ms; the last position always goes out.
  const pending = useRef<Record<string, { value: number; timer: ReturnType<typeof setTimeout> | null }>>({});
  const sendFader = (address: string, value: number) => {
    const p = pending.current[address] ?? (pending.current[address] = { value, timer: null });
    p.value = value;
    if (p.timer) return;
    x32.set(address, value);
    p.timer = setTimeout(() => { p.timer = null; if (x32.state.values[address] !== p.value) x32.set(address, p.value); }, 50);
  };

  if (mixer.status !== 'connected') {
    return (
      <div className="stack">
        <p className="muted small">{mixer.status === 'unavailable' ? 'X32 믹서 조작은 FreeCast 데스크톱 앱에서 됩니다.' : mixer.status === 'off' ? 'X32 믹서가 연결되어 있지 않습니다.' : mixer.status === 'lost' ? `X32 응답 없음 · ${mixer.ip ?? ''} — 다시 연결하는 중…` : 'X32에 연결하는 중…'}</p>
        <p className="hint">⚙ 설정 → 장비 · 연결 → Behringer X32 믹서에서 연결하세요.</p>
      </div>
    );
  }

  const named = (s: X32Strip) => typeof mixer.values[stripAddress(s.id, 'name')] === 'string' && (mixer.values[stripAddress(s.id, 'name')] as string).trim() !== '';
  const strips = X32_STRIPS.filter((s) => s.kind !== 'ch' || allChannels || named(s));

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
        {strips.map((s) => {
          const onAddr = stripAddress(s.id, 'on');
          const faderAddr = stripAddress(s.id, 'fader');
          const muted = mixer.values[onAddr] === 0;
          const fader = typeof mixer.values[faderAddr] === 'number' ? (mixer.values[faderAddr] as number) : 0;
          return (
            <div key={s.id} className={`mixer-strip ${s.kind}`}>
              <span className="mixer-name truncate" title={stripName(s.id, mixer.values)}>{stripName(s.id, mixer.values)}</span>
              <button className={`mixer-mute ${muted ? 'muted' : ''}`} aria-pressed={muted} title={muted ? '뮤트 해제' : '뮤트'} onClick={() => x32.set(onAddr, muted ? 1 : 0)}>뮤트</button>
              <input type="range" className="grow" min={0} max={1} step={1 / 1023} value={fader} aria-label={`${stripName(s.id, mixer.values)} 페이더`} onChange={(e) => sendFader(faderAddr, Number(e.target.value))} />
              <span className="mixer-db small">{formatDb(fader)}</span>
            </div>
          );
        })}
      </div>
      <label className="check small"><input type="checkbox" checked={allChannels} onChange={(e) => setAllChannels(e.target.checked)} /> 이름 없는 채널도 보기 (Ch 01–32)</label>
    </div>
  );
}
