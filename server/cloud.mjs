// /api/cloud/* → the church Worker's /freecast/* routes (accounts + shared slide library).
// /api/cloud/feedback → saved by the Worker, then emailed from here (see sendFeedback).
// /api/songs   → the Worker's /libraries/lyrics: the 찬양 라이브러리 the ppt site reads and registers
//                songs into (registration needs no password; DELETE requires the administrator token).
// Going through this local server means the Worker sees its allowed origin and the browser
// never deals with CORS. FREECAST_CLOUD_URL overrides the Worker address (e.g. wrangler dev).
import { aiConfig } from './aiProviders.mjs';

const cloudBase = () => (process.env.FREECAST_CLOUD_URL || aiConfig().proxyUrl).replace(/\/+$/, '');

/**
 * Feedback: the Worker saves it and hands back the formsubmit.co email to send, which goes out
 * from this computer (formsubmit.co rate-limits Cloudflare's shared addresses).
 */
async function sendFeedback(req, res) {
  const headers = { Origin: aiConfig().proxyOrigin, 'content-type': 'application/json' };
  const reply = (status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const saved = await fetch(`${cloudBase()}/freecast/feedback`, { method: 'POST', headers, body: Buffer.concat(chunks), signal: AbortSignal.timeout(30_000) });
    const data = await saved.json().catch(() => ({}));
    if (!saved.ok || !data.relay) return reply(saved.status, data.relay ? data : { ...data, emailed: false });
    let error = null;
    try {
      const mail = await fetch(data.relay.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', origin: 'https://shrlak.github.io', referer: 'https://shrlak.github.io/freecast/' },
        body: JSON.stringify(data.relay.body),
        signal: AbortSignal.timeout(30_000),
      });
      const out = await mail.json().catch(() => ({}));
      if (!mail.ok || String(out.success) === 'false') error = String(out.message || `formsubmit ${mail.status}`);
    } catch (e) {
      error = e.message;
    }
    await fetch(`${cloudBase()}/freecast/feedback/${data.id}/emailed`, { method: 'POST', headers, body: JSON.stringify({ error }) }).catch(() => undefined);
    reply(200, { ok: true, id: data.id, emailed: !error });
  } catch (e) {
    reply(502, { error: `클라우드 서버에 연결할 수 없습니다 (${e.message})` });
  }
}

export async function cloudMiddleware(req, res, next) {
  const songs = req.url === '/api/songs' || req.url?.startsWith('/api/songs?');
  if (!req.url?.startsWith('/api/cloud/') && !songs) return next();
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    res.writeHead(403, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Cross-site requests are not allowed' }));
  }
  if (req.url === '/api/cloud/feedback' && req.method === 'POST') return sendFeedback(req, res);
  const target = songs
    ? `${aiConfig().proxyUrl.replace(/\/+$/, '')}/libraries/lyrics`
    : `${cloudBase()}/freecast/${req.url.slice('/api/cloud/'.length)}`;
  const headers = { Origin: aiConfig().proxyOrigin };
  for (const h of ['authorization', 'content-type', 'x-admin-password']) if (req.headers[h]) headers[h] = req.headers[h];
  try {
    const hasBody = !['GET', 'HEAD'].includes(req.method ?? 'GET');
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? 'half' : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    const out = { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' };
    res.writeHead(upstream.status, out);
    if (upstream.status === 204 || !upstream.body) return res.end();
    for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (e) {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `클라우드 서버에 연결할 수 없습니다 (${e.message})` }));
  }
}
