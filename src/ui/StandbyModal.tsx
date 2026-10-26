import { useState } from 'react';
import type { StandbyConfig, StandbyFeed } from './useStandby';
import { standbyRelayUrl } from '../domain/standby';

const LABEL = { off: '꺼짐', waiting: '메인 컴퓨터에 연결하는 중…', following: '✅ 메인 컴퓨터를 따라가는 중', lost: '🚨 메인 컴퓨터와 연결이 끊겼습니다' } as const;

/** 💻 대기 컴퓨터: this computer shadows the main one and can take over the screen with one click. */
export function StandbyModal({ config, feed, onChange, onTakeOver, onClose }: {
  config: StandbyConfig; feed: StandbyFeed; onChange: (c: StandbyConfig) => void; onTakeOver: () => void; onClose: () => void;
}) {
  const [address, setAddress] = useState(config.address);
  const valid = !!standbyRelayUrl(address);
  const slide = feed.live?.slide;
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal" role="dialog" aria-label="대기 컴퓨터">
      <header className="modal-head"><h2>💻 대기 컴퓨터 (핫 스탠바이)</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <p>이 컴퓨터를 예비로 쓰려면, 메인 컴퓨터와 같은 와이파이에서 메인의 주소를 넣으세요. 이 컴퓨터는 메인이 지금 어느 슬라이드인지 계속 따라가고, 메인이 멈추면 버튼 한 번으로 그 슬라이드부터 송출을 이어받습니다.</p>
        <label>메인 컴퓨터 주소<input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 192.168.0.12:4173" /></label>
        <p className="hint">메인 컴퓨터의 FreeCast 주소(IP:포트)입니다. 두 컴퓨터가 같은 라이브러리를 동기화해 두어야 같은 슬라이드를 찾을 수 있습니다.</p>
        <div className="row">
          <button className={config.on ? '' : 'primary'} disabled={!config.on && !valid} onClick={() => onChange({ on: !config.on, address: address.trim() })}>{config.on ? '대기 끄기' : '대기 켜기'}</button>
        </div>
        <p role="status">{LABEL[feed.health]}</p>
        {config.on && slide && <p>메인 화면: <strong>{feed.live?.title}</strong>{feed.live?.black ? ' (검은 화면)' : ''}<br /><small className="muted">{slide.text.split('\n')[0].slice(0, 40)}</small></p>}
        {config.on && feed.live && !feed.cursor && <p className="hint" role="alert">⚠ 이 컴퓨터에는 메인 화면의 슬라이드가 없습니다. 동기화한 뒤 다시 확인하세요.</p>}
        <button className="primary" disabled={!config.on || !feed.cursor} onClick={() => { if (confirm('이 컴퓨터가 지금 화면부터 송출을 이어받습니다. 메인 컴퓨터가 아직 켜져 있다면 먼저 끄세요. 계속할까요?')) onTakeOver(); }}>송출 이어받기</button>
      </div>
    </div>
  </div>;
}

/** Shown across the top while standing by, turning red when the main computer is gone. */
export function StandbyBar({ feed, onTakeOver, onOpen }: { feed: StandbyFeed; onTakeOver: () => void; onOpen: () => void }) {
  if (feed.health === 'off') return null;
  const lost = feed.health === 'lost';
  return <div className={`standby-bar ${lost ? 'lost' : ''}`} role={lost ? 'alert' : 'status'}>
    <button className="link" onClick={onOpen}>💻 대기 중 · {LABEL[feed.health]}</button>
    {lost && <button className="primary" disabled={!feed.cursor} onClick={onTakeOver}>지금 이어받기</button>}
  </div>;
}
