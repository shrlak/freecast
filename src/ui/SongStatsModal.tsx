import { useState, type Dispatch } from 'react';
import type { Action, AppState } from '../domain/reducer';
import { uid } from '../domain/lyrics';
import { keyFlowIssues, recommendSongs, songStats } from '../domain/songStats';
import { activePlaylist } from '../domain/live';

const weeks = (n: number | null) => (n == null ? '—' : n === 0 ? '이번 주' : `${n}주 전`);

/** 📊 찬양 통계: what the team sings, what to bring back, and whether this set's keys flow. */
export function SongStatsModal({ state, dispatch, notify, onClose }: { state: AppState; dispatch: Dispatch<Action>; notify: (m: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'stats' | 'recommend' | 'keys'>('recommend');
  const now = Date.now();
  const lib = state.library;
  const playlist = activePlaylist(state);
  const inSet = new Set(playlist?.items.flatMap((i) => (i.kind === 'header' ? [] : [i.presentationId])));
  const stats = songStats(lib, now);
  const picks = recommendSongs(lib, now, { exclude: inSet, limit: 12 });
  const issues = keyFlowIssues(lib, playlist?.id ?? null);
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="modal activity-modal" role="dialog" aria-label="찬양 통계">
      <header className="modal-head"><h2>찬양 통계 · 추천</h2><button onClick={onClose} aria-label="닫기">✕</button></header>
      <div className="wizard-body stack">
        <div className="seg light">
          <button className={tab === 'recommend' ? 'on' : ''} onClick={() => setTab('recommend')}>이번 주 추천</button>
          <button className={tab === 'stats' ? 'on' : ''} onClick={() => setTab('stats')}>많이 부른 곡</button>
          <button className={tab === 'keys' ? 'on' : ''} onClick={() => setTab('keys')}>키 점검{issues.length ? ` (${issues.length})` : ''}</button>
        </div>
        {tab === 'recommend' && <>
          <p className="hint">최근 4주 안에 부른 곡은 빼고, 오래 쉬었지만 자주 부르던 곡을 먼저 보여 줍니다. “{playlist?.name ?? '예배'}”에 이미 있는 곡은 제외했습니다.</p>
          {!picks.length && <p className="muted">추천할 곡이 없습니다. 찬양을 몇 번 부르고 나면 기록이 쌓입니다.</p>}
          <div className="activity-table"><table><tbody>{picks.map((r) => <tr key={r.stat.id}>
            <td>{r.stat.title}{r.stat.key && <small> · {r.stat.key}</small>}<br /><small className="muted">{r.reason}</small></td>
            <td><button disabled={!playlist} onClick={() => { dispatch({ type: 'playlist/addItem', item: { id: uid('item'), presentationId: r.stat.id } }); notify(`“${r.stat.title}”을 ${playlist?.name}에 넣었습니다`); }}>예배에 추가</button></td>
          </tr>)}</tbody></table></div>
        </>}
        {tab === 'stats' && <div className="activity-table"><table><thead><tr><th>곡</th><th>키</th><th>전체</th><th>최근 8주</th><th>마지막</th></tr></thead>
          <tbody>{stats.map((s) => <tr key={s.id}><td>{s.title}</td><td>{s.key ?? '—'}</td><td>{s.total}</td><td>{s.recent}</td><td>{weeks(s.weeksSince)}</td></tr>)}</tbody></table>
          {!stats.length && <p className="muted">찬양이 없습니다.</p>}</div>}
        {tab === 'keys' && <>
          <p className="hint">“{playlist?.name ?? '예배'}”의 찬양 순서에서 같은 키가 이어지거나 키가 크게(반음 6개 이상) 뛰는 곳입니다. 연주 키가 정해진 곡만 봅니다.</p>
          {!issues.length && <p role="status">✅ 키 흐름에 걸리는 곳이 없습니다.</p>}
          <ul>{issues.map((i) => <li key={i.index}>{i.kind === 'same' ? '같은 키가 이어짐' : '키가 크게 바뀜'}: {i.from} → {i.to}</li>)}</ul>
        </>}
      </div>
    </div>
  </div>;
}
