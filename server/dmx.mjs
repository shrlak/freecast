// DMX lighting over Art-Net (UDP 6454). Keeps the last value of every channel per universe so
// a macro can change a few channels without blacking out the rest.
import dgram from 'node:dgram';

const universes = new Map();
let socket = null;

function getSocket() {
  if (!socket) {
    socket = dgram.createSocket('udp4');
    socket.on('error', () => undefined);
    socket.bind(() => socket.setBroadcast(true));
  }
  return socket;
}

/** Build an ArtDmx packet (Art-Net 4, protocol 14) for one universe. */
export function artDmxPacket(universe, data) {
  const header = Buffer.alloc(18);
  header.write('Art-Net\0', 0, 'ascii');
  header.writeUInt16LE(0x5000, 8); // OpDmx
  header.writeUInt16BE(14, 10); // protocol version
  header.writeUInt8(0, 12); // sequence (0 = off)
  header.writeUInt8(0, 13); // physical
  header.writeUInt16LE(universe & 0x7fff, 14);
  header.writeUInt16BE(512, 16);
  return Buffer.concat([header, Buffer.from(data)]);
}

export function sendDmx(ip, universe, channels) {
  const u = Number(universe) | 0;
  const data = universes.get(u) ?? new Uint8Array(512);
  for (const [ch, v] of Object.entries(channels)) {
    const i = Number(ch) - 1;
    if (i >= 0 && i < 512) data[i] = Math.max(0, Math.min(255, Number(v) | 0));
  }
  universes.set(u, data);
  return new Promise((resolve) => getSocket().send(artDmxPacket(u, data), 6454, ip, () => resolve()));
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** POST /api/dmx {ip, universe, channels} — same-origin only (cross-site requests are refused). */
export async function dmxMiddleware(req, res, next) {
  if (!req.url?.startsWith('/api/dmx')) return next();
  const reply = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });
  if (req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Cross-site requests are not allowed' });
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20000) return reply(413, { error: 'Too large' });
  }
  try {
    const { ip = '255.255.255.255', universe = 0, channels = {} } = JSON.parse(raw || '{}');
    if (!IPV4.test(ip) || ip.split('.').some((n) => Number(n) > 255)) return reply(400, { error: 'ip must be an IPv4 address' });
    if (typeof channels !== 'object' || Array.isArray(channels)) return reply(400, { error: 'channels must be an object' });
    await sendDmx(ip, universe, channels);
    reply(200, { ok: true });
  } catch (e) {
    reply(400, { error: e.message });
  }
}
