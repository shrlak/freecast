import { randomUUID } from 'node:crypto';

/** Requests live only in this running relay; only hosts and the original sender see them. */
export function teamRequests(wss) {
  let requests = [];
  const connectedHost = () => [...wss.clients].some((c) => c.readyState === 1 && c.role === 'host');
  const publish = () => {
    requests = requests.filter((r) => Date.now() - r.at < 3600000);
    for (const c of wss.clients) if (c.readyState === 1 && ['host', 'remote', 'team'].includes(c.role)) {
      const visible = c.role === 'host' ? requests : requests.filter((r) => r.senderId === c.remoteIdentity?.id);
      c.send(JSON.stringify({ type: 'team-requests', requests: visible }));
    }
  };
  const timer = setInterval(publish, 60000); timer.unref(); wss.once('close', () => clearInterval(timer));
  return { publish,
    receive(ws, msg) {
      const entry = ws.remoteIdentity;
      if (ws.role === 'host' && msg.action === 'status' && ['acknowledged', 'done'].includes(msg.status)) {
        requests = requests.map((r) => r.id === msg.id ? { ...r, status: msg.status } : r); publish(); return;
      }
      if (!['remote', 'team'].includes(ws.role) || !entry || msg.action !== 'send') return;
      const error = (message) => ws.send(JSON.stringify({ type: 'team-request-error', message }));
      if (typeof msg.id !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(msg.id) || typeof msg.text !== 'string' || msg.text.length > 120) return error('요청 내용을 120자 이내로 입력해 주세요.');
      const text = msg.text.replace(/[\u0000-\u001f]/g, ' ').trim();
      if (!text) return error('요청 내용을 입력해 주세요.');
      if (!connectedHost()) return error('컴퓨터에 연결된 뒤 다시 보내 주세요. 요청은 자동으로 재전송되지 않습니다.');
      if (requests.some((r) => r.senderId === entry.id && r.clientRequestId === msg.id)) { publish(); return; }
      if (Date.now() - (entry.lastRequestAt ?? 0) < 2000) return error('잠시 기다린 뒤 보내 주세요.');
      requests = requests.filter((r) => Date.now() - r.at < 3600000);
      if (requests.length >= 100) requests = requests.filter((r) => r.status !== 'done');
      if (requests.length >= 100) return error('대기 중인 요청이 많습니다. 방송실 확인 후 다시 보내 주세요.');
      entry.lastRequestAt = Date.now();
      requests.push({ id: randomUUID(), clientRequestId: msg.id, senderId: entry.id, name: entry.name, text, at: Date.now(), status: 'pending' });
      publish();
    },
  };
}
