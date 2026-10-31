import { useEffect, useRef, useState } from 'react';
import type { Macro } from '../domain/types';
import {
  bindingsFor, defaultMidiSettings, describeMidi, isX32Port, learnBinding, MIDI_COMMANDS, removeBinding,
  type MidiSettings, type MidiTarget,
} from '../domain/midi';
import { midiHub, useMidiHub, X32_NETWORK_INPUT } from './midi';

const keyOf = (t: MidiTarget) => (t.type === 'command' ? t.command : `macro:${t.macroId}`);
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** ⚙ 설정 → 장비 · 연결: control from a Behringer X32 over Wi-Fi or USB (or any MIDI controller), with learn. */
export function MidiSettingsCard({ midi, onMidi, macros }: { midi: MidiSettings; onMidi: (s: MidiSettings) => void; macros: Macro[] }) {
  const hub = useMidiHub();
  const [learning, setLearning] = useState<string | null>(null);
  const [ip, setIp] = useState(midi.network.ip);
  const [found, setFound] = useState<{ ip: string; name: string | null; model: string | null }[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const latest = useRef(midi);
  latest.current = midi;
  useEffect(() => { midiHub.start(); midiHub.listenNetwork(); return () => midiHub.learn(null); }, []);

  const learn = (target: MidiTarget) => {
    const key = keyOf(target);
    if (learning === key) { midiHub.learn(null); setLearning(null); return; }
    setLearning(key);
    midiHub.learn((input, press) => {
      setLearning(null);
      const next = learnBinding(latest.current, press, target);
      // Learning on one MIDI input makes sense only if that input is listened to.
      const cur = latest.current.input;
      onMidi(press.kind !== 'osc' && cur && cur !== input ? { ...next, input } : next);
    });
  };

  const connectTo = (address: string) => {
    const v = address.trim();
    if (!IPV4.test(v)) { setScanError('IP 주소를 192.168.0.64처럼 넣으세요.'); return; }
    setScanError(null);
    setFound(null);
    setIp(v);
    onMidi({ ...midi, enabled: true, network: { on: true, ip: v } });
  };
  const scan = async () => {
    setScanning(true);
    setScanError(null);
    try {
      const list = await midiHub.scanNetwork();
      setFound(list);
      if (list.length === 1) connectTo(list[0].ip);
    } catch (e) {
      setScanError((e as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const net = hub.net;
  const netOn = midi.network.on && !!midi.network.ip;
  const netLabel = net.status === 'unavailable' ? 'Wi-Fi 연결은 FreeCast 데스크톱 앱에서 됩니다.'
    : !netOn ? 'Wi-Fi 연결 꺼짐'
    : !midi.enabled ? '위 스위치를 켜면 연결합니다.'
    : net.status === 'connected' ? `X32 연결됨 · ${net.ip}${net.name ? ` · ${net.name}` : ''}${net.model ? ` (${net.model})` : ''}`
    : net.status === 'lost' ? `X32 응답 없음 · ${net.ip} — 같은 Wi-Fi인지, X32가 켜져 있는지 확인하세요. 계속 다시 시도합니다.`
    : net.status === 'connecting' ? `X32 찾는 중 · ${midi.network.ip}…`
    : net.error ?? '연결 중…';

  const x32 = hub.inputs.find(isX32Port);
  const usbLabel = hub.status === 'unsupported' ? '이 브라우저는 MIDI를 지원하지 않습니다. FreeCast 데스크톱 앱이나 Chrome · Edge를 쓰세요.'
    : hub.status === 'denied' ? 'MIDI 사용이 거부되었습니다. 브라우저의 사이트 권한에서 MIDI를 허용하세요.'
    : x32 ? `X32 연결됨 (${x32})`
    : hub.inputs.length ? `MIDI 입력 ${hub.inputs.length}개 연결됨`
    : 'USB · MIDI 장치 없음';
  const inputs = midi.input && !hub.inputs.includes(midi.input) ? [...hub.inputs, midi.input] : hub.inputs;
  const canLearn = hub.status === 'ready' || net.status === 'connected';

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
        <button className={`mini-btn ${learning === key ? 'active' : ''}`} disabled={!canLearn} onClick={() => learn(target)}>
          {learning === key ? 'X32 버튼을 누르세요… (취소)' : '학습'}
        </button>
      </div>
    );
  };

  return (
    <section className="settings-card">
      <label className="settings-switch">
        <span><b>Behringer X32 · MIDI 조작</b><small className="muted">믹서의 버튼(Wi-Fi 또는 USB)이나 MIDI 건반 · 페달로 슬라이드를 넘기고 매크로를 실행합니다.</small></span>
        <input type="checkbox" checked={midi.enabled} onChange={(e) => onMidi({ ...midi, enabled: e.target.checked })} />
      </label>

      <h5 className="midi-sub">Wi-Fi (네트워크)</h5>
      <p className="row gap-xs small"><span className={`dot ${netOn && net.status === 'connected' ? 'on' : ''}`} /><span className={netOn && midi.enabled && (net.status === 'lost' || net.status === 'unavailable' || net.error) ? 'warn' : ''}>{netLabel}</span></p>
      <form className="row gap-xs wrap" onSubmit={(e) => { e.preventDefault(); connectTo(ip); }}>
        <input className="grow" inputMode="decimal" aria-label="X32 IP 주소" placeholder="X32 IP 주소 (예: 192.168.0.64)" value={ip} onChange={(e) => setIp(e.target.value)} />
        <button type="button" disabled={scanning || net.status === 'unavailable'} onClick={scan}>{scanning ? '찾는 중…' : 'X32 찾기'}</button>
        {netOn
          ? <button type="button" onClick={() => onMidi({ ...midi, network: { ...midi.network, on: false } })}>연결 끊기</button>
          : <button type="submit" className="primary">연결</button>}
      </form>
      {scanError && <p className="warn small">{scanError}</p>}
      {found && found.length === 0 && <p className="hint">찾은 X32가 없습니다. 이 컴퓨터와 X32가 같은 네트워크에 있는지 확인하거나, X32 SETUP → network의 IP 주소를 직접 넣으세요.</p>}
      {found && found.length > 1 && (
        <div className="row gap-xs wrap">{found.map((f) => <button key={f.ip} onClick={() => connectTo(f.ip)}>{f.name ?? f.model ?? 'X32'} · {f.ip}</button>)}</div>
      )}

      <h5 className="midi-sub">USB · MIDI 케이블</h5>
      <p className="row gap-xs small"><span className={`dot ${hub.status === 'ready' && hub.inputs.length ? 'on' : ''}`} /><span className={hub.status === 'ready' ? '' : 'warn'}>{usbLabel}</span></p>
      <div className="settings-fields">
        <label>받을 MIDI 입력
          <select value={midi.input ?? ''} onChange={(e) => onMidi({ ...midi, input: e.target.value || null })}>
            <option value="">모든 MIDI 입력</option>
            {inputs.map((n) => <option key={n} value={n}>{n}{isX32Port(n) ? ' · X32' : ''}{hub.inputs.includes(n) ? '' : ' (연결 안 됨)'}</option>)}
          </select>
        </label>
      </div>

      <h5 className="midi-sub">버튼 연결</h5>
      <p className="hint" role="status">{hub.last ? `마지막 신호: ${hub.last.input === X32_NETWORK_INPUT ? 'Wi-Fi' : hub.last.input} · ${describeMidi(hub.last.press)}` : '받은 신호 없음 · X32 버튼을 눌러 연결을 확인하세요.'}</p>
      <div className="midi-map" role="group" aria-label="버튼 매핑">
        {MIDI_COMMANDS.map((c) => row(c.label, { type: 'command', command: c.id }))}
        {macros.map((m) => row(`매크로: ${m.name}`, { type: 'macro', macroId: m.id }))}
      </div>
      <label className="check small"><input type="checkbox" checked={midi.macroNotes} onChange={(e) => onMidi({ ...midi, macroNotes: e.target.checked })} /> MIDI 노트 36–51로 매크로 1–16 실행 (매크로 목록 순서)</label>
      <div className="row gap-xs wrap">
        <button onClick={() => { if (confirm('버튼 매핑을 기본값으로 되돌릴까요?')) onMidi({ ...defaultMidiSettings(), enabled: midi.enabled, input: midi.input, network: midi.network }); }}>기본 매핑으로</button>
      </div>
      <details className="hint">
        <summary>X32 Wi-Fi 연결 방법</summary>
        <ol>
          <li>X32 뒷면의 <b>ETHERNET</b> 포트를 교회 Wi-Fi 공유기(라우터)에 랜선으로 연결합니다.</li>
          <li>이 컴퓨터를 같은 Wi-Fi에 연결하고 <b>X32 찾기</b>를 누릅니다. 찾지 못하면 X32 <b>SETUP → network</b>에 나온 IP 주소를 넣고 <b>연결</b>을 누르세요. (IP가 바뀌지 않도록 X32에 고정 IP를 정해 두면 좋습니다.)</li>
          <li>쓰지 않는 채널(예: Ch 32)의 <b>MUTE</b> 버튼을 쓰거나, <b>ASSIGN</b> 사용자 버튼을 그 채널의 Mute로 정합니다.</li>
          <li>위 목록에서 <b>학습</b>을 누르고 그 버튼을 누르면 연결됩니다. 이후 누를 때마다 (켜질 때도 꺼질 때도) 한 번씩 동작합니다.</li>
          <li>Mac에서 처음 연결할 때 “로컬 네트워크” 접근을 물으면 <b>허용</b>하세요.</li>
        </ol>
      </details>
      <details className="hint">
        <summary>X32 USB · MIDI 연결 방법</summary>
        <ol>
          <li>X32를 X-USB 카드의 USB 케이블이나 MIDI IN/OUT 케이블(USB-MIDI 인터페이스)로 이 컴퓨터에 연결합니다.</li>
          <li>X32 <b>SETUP → remote</b>에서 MIDI 송수신을 켭니다. USB 카드로 연결했다면 MIDI를 카드(USB)로 보내도록 고릅니다.</li>
          <li>X32 <b>ASSIGN → VIEW</b>에서 사용자 버튼 하나를 <b>MIDI Push</b>의 Note · CC · Program Change로 정합니다. (Toggle은 두 번 눌러야 한 번 동작하므로 Push를 쓰세요.)</li>
          <li>위 목록에서 <b>학습</b>을 누르고 그 X32 버튼을 누르면 연결됩니다. 기본값: 노트 60 다음 · 59 이전 · 58 모두 지우기 · 57 글자 지우기 · 56 검은 화면 · CC 64 다음.</li>
        </ol>
      </details>
    </section>
  );
}
