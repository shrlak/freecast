import { randomUUID } from 'node:crypto';

/** Connection tokens stay private; public roster IDs cannot be used to impersonate an owner. */
export function remoteControl(wss) {
  const identities = new Map();
  let controller = null, assigned = false;
  const connected = (entry) => entry.socket?.readyState === 1;
  const name = (value) => typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 80) : '';
  const roster = () => [...identities.values()].filter((e) => connected(e) || e.id === controller).map((e) => ({ id: e.id, name: e.name, connected: connected(e), requested: e.requested }));
  const owns = (ws) => !!ws.remoteIdentity && ws.remoteIdentity.id === controller && ws.remoteIdentity.socket === ws;
  const publish = () => {
    const clients = roster();
    for (const ws of wss.clients) if (ws.readyState === 1 && ['host', 'remote'].includes(ws.role)) ws.send(JSON.stringify({ type: 'remote-control', selfId: ws.remoteIdentity?.id ?? null, controllerId: controller, canControl: owns(ws), clients }));
  };
  return {
    owns, publish,
    register(ws, msg) {
      const token = typeof msg.clientToken === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(msg.clientToken) ? msg.clientToken : randomUUID();
      for (const [key, entry] of identities) if (!connected(entry) && entry.id !== controller && Date.now() - entry.seen > 3600000) identities.delete(key);
      let entry = identities.get(token);
      if (!entry) { entry = { id: randomUUID(), name: name(msg.name) || `리모컨 ${identities.size + 1}`, requested: false, seen: Date.now(), socket: null }; identities.set(token, entry); }
      entry.socket = ws; entry.seen = Date.now(); if (name(msg.name)) entry.name = name(msg.name);
      ws.remoteIdentity = entry;
      if (!assigned) { assigned = true; controller = entry.id; }
      publish();
    },
    receive(ws, msg) {
      const entry = ws.remoteIdentity;
      if (ws.role === 'remote' && msg.action === 'request' && entry?.socket === ws) { entry.requested = true; publish(); return; }
      if (ws.role === 'remote' && msg.action === 'rename' && entry?.socket === ws) { if (name(msg.name)) entry.name = name(msg.name); publish(); return; }
      if (ws.role !== 'host' && !(owns(ws) && msg.action === 'handoff')) return;
      const target = [...identities.values()].find((e) => e.id === msg.id);
      if (['grant', 'handoff'].includes(msg.action) && target && connected(target)) { controller = target.id; assigned = true; target.requested = false; }
      if (msg.action === 'revoke' && (!msg.id || msg.id === controller)) { controller = null; assigned = true; }
      if (msg.action === 'rename' && target && name(msg.name)) target.name = name(msg.name);
      publish();
    },
    close(ws) { if (ws.remoteIdentity?.socket === ws) { ws.remoteIdentity.seen = Date.now(); ws.remoteIdentity.socket = null; } publish(); },
  };
}
