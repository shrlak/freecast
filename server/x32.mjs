// Behringer X32 / M32 over the network (OSC on UDP 10023), so the mixer can work FreeCast over Wi-Fi.
// FreeCast subscribes with /xremote, and the X32 then reports every change made on the console
// (a mute button, a user-assign button…); the console page turns the learned ones into slide actions.
import dgram from 'node:dgram';
import os from 'node:os';

const PORT = 10023;
const RENEW_MS = 8000; // /xremote lasts 10 s
const LOST_MS = 20000;

const pad4 = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
const oscString = (s) => pad4(Buffer.from(s, 'utf8'));

/** One OSC message. args: numbers are sent as int32 when whole, float32 otherwise; strings as s. */
export function oscMessage(address, args = []) {
  const tags = ',' + args.map((a) => (typeof a === 'string' ? 's' : Number.isInteger(a) ? 'i' : 'f')).join('');
  const data = args.map((a) => {
    if (typeof a === 'string') return oscString(a);
    const b = Buffer.alloc(4);
    if (Number.isInteger(a)) b.writeInt32BE(a); else b.writeFloatBE(a);
    return b;
  });
  return Buffer.concat([oscString(address), oscString(tags), ...data]);
}

function readString(buf, at) {
  const end = buf.indexOf(0, at);
  if (end < 0) return null;
  return { value: buf.toString('utf8', at, end), next: at + Math.ceil((end - at + 1) / 4) * 4 };
}

/** { address, args: [{ type, value }] }, or null for anything that is not a plain OSC message. */
export function parseOsc(buf) {
  try {
    const addr = readString(buf, 0);
    if (!addr || !addr.value.startsWith('/')) return null;
    const tags = readString(buf, addr.next);
    if (!tags || !tags.value.startsWith(',')) return { address: addr.value, args: [] };
    let at = tags.next;
    const args = [];
    for (const t of tags.value.slice(1)) {
      if (t === 'i') { args.push({ type: 'i', value: buf.readInt32BE(at) }); at += 4; }
      else if (t === 'f') { args.push({ type: 'f', value: buf.readFloatBE(at) }); at += 4; }
      else if (t === 's') { const s = readString(buf, at); if (!s) return null; args.push({ type: 's', value: s.value }); at = s.next; }
      else if (t === 'b') { const n = buf.readInt32BE(at); at += 4 + Math.ceil(n / 4) * 4; args.push({ type: 'b', value: null }); }
      else return null;
    }
    return { address: addr.value, args };
  } catch {
    return null;
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
export const isIpv4 = (ip) => typeof ip === 'string' && IPV4.test(ip) && ip.split('.').every((n) => Number(n) <= 255);

/** Subnet broadcast addresses of this computer's networks (plus the global one). */
function broadcastAddresses() {
  const out = new Set(['255.255.255.255']);
  for (const i of Object.values(os.networkInterfaces()).flat()) {
    if (!i || i.family !== 'IPv4' || i.internal || !i.netmask) continue;
    const ip = i.address.split('.').map(Number);
    const mask = i.netmask.split('.').map(Number);
    out.add(ip.map((n, k) => (n & mask[k]) | (~mask[k] & 255)).join('.'));
  }
  return [...out];
}

/** The X32 link: one at a time, renewed every few seconds, reported to every open console. */
export function createX32Link({ createSocket = () => dgram.createSocket('udp4'), now = () => Date.now() } = {}) {
  let socket = null;
  let timer = null;
  let state = { status: 'off', ip: null, name: null, model: null, version: null };
  let lastReply = 0;
  const listeners = new Set();
  const emit = (event) => listeners.forEach((fn) => fn(event));
  const set = (patch) => { state = { ...state, ...patch }; emit({ type: 'status', ...state }); };
  const send = (address, args) => socket?.send(oscMessage(address, args), PORT, state.ip);

  const tick = () => {
    send('/xremote');
    send('/info');
    if (state.status === 'connected' && now() - lastReply > LOST_MS) set({ status: 'lost' });
  };

  function disconnect() {
    clearInterval(timer);
    timer = null;
    socket?.close();
    socket = null;
    set({ status: 'off', ip: null, name: null, model: null, version: null });
  }

  function connect(ip) {
    if (!isIpv4(ip)) throw new Error('X32 IP 주소가 올바르지 않습니다.');
    if (socket && state.ip === ip) return state;
    disconnect();
    socket = createSocket();
    socket.on('error', () => undefined);
    socket.on('message', (msg, rinfo) => {
      if (rinfo.address !== state.ip) return;
      const m = parseOsc(msg);
      if (!m) return;
      lastReply = now();
      if (m.address === '/info' || m.address === '/xinfo') {
        const s = m.args.map((a) => a.value);
        set(m.address === '/info' ? { status: 'connected', model: s[2] ?? null, version: s[3] ?? null } : { status: 'connected', name: s[1] ?? null, model: s[2] ?? null, version: s[3] ?? null });
        return;
      }
      if (state.status !== 'connected') set({ status: 'connected' });
      // Buttons and mutes are whole numbers; faders and knobs (floats) never turn a slide.
      if (m.args.length === 1 && m.args[0].type === 'i') emit({ type: 'osc', address: m.address, value: m.args[0].value });
    });
    set({ status: 'connecting', ip, name: null, model: null, version: null });
    socket.bind(() => { send('/xinfo'); tick(); });
    timer = setInterval(tick, RENEW_MS);
    return state;
  }

  /** Ask every X32 on this computer's networks to answer (/xinfo), for about a second. */
  function scan(waitMs = 1200) {
    return new Promise((resolve) => {
      const found = new Map();
      const s = createSocket();
      s.on('error', () => undefined);
      s.on('message', (msg, rinfo) => {
        const m = parseOsc(msg);
        if (m?.address !== '/xinfo') return;
        const [ip, name, model, version] = m.args.map((a) => a.value);
        found.set(rinfo.address, { ip: isIpv4(ip) ? ip : rinfo.address, name: name ?? null, model: model ?? null, version: version ?? null });
      });
      s.bind(() => {
        s.setBroadcast(true);
        for (const addr of broadcastAddresses()) s.send(oscMessage('/xinfo'), PORT, addr);
      });
      setTimeout(() => { s.close(); resolve([...found.values()]); }, waitMs);
    });
  }

  return {
    connect, disconnect, scan,
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); fn({ type: 'status', ...state }); return () => listeners.delete(fn); },
  };
}

const link = createX32Link();
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * /api/x32/* for the console on this computer only (phones on the network and the internet
 * address never reach it): GET events (server-sent events), POST connect {ip}, disconnect, scan.
 */
export async function x32Middleware(req, res, next) {
  if (!req.url?.startsWith('/api/x32/')) return next();
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (!LOOPBACK.has(req.socket.remoteAddress ?? '')) return reply(403, { error: 'X32는 FreeCast를 실행한 컴퓨터에서만 연결할 수 있습니다.' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Cross-site requests are not allowed' });
  const route = req.url.split('?')[0].slice('/api/x32/'.length);
  if (route === 'events' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const off = link.subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { off(); clearInterval(keepAlive); });
    return;
  }
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 2000) return reply(413, { error: 'Too large' });
  }
  try {
    if (route === 'connect') return reply(200, link.connect(JSON.parse(raw || '{}').ip));
    if (route === 'disconnect') { link.disconnect(); return reply(200, link.state); }
    if (route === 'scan') return reply(200, { found: await link.scan() });
    reply(404, { error: 'Not found' });
  } catch (e) {
    reply(400, { error: e.message });
  }
}
