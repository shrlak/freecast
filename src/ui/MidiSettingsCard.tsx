import { useEffect, useRef, useState } from 'react';
import type { Macro } from '../domain/types';
import {
  bindingsFor, defaultMidiSettings, describeMidi, isX32Port, learnBinding, MIDI_COMMANDS, removeBinding,
  type MidiSettings, type MidiTarget,
} from '../domain/midi';
import { midiHub, useMidiHub } from './midi';

const keyOf = (t: MidiTarget) => (t.type === 'command' ? t.command : `macro:${t.macroId}`);

/** ⚙ 설정 → 장비 · 연결: MIDI control from a Behringer X32 (or any MIDI controller), with MIDI learn. */
export function MidiSettingsCard({ midi, onMidi, macros }: { midi: MidiSettings; onMidi: (s: MidiSettings) => void; macros: Macro[] }) {
  const hub = useMidiHub();
  const [learning, setLearning] = useState<string | null>(null);
  const latest = useRef(midi);
  latest.current = midi;
  useEffect(() => { midiHub.start(); return () => midiHub.learn(null); }, []);

  const learn = (target: MidiTarget) => {
    const key = keyOf(target);
    if (learning === key) { midiHub.learn(null); setLearning(null); return; }
    setLearning(key);
    midiHub.learn((input, press) => {
      setLearning(null);
      const next = learnBinding(latest.current, press, target);
      // Learning on one input makes sense only if that input is listened to.
      onMidi(latest.current.input && latest.current.input !== input ? { ...next, input } : next);
    });
  };

  const x32 = hub.inputs.find(isX32Port);
  const status = hub.status === 'unsupported' ? '이 브라우저는 MIDI를 지원하지 않습니다. FreeCast 데스크톱 앱이나 Chrome · Edge를 쓰세요.'
    : hub.status === 'denied' ? 'MIDI 사용이 거부되었습니다. 브라우저의 사이트 권한에서 MIDI를 허용하세요.'
    : x32 ? `X32 연결됨 (${x32})`
    : hub.inputs.length ? `MIDI 입력 ${hub.inputs.length}개 연결됨`
    : 'MIDI 장치가 없습니다. X32를 USB나 MIDI 케이블로 연결하세요.';
  const inputs = midi.input && !hub.inputs.includes(midi.input) ? [...hub.inputs, midi.input] : hub.inputs;

  const row = (label: string, target: MidiTarget) => {
    const key = keyOf(target);
    return (
      <div key={key} className="midi-row">
        <span className="grow">{label}</span>
        <span className="midi-chips">
          {bindingsFor(midi, target).map((b, i) => (
            <span key={i} className="midi-chip">{describeMidi(b)}<button className="mini-btn" aria-label={`${describeMidi(b)} 지우기`} onClick={() => onMidi(removeBinding(midi, b))}>✕</button></span>
          ))}
        </span>
        <button className={`mini-btn ${learning === key ? 'active' : ''}`} disabled={hub.status !== 'ready'} onClick={() => learn(target)}>
          {learning === key ? 'X32 버튼을 누르세요… (취소)' : '학습'}
        </button>
      </div>
    );
  };

  return (
    <section className="settings-card">
      <label className="settings-switch">
        <span><b>MIDI 조작 · Behringer X32</b><small className="muted">믹서의 사용자 버튼이나 MIDI 건반 · 페달로 슬라이드를 넘기고 매크로를 실행합니다.</small></span>
        <input type="checkbox" checked={midi.enabled} onChange={(e) => onMidi({ ...midi, enabled: e.target.checked })} />
      </label>
      <p className="row gap-xs small"><span className={`dot ${hub.status === 'ready' && hub.inputs.length ? 'on' : ''}`} /><span className={hub.status === 'ready' ? '' : 'warn'}>{status}</span></p>
      <div className="settings-fields">
        <label>받을 입력
          <select value={midi.input ?? ''} onChange={(e) => onMidi({ ...midi, input: e.target.value || null })}>
            <option value="">모든 MIDI 입력</option>
            {inputs.map((n) => <option key={n} value={n}>{n}{isX32Port(n) ? ' · X32' : ''}{hub.inputs.includes(n) ? '' : ' (연결 안 됨)'}</option>)}
          </select>
        </label>
      </div>
      <p className="hint" role="status">{hub.last ? `마지막 신호: ${hub.last.input} · ${describeMidi(hub.last.press)}` : '받은 신호 없음 · 버튼을 눌러 연결을 확인하세요.'}</p>
      <div className="midi-map" role="group" aria-label="MIDI 매핑">
        {MIDI_COMMANDS.map((c) => row(c.label, { type: 'command', command: c.id }))}
        {macros.map((m) => row(`매크로: ${m.name}`, { type: 'macro', macroId: m.id }))}
      </div>
      <label className="check small"><input type="checkbox" checked={midi.macroNotes} onChange={(e) => onMidi({ ...midi, macroNotes: e.target.checked })} /> 노트 36–51로 매크로 1–16 실행 (매크로 목록 순서)</label>
      <div className="row gap-xs wrap">
        <button onClick={() => { if (confirm('MIDI 매핑을 기본값으로 되돌릴까요?')) onMidi({ ...defaultMidiSettings(), enabled: midi.enabled, input: midi.input }); }}>기본 매핑으로</button>
      </div>
      <details className="hint">
        <summary>X32 연결 방법</summary>
        <ol>
          <li>X32를 X-USB 카드의 USB 케이블이나 MIDI IN/OUT 케이블(USB-MIDI 인터페이스)로 이 컴퓨터에 연결합니다.</li>
          <li>X32 <b>SETUP → remote</b>에서 MIDI 송수신을 켭니다. USB 카드로 연결했다면 MIDI를 카드(USB)로 보내도록 고릅니다.</li>
          <li>X32 <b>ASSIGN → VIEW</b>에서 사용자 버튼 하나를 <b>MIDI Push</b>의 Note · CC · Program Change로 정합니다. (Toggle은 두 번 눌러야 한 번 동작하므로 Push를 쓰세요.)</li>
          <li>위 목록에서 <b>학습</b>을 누르고 그 X32 버튼을 누르면 연결됩니다. 기본값: 노트 60 다음 · 59 이전 · 58 모두 지우기 · 57 글자 지우기 · 56 검은 화면 · CC 64 다음.</li>
          <li>X32가 장면(Scene)을 불러올 때 Program Change를 보내게 하면, 장면 전환에 맞춰 매크로를 실행할 수도 있습니다.</li>
        </ol>
      </details>
    </section>
  );
}
