import { useState } from 'react';
import { CURRENT_SCENE, formatDb, SCENE_ADDRESS, sceneName, scribbleColor, shortName, stripAddress, X32_STRIPS, type X32Strip } from '../domain/x32';
import { Fader, LitButton } from './X32Controls';
import { useX32, x32 } from './x32';
import { X32StripModal } from './X32StripModal';

const SCENES = Array.from({ length: 100 }, (_, i) => i);
/** The fader layers of the console surface. */
const LAYERS: { id: string; label: string; strips: (s: X32Strip) => boolean }[] = [
  { id: 'ch1', label: 'CH 1-16', strips: (s) => s.kind === 'ch' && Number(s.id.slice(3)) <= 16 },
  { id: 'ch17', label: 'CH 17-32', strips: (s) => s.kind === 'ch' && Number(s.id.slice(3)) > 16 },
  { id: 'aux', label: 'AUX IN', strips: (s) => s.kind === 'auxin' },
  { id: 'bus1', label: 'BUS 1-8', strips: (s) => s.kind === 'bus' && Number(s.id.slice(4)) <= 8 },
  { id: 'bus9', label: 'BUS 9-16', strips: (s) => s.kind === 'bus' && Number(s.id.slice(4)) > 8 },
  { id: 'dca', label: 'DCA 1-8', strips: (s) => s.kind === 'dca' },
];

/** One channel strip of the surface: SEL, scribble strip, MUTE, fader. */
function Strip({ strip, selected, onSelect, master }: { strip: X32Strip; selected: boolean; onSelect: () => void; master?: boolean }) {
  const mixer = useX32();
  const v = mixer.values;
  const onAddr = stripAddress(strip.id, 'on');
  const faderAddr = stripAddress(strip.id, 'fader');
  const muted = v[onAddr] === 0;
  const fader = typeof v[faderAddr] === 'number' ? (v[faderAddr] as number) : 0;
  const name = shortName(strip.id, v);
  const scribble = scribbleColor(strip.id, v);
  return (
    <div className={`x32-strip ${master ? 'master' : ''} ${selected ? 'selected' : ''}`}>
      <LitButton tone="green" on={selected} onClick={onSelect} title={strip.kind === 'dca' ? 'DCA는 페이더 · 뮤트만 있습니다' : '게인 · 로우 컷 · 게이트 · 컴프레서 · EQ · 센드'} disabled={strip.kind === 'dca'}>SEL</LitButton>
      <div className="x32-scribble" style={{ background: master ? '#f1f5f9' : scribble.background, color: master ? '#0b0c0f' : scribble.color }} title={name}>
        <small>{strip.label}</small>
        <b>{name === strip.label ? '' : name}</b>
      </div>
      <LitButton tone="red" on={muted} onClick={() => x32.set(onAddr, muted ? 1 : 0)}>MUTE</LitButton>
      <Fader value={fader} label={`${strip.label} ${name} 페이더`} readout={formatDb(fader)} onChange={(f) => x32.setSoon(faderAddr, f)} />
      <span className="x32-readout">{formatDb(fader).replace(' dB', '')}</span>
    </div>
  );
}

/**
 * The X32 surface: fader layers like the console (CH 1-16, CH 17-32, AUX IN, BUS, DCA), the main LR
 * fader on the right, scene recall, and SEL to open a strip's processing.
 */
export function MixerPanel() {
  const mixer = useX32();
  const [layer, setLayer] = useState('ch1');
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

  const strips = X32_STRIPS.filter(LAYERS.find((l) => l.id === layer)!.strips);
  const main = X32_STRIPS.find((s) => s.id === 'main/st')!;

  return (
    <div className="x32-console">
      <div className="x32-topbar">
        <span className="x32-led on" aria-hidden />
        <strong className="x32-lcd">X32 · {mixer.name ?? mixer.ip}{typeof current === 'number' ? ` · 장면 ${sceneName(current, mixer.values)}` : ''}</strong>
        <select className="x32-select" aria-label="장면" value={scene} onChange={(e) => setScene(Number(e.target.value))}>
          {SCENES.map((n) => <option key={n} value={n}>{sceneName(n, mixer.values)}</option>)}
        </select>
        <button type="button" className="x32-btn yellow" onClick={() => { if (confirm(`X32 장면 ${sceneName(scene, mixer.values)}을(를) 불러올까요? 믹서 설정이 그 장면으로 바뀝니다.`)) x32.set(SCENE_ADDRESS, scene); }}>GO 장면</button>
      </div>
      {mixer.error && <p className="warn small">{mixer.error}</p>}
      <div className="x32-layers" role="tablist" aria-label="페이더 레이어">
        {LAYERS.map((l) => <button key={l.id} type="button" role="tab" aria-selected={l.id === layer} className={`x32-btn ${l.id === layer ? 'lit' : ''} blue`} onClick={() => setLayer(l.id)}>{l.label}</button>)}
      </div>
      <div className="x32-surface">
        <div className="x32-bank">
          {strips.map((s) => <Strip key={s.id} strip={s} selected={editing === s.id} onSelect={() => setEditing(editing === s.id ? null : s.id)} />)}
        </div>
        <Strip strip={main} master selected={editing === main.id} onSelect={() => setEditing(editing === main.id ? null : main.id)} />
      </div>
      {editing && <X32StripModal stripId={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
