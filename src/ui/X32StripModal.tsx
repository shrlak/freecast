import { useEffect } from 'react';
import {
  busName, formatDb, formatParam, PAN, stripAddress, stripAddresses, stripName, stripSections, X32_STRIPS,
  type X32Param, type X32Values,
} from '../domain/x32';
import { useX32, x32 } from './x32';

const two = (n: number) => String(n).padStart(2, '0');

/** One knob, switch or choice of the strip, in the console's own units. */
function Param({ address, param, values }: { address: string; param: X32Param; values: X32Values }) {
  const raw = values[address];
  const value = typeof raw === 'number' ? raw : undefined;
  const { kind } = param;
  if (kind.type === 'bool') {
    return (
      <label className="x32-param x32-switch">
        <input type="checkbox" checked={value === 1} disabled={value === undefined} onChange={(e) => x32.set(address, e.target.checked ? 1 : 0)} />
        {param.label}
      </label>
    );
  }
  if (kind.type === 'enum') {
    return (
      <label className="x32-param">
        <span>{param.label}</span>
        <select value={value ?? ''} disabled={value === undefined} onChange={(e) => x32.set(address, Number(e.target.value))}>
          {value === undefined && <option value="">…</option>}
          {kind.options.map((o, i) => <option key={o} value={i}>{o}</option>)}
        </select>
      </label>
    );
  }
  return (
    <label className="x32-param">
      <span>{param.label} <b>{formatParam(kind, value)}</b></span>
      <input type="range" min={0} max={1} step={kind.type === 'level' ? 1 / 1023 : 0.001} value={value ?? 0} disabled={value === undefined}
        onChange={(e) => x32.setSoon(address, Number(e.target.value))} />
    </label>
  );
}

/** A strip's full editor, like SEL on the console: gain, low cut, gate, compressor, EQ, sends. */
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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal x32-strip-modal" role="dialog" aria-modal="true" aria-label={`X32 ${stripName(stripId, v)}`} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <header className="modal-head">
          <h2>🎚 {stripName(stripId, v)}</h2>
          <button autoFocus aria-label="닫기" onClick={onClose}>✕</button>
        </header>
        <div className="feature-scroll stack">
          {mixer.status !== 'connected' && <p className="warn small">X32가 연결되어 있지 않습니다. 값이 바뀌지 않습니다.</p>}
          <div className="x32-strip-head">
            <button className={`mixer-mute ${muted ? 'muted' : ''}`} aria-pressed={muted} onClick={() => x32.set(onAddr, muted ? 1 : 0)}>뮤트</button>
            <label className="x32-param grow"><span>페이더 <b>{formatDb(fader)}</b></span>
              <input type="range" min={0} max={1} step={1 / 1023} value={fader} onChange={(e) => x32.setSoon(faderAddr, Number(e.target.value))} />
            </label>
            {strip.kind !== 'dca' && <Param address={at('mix/pan')} param={{ key: 'mix/pan', label: '팬', kind: PAN }} values={v} />}
          </div>
          {stripSections(strip.kind).map((sec) => (
            <section key={sec.id} className="x32-section">
              <h4>
                {sec.title}
                {sec.on && (
                  <label className="x32-switch">
                    <input type="checkbox" checked={v[at(sec.on)] === 1} disabled={typeof v[at(sec.on)] !== 'number'} onChange={(e) => x32.set(at(sec.on!), e.target.checked ? 1 : 0)} /> 켜기
                  </label>
                )}
              </h4>
              {sec.id === 'sends' ? (
                <div className="x32-sends">
                  {Array.from({ length: 16 }, (_, i) => {
                    const n = i + 1;
                    const sendOn = at(`mix/${two(n)}/on`);
                    return (
                      <div key={n} className="x32-send">
                        <input type="checkbox" aria-label={`${busName(n, v)} 보내기`} checked={v[sendOn] === 1} disabled={typeof v[sendOn] !== 'number'} onChange={(e) => x32.set(sendOn, e.target.checked ? 1 : 0)} />
                        <Param address={at(sec.params[i].key)} param={{ ...sec.params[i], label: busName(n, v) }} values={v} />
                      </div>
                    );
                  })}
                </div>
              ) : sec.bands ? (
                <div className="x32-bands">
                  {sec.bands.map((band) => (
                    <div key={band.label} className="x32-band">
                      <strong className="small">{band.label}</strong>
                      {band.params.map((p) => <Param key={p.key} address={at(p.key)} param={p} values={v} />)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="x32-params">
                  {sec.params.map((p) => <Param key={p.key} address={at(p.key)} param={p} values={v} />)}
                </div>
              )}
            </section>
          ))}
          {strip.kind === 'dca' && <p className="hint">DCA는 페이더와 뮤트만 있습니다.</p>}
        </div>
      </section>
    </div>
  );
}
