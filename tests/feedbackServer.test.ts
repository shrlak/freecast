import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
// @ts-expect-error plain ESM server module
import { cloudMiddleware } from '../server/cloud.mjs';

// FreeCast's local server (/api/cloud/feedback) → church Worker (saves, returns the email relay) →
// formsubmit (mail) → Worker (/emailed). Both remote ends are faked here.
const servers: http.Server[] = [];
async function listen(handler: http.RequestListener) {
  const s = http.createServer(handler);
  s.listen(0, '127.0.0.1'); await once(s, 'listening'); servers.push(s);
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
const readBody = async (req: http.IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c).toString(); };
const json = (res: http.ServerResponse, status: number, obj: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function fixture(opts: { worker?: (url: string, body: string, res: http.ServerResponse) => void; mail?: (res: http.ServerResponse) => void } = {}) {
  const calls: { url: string; body: string; origin?: string }[] = [];
  const mail: string[] = [];
  const mailUrl = await listen(async (req, res) => { mail.push(await readBody(req)); (opts.mail ?? ((r) => json(r, 200, { success: 'true' })))(res); });
  const workerUrl = await listen(async (req, res) => {
    const body = await readBody(req);
    calls.push({ url: req.url ?? '', body, origin: req.headers.origin });
    if (opts.worker) return opts.worker(req.url ?? '', body, res);
    if (req.url === '/freecast/feedback') return json(res, 200, { ok: true, id: 7, relay: { url: `${mailUrl}/ajax`, body: { 내용: JSON.parse(body).message } } });
    json(res, 200, { ok: true });
  });
  process.env.FREECAST_CLOUD_URL = workerUrl;
  const app = await listen((req, res) => cloudMiddleware(req, res, () => json(res, 404, { error: 'next' })));
  const post = (headers: Record<string, string> = {}) => fetch(`${app}/api/cloud/feedback`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ message: '글자가 더 컸으면', name: '김', version: '0.6.8', platform: 'test' }),
  });
  return { post, calls, mail, url: `${app}/api/cloud/feedback` };
}

afterEach(async () => {
  delete process.env.FREECAST_CLOUD_URL;
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

describe('feedback through the local server and the cloud', () => {
  it('saves in the cloud, emails from this computer and reports the result back', async () => {
    const f = await fixture();
    const res = await f.post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 7, emailed: true });
    expect(f.calls.map((c) => c.url)).toEqual(['/freecast/feedback', '/freecast/feedback/7/emailed']);
    expect(f.calls[0].origin).toMatch(/^https?:\/\//); // the Worker only answers its allowed origin
    expect(JSON.parse(f.calls[0].body).message).toBe('글자가 더 컸으면');
    expect(JSON.parse(f.calls[1].body)).toEqual({ error: null });
    expect(f.mail).toHaveLength(1);
  });

  it('still keeps the feedback when the email fails, and tells the cloud why', async () => {
    const f = await fixture({ mail: (r) => json(r, 200, { success: 'false', message: 'activate your form' }) });
    const body = await (await f.post()).json();
    expect(body).toEqual({ ok: true, id: 7, emailed: false });
    expect(JSON.parse(f.calls[1].body)).toEqual({ error: 'activate your form' });
  });

  it('passes the Worker’s refusal on to the app', async () => {
    const f = await fixture({ worker: (_u, _b, r) => json(r, 400, { error: '내용을 입력해 주세요' }) });
    const res = await f.post();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('내용을 입력해 주세요');
    expect(f.mail).toHaveLength(0);
  });

  it('reports a Worker that saved without a relay as not emailed', async () => {
    const f = await fixture({ worker: (_u, _b, r) => json(r, 200, { ok: true, id: 9 }) });
    const res = await f.post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id: 9, emailed: false });
  });

  it('gives a readable error when the cloud is unreachable', async () => {
    const f = await fixture();
    process.env.FREECAST_CLOUD_URL = 'http://127.0.0.1:1';
    const res = await f.post();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('클라우드 서버에 연결할 수 없습니다');
  });

  it('rejects an oversized message before it reaches the cloud', async () => {
    const f = await fixture();
    const res = await fetch(f.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(70_000) }) });
    expect(res.status).toBe(413);
    expect(f.calls).toHaveLength(0);
  });

  it('refuses cross-site requests', async () => {
    const f = await fixture();
    expect((await f.post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
});
