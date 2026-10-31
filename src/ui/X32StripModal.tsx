import { useEffect } from 'react';
import { eqCurve } from '../domain/eqCurve';
import {
  busName, formatDb, formatParam, PAN, scribbleColor, shortName, stripAddress, stripAddresses, stripSections, X32_STRIPS,
  type X32Param, type X32Values,
} from '../domain/x32';
import { EqGraph, Fader, Knob, LitButton } from './X32Controls';
import { useX32, x32 } from './x32';

const two = (n: number) => String(n).padStart(2, '0');
/** Knobs whose centre is “nothing” (gain ±, pan), lit from the middle like the console's rings. */
const BIPOLAR = /(^preamp\/trim$|^eq\/\d\/g$|^mix\/pan$)/;
/** Short labels as printed on the console. */
const SHORT: Record<string, string> = { '스레숄드': 'THR', '레인지': 'RANGE', '어택': 'ATTACK', '홀드': 'HOLD', '릴리즈': 'RELEASE', '니': 'KNEE', '메이크업 게인': 'GAIN', '믹스': 'MIX', '비율': 'RATIO', '트림': 'GAIN', '로우 컷 주파수': 'LOW CUT', '주파수': 'FREQ', '게인': 'GAIN', 'Q': 'Q', '팬': 'PAN' };

/** One parameter as console hardware: a knob, a lit button, or a small selector. */
function Control({ address, param, values, disabled }: { address: string; param: X32Param; values: X32Values; disabled?: boolean }) {
  const raw = values[address];
  const value = typeof raw === 'number' ? raw : undefined;
  const { kind } = param;
  if (kind.type === 'bool') {
    return <LitButton on={value === 1} disabled={value === undefined} onClick={() => x32.set(address, value === 1 ? 0 : 1)}>{param.label}</LitButton>;
  }
  if (kind.type === 'enum' && param.key !== 'dyn/ratio') {
    return (
      <label className="x32-choice">
        <span>{param.label}</span>
        <select className="x32-select" value={value ?? ''} disabled={value === undefined} onChange={(e) => x32.set(address, Number(e.target.value))}>
          {value === undefined && <option value="">…</option>}
          {kind.options.map((o, i) => <option key={o} value={i}>{o}</option>)}
        </select>
      </label>
    );
  }
  const steps = kind.type === 'enum' ? kind.options.length : undefined;
  const toRaw = (v: number) => (steps ? Math.round(v * (steps - 1)) : v);
  const fromRaw = value === undefined ? undefined : steps ? value / (steps - 1) : value;
  return (
    <Knob value={fromRaw} steps={steps} bipolar={BIPOLAR.test(param.key)} disabled={disabled || value === undefined}
      label={SHORT[param.label] ?? param.label} readout={formatParam(kind, value)}
      onChange={(v) => (steps ? x32.set(address, toRaw(v)) : x32.setSoon(address, v))} />
  );
}

/**
 * A strip's processing, laid out like the X32 SEL screen and channel strip: gain & low cut, gate,
 * dynamics, EQ with its curve, and bus sends — knobs with LED rings and lit buttons.
 */
