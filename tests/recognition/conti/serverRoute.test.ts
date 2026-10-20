// /api/recognition/*: the pipeline's only way out — to the church Worker (with its allowed origin)
// or, with the operator's own keys, straight to Google / OpenRouter. Nothing else is forwarded.
import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain ESM server module
import { recognitionMiddleware, recognitionTarget } from '../../../server/recognition.mjs';

const cfg = { proxyUrl: 'https://worker.test', proxyOrigin: 'https://shrlak.github.io', geminiKey: '', openrouterKey: '' };

describe('recognitionTarget', () => {
  it('sends model calls through the Worker with its origin when there is no own key', () => {
    expect(recognitionTarget('gemini/gemini-3.6-flash', '', cfg)).toEqual({ url: 'https://worker.test/gemini/gemini-3.6-flash', headers: { Origin: 'https://shrlak.github.io' } });
    expect(recognitionTarget('lyrics', '?title=x', cfg).url).toBe('https://worker.test/lyrics?title=x');
  });

  it('calls the provider directly with an own key, never putting it anywhere but that request', () => {
    const own = recognitionTarget('gemini/gemini-3.6-flash', '', { ...cfg, geminiKey: 'k1' });
    expect(own.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=k1');
    const or = recognitionTarget('openrouter', '', { ...cfg, openrouterKey: 'k2' });
    expect(or.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(or.headers.Authorization).toBe('Bearer k2');
  });
});

describe('recognitionMiddleware', () => {
  let server: http.Server | undefined;
  afterEach(() => {
    server?.close();
    vi.unstubAllGlobals();
  });

  const start = () => new Promise<string>((resolve) => {
    server = http.createServer((req, res) => recognitionMiddleware(req, res, () => res.end('next')));
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as { port: number }).port}`));
  });

  it('refuses routes the pipeline does not use and cross-site callers', async () => {
    const base = await start();
    const upstream = vi.fn();
    const realFetch = fetch;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (url.startsWith(base) ? realFetch(url, init) : upstream(url, init)));
    expect((await fetch(`${base}/api/recognition/libraries/lyrics`, { method: 'PUT' })).status).toBe(404);
    expect((await fetch(`${base}/api/recognition/settings`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${base}/api/recognition/settings`, { headers: { 'sec-fetch-site': 'cross-site' } })).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
    expect(await (await fetch(`${base}/other`)).text()).toBe('next');
  });

  it('forwards an allowed call and passes the status and Retry-After back', async () => {
    const base = await start();
    const realFetch = fetch;
    const upstream = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"error":"busy"}', { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '3' } }));
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => (url.startsWith(base) ? realFetch(url, init) : upstream(url, init)));
    const r = await fetch(`${base}/api/recognition/openrouter`, { method: 'POST', body: '{"model":"m"}' });
    expect(r.status).toBe(503);
    expect(r.headers.get('retry-after')).toBe('3');
    expect(upstream).toHaveBeenCalledOnce();
    const [, init] = upstream.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toBe('{"model":"m"}');
  });
});
