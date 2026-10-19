// WebSocket relay so phones, tablets and other computers on the network can act as
// remote controls, stage displays or outputs for the operator console.
import { WebSocketServer } from 'ws';

const PIN = process.env.FREECAST_REMOTE_PIN || '';
const COMMANDS = new Set([
  'live/next', 'live/prev', 'live/clearAll', 'live/clearText', 'live/clearBackground', 'live/toggleBlack',
  'live/go', 'playlist/select', 'macro/run', 'timer/op', 'prop/toggle', 'live/message',
  'live/logo', 'live/stageMessage', 'prop/clearAll', 'announce/stop',
]);

/** Only well-formed commands from the whitelist reach the operator. */
function validCommand(c) {
  if (!c || typeof c !== 'object' || !COMMANDS.has(c.type)) return false;
  for (const [k, v] of Object.entries(c)) {
    if (k === 'type') continue;
    if (!['string', 'number', 'boolean'].includes(typeof v) && v !== null) return false;
    if (typeof v === 'string' && v.length > 500) return false;
  }
  return true;
}

/** Returns the WebSocket server plus helpers for the HTTP control API. */
export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  let lastState = null;
  let lastInfo = null;

  httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/freecast-ws')) return;
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  const broadcast = (data, filter) => {
    for (const c of wss.clients) if (c.readyState === 1 && filter(c)) c.send(data);
  };

  wss.on('connection', (ws) => {
    ws.role = null;
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg?.type === 'hello') {
        const role = ['host', 'viewer', 'remote'].includes(msg.role) ? msg.role : 'viewer';
        if (role === 'remote' && PIN && msg.pin !== PIN) {
          ws.send(JSON.stringify({ type: 'error', error: 'Wrong PIN' }));
          return ws.close();
        }
        ws.role = role;
        ws.send(JSON.stringify({ type: 'welcome', pinRequired: Boolean(PIN) }));
        if (role !== 'host') {
          if (lastState) ws.send(lastState);
          if (lastInfo && role === 'remote') ws.send(lastInfo);
        }
        return;
      }
      if (ws.role === 'host' && msg?.type === 'state') {
        lastState = String(raw);
        broadcast(lastState, (c) => c.role === 'viewer' || c.role === 'remote');
      } else if (ws.role === 'host' && msg?.type === 'info') {
        lastInfo = String(raw);
        broadcast(lastInfo, (c) => c.role === 'remote');
      } else if (ws.role === 'remote' && msg?.type === 'command' && validCommand(msg.command)) {
        broadcast(JSON.stringify({ type: 'command', command: msg.command }), (c) => c.role === 'host');
      }
    });
  });
  wss.toHost = (command) => {
    if (!validCommand(command)) return false;
    let sent = false;
    for (const c of wss.clients) {
      if (c.readyState === 1 && c.role === 'host') {
        c.send(JSON.stringify({ type: 'command', command }));
        sent = true;
      }
    }
    return sent;
  };
  wss.lastState = () => (lastState ? JSON.parse(lastState).state : null);
  return wss;
}