export function X32StripModal({ stripId, onClose }: { stripId: string; onClose: () => void }) {
  const mixer = useX32();
  const strip = X32_STRIPS.find((s) => s.id === stripId);
  useEffect(() => { x32.read(stripAddresses(stripId)); }, [stripId, mixer.status]);
  if (!strip) return null;
  const v = mixer.values;
  const at = (key: string) => `/${stripId}/${key}`;
  const onAddr = stripAddress(stripId, 'on');
  const faderAddr = stripAddress(stripId, 'fader');
  const muted = v[onAddr] === 0;
  const fader = typeof v[faderAddr] === 'number' ? (v[faderAddr] as number) : 0;
  const scribble = scribbleColor(stripId, v);
  const sections = stripSections(strip.kind);
  const eqBands = sections.find((s) => s.id === 'eq')?.bands?.length ?? 0;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal x32-strip-modal" role="dialog" aria-modal="true" aria-label={`X32 ${strip.label} ${shortName(stripId, v)}`} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <header className="x32-sel-head">
          <div className="x32-scribble big" style={{ background: strip.kind === 'main' ? '#f1f5f9' : scribble.background, color: strip.kind === 'main' ? '#0b0c0f' : scribble.color }}>
            <small>{strip.label}</small><b>{shortName(stripId, v)}</b>
          </div>
          <span className="x32-lcd grow">SEL · {strip.label}{mixer.status !== 'connected' ? ' · 연결 안 됨' : ''}</span>
          <button className="x32-btn" autoFocus aria-label="닫기" onClick={onClose}>✕</button>
        </header>
        <div className="x32-sel-body">
          <div className="x32-sel-strip">
            {strip.kind !== 'dca' && stripId !== 'main/m' && <Control address={at('mix/pan')} param={{ key: 'mix/pan', label: '팬', kind: PAN }} values={v} />}
            <LitButton tone="red" on={muted} onClick={() => x32.set(onAddr, muted ? 1 : 0)}>MUTE</LitButton>
            <Fader value={fader} label={`${strip.label} 페이더`} readout={formatDb(fader)} onChange={(f) => x32.setSoon(faderAddr, f)} />
            <span className="x32-readout">{formatDb(fader)}</span>
          </div>
          <div className="x32-sel-sections">
            {sections.map((sec) => {
              const on = sec.on ? v[at(sec.on)] : 1;
              const off = sec.on ? on !== 1 : false;
              return (
                <section key={sec.id} className={`x32-block ${sec.id} ${off ? 'bypassed' : ''}`}>
                  <h4>
                    <span>{{ preamp: 'GAIN · LOW CUT', gate: 'GATE', dyn: 'DYNAMICS', eq: 'EQUALIZER', sends: 'BUS SENDS' }[sec.id]}</span>
                    <small>{sec.title}</small>
                    {sec.on && <LitButton on={on === 1} disabled={typeof on !== 'number'} onClick={() => x32.set(at(sec.on!), on === 1 ? 0 : 1)}>ON</LitButton>}
                  </h4>
                  {sec.id === 'eq' && <EqGraph curve={eqCurve(stripId, v, eqBands)} active={!off} />}
                  {sec.id === 'sends' ? (
                    <div className="x32-knob-row sends">
                      {Array.from({ length: 16 }, (_, i) => {
                        const n = i + 1;
                        const sendOn = at(`mix/${two(n)}/on`);
                        const level = v[at(`mix/${two(n)}/level`)];
                        return (
                          <div key={n} className="x32-send">
                            <Knob value={typeof level === 'number' ? level : undefined} disabled={typeof level !== 'number'} label={busName(n, v).replace(/^Bus (\d+) · /, '$1 ')}
                              readout={typeof level === 'number' ? formatDb(level) : '…'} onChange={(l) => x32.setSoon(at(`mix/${two(n)}/level`), l)} />
                            <LitButton tone="yellow" on={v[sendOn] === 1} disabled={typeof v[sendOn] !== 'number'} onClick={() => x32.set(sendOn, v[sendOn] === 1 ? 0 : 1)}>ON</LitButton>
                          </div>
                        );
                      })}
                    </div>
                  ) : sec.bands ? (
                    <div className="x32-bands">
                      {sec.bands.map((band) => (
                        <div key={band.label} className="x32-band">
                          <strong>{band.label}</strong>
                          {band.params.map((p) => <Control key={p.key} address={at(p.key)} param={p} values={v} />)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="x32-knob-row">
                      {sec.params.map((p) => <Control key={p.key} address={at(p.key)} param={p} values={v} />)}
                    </div>
                  )}
                </section>
              );
            })}
            {strip.kind === 'dca' && <p className="x32-note">DCA는 페이더와 뮤트만 있습니다.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
