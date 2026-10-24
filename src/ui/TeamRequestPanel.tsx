import { useEffect, useRef, useState } from 'react';
import type { TeamRequest } from '../domain/teamRequests';
import { TEAM_PRESETS, requestStatus } from '../domain/teamRequests';
import { uid } from '../domain/lyrics';

/** Sends a request, never a presentation command. It has no offline retry queue. */
export function TeamRequestPanel({ requests, ready, send, error }: { requests: TeamRequest[]; ready: boolean; send: (m: unknown) => void; error: string | null }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const [text, setText] = useState('');
  const [lastId, setLastId] = useState('');
  const [sending, setSending] = useState(false);
  const submit = (value: string) => {
    if (!ready || sending || !value.trim()) return;
    const id = uid('request');
    setLastId(id); setSending(true);
    send({ type: 'team-request', action: 'send', id, text: value.trim() });
    timer.current = setTimeout(() => setSending(false), 2100);
  };
  const delivered = requests.some((r) => r.clientRequestId === lastId);
  return <section className="team-request-panel" aria-label="방송실에 비공개 요청">
    <h2>방송실에 요청</h2><p className="hint">요청은 방송실에만 표시됩니다. 슬라이드는 바뀌지 않습니다.</p>
    {!ready && <p role="status" className="warn">컴퓨터에 연결된 뒤 보내 주세요. 끊긴 동안의 요청은 자동으로 보내지 않습니다.</p>}
    <div className="team-presets">{TEAM_PRESETS.map((p) => <button key={p} disabled={!ready || sending} onClick={() => submit(p)}>{p}</button>)}</div>
    <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="row gap-s"><input aria-label="직접 요청 입력" maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder="직접 입력 (120자)" /><button disabled={!ready || sending || !text.trim()}>보내기</button></form>
    <p role="status" className={error ? 'warn' : 'hint'}>{error || (lastId && !delivered ? '전송 확인 중… 목록에 나타나지 않으면 연결을 확인해 주세요.' : delivered ? '방송실로 전송했습니다.' : '')}</p>
    <h3>내 요청</h3><div className="team-request-history">{[...requests].reverse().slice(0, 20).map((r) => <article key={r.id} className={`team-request ${r.status}`}><strong>{r.text}</strong><div>{requestStatus[r.status]} · {new Date(r.at).toLocaleTimeString()}</div></article>)}{!requests.length && <p className="hint">보낸 요청이 없습니다.</p>}</div>
  </section>;
}
