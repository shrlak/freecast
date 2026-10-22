import { useState } from 'react';
import type { Library } from '../domain/types';
import { actionLabel } from '../domain/activity';
import { deviceLabel } from '../domain/device';

export function ActivityModal({ library, onClose }: { library: Library; onClose: () => void }) {
  const [tab, setTab] = useState<'activity' | 'usage'>('activity');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const matches = (at: number, text: string) => (!from || at >= new Date(`${from}T00:00:00`).getTime()) && (!to || at < new Date(`${to}T23:59:59.999`).getTime() + 1) && text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  const activity = [...(library.activity ?? [])].reverse().filter((e) => matches(e.at, `${actionLabel(e.action)} ${e.detail} ${deviceLabel(e.device)} ${e.account ?? ''}`));
  const usage = [...library.usage].reverse().filter((e) => matches(e.at, `${e.title} ${e.ccli ?? ''} ${deviceLabel(e.device)} ${e.account ?? ''}`));
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal activity-modal" role="dialog" aria-label="사용기록">
      <header className="modal-head"><h2>사용기록</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <div className="seg light"><button className={tab === 'activity' ? 'on' : ''} onClick={() => setTab('activity')}>앱 활동</button><button className={tab === 'usage' ? 'on' : ''} onClick={() => setTab('usage')}>발표·찬양 사용</button></div>
        <label>검색<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="작업·제목·기기·사용자" /></label>
        <div className="row"><label>시작 날짜<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>종료 날짜<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label><button onClick={() => { setSearch(''); setFrom(''); setTo(''); }}>필터 초기화</button></div>
        <p className="hint">앱 활동은 최근 2,000개, 발표 기록은 최근 5,000개까지 보관합니다. 로그인하면 라이브러리와 함께 동기화됩니다. 기록 당시의 기기·사용자 이름을 표시하며, 이전 버전 기록에는 기기 정보가 없습니다.</p>
        <p role="status">{tab === 'activity' ? activity.length : usage.length}개 기록</p>
        <div className="activity-table"><table><thead><tr><th>시간</th><th>{tab === 'activity' ? '작업' : '발표'}</th><th>기기 · 사용자</th><th>로그인 계정</th></tr></thead>
          <tbody>{tab === 'activity' ? activity.map((e) => <tr key={e.id}><td>{new Date(e.at).toLocaleString()}</td><td>{actionLabel(e.action)}<br />{e.detail}</td><td>{deviceLabel(e.device)}</td><td>{e.account ?? '로그인 안 됨'}</td></tr>) : usage.map((e, i) => <tr key={`${e.at}:${e.presentationId}:${i}`}><td>{new Date(e.at).toLocaleString()}</td><td>{e.title}{e.ccli && <><br />CCLI {e.ccli}</>}</td><td>{deviceLabel(e.device)}</td><td>{e.account ?? '정보 없음'}</td></tr>)}</tbody>
        </table></div>
        {!(tab === 'activity' ? activity.length : usage.length) && <p className="muted">조건에 맞는 기록이 없습니다.</p>}
      </div>
    </div>
  </div>;
}
