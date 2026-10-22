import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS modules
import { linkAddress, newLinkCredentials, registerLink, removeLink } from '../server/remoteLink.mjs';
// @ts-expect-error plain JS modules
import { handleRemoteLink } from '../worker/remote-link.js';

const opts = { proxy: 'https://w.example.workers.dev/', origin: 'https://o.example', id: 'abc12345', secret: 's'.repeat(30), url: 'https://x-y.trycloudflare.com' };

describe('remote link (app side)', () => {
  it('makes unique url-safe credentials', () => {
    const a = newLinkCredentials(), b = newLinkCredentials();
    expect(a.id).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(a.secret.length).toBeGreaterThanOrEqual(16);
    expect(a.id).not.toBe(b.id);
  });
  it('builds the permanent address on the Worker', () => {
    expect(linkAddress('https://w.example.workers.dev/', 'abc')).toBe('https://w.example.workers.dev/freecast/remote/abc');
  });
  it('PUTs the tunnel address with the Worker origin', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const r = await registerLink(opts, async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"ok":true}'); });
    expect(r).toEqual({ ok: true });
    expect(seen!.url).toBe('https://w.example.workers.dev/freecast/remote/abc12345');
    expect(seen!.init.method).toBe('PUT');
    expect((seen!.init.headers as Record<string, string>).Origin).toBe('https://o.example');
    expect(JSON.parse(String(seen!.init.body))).toEqual({ secret: opts.secret, url: opts.url });
  });
  it('tells a Worker without the route from other failures', async () => {
    const missing = await registerLink(opts, async () => new Response('{"error":"not found"}', { status: 404 }));
    expect(missing).toMatchObject({ ok: false, missing: true });
    const denied = await registerLink(opts, async () => new Response('{"error":"wrong secret"}', { status: 403 }));
    expect(denied).toEqual({ ok: false, missing: false, error: 'wrong secret' });
    const down = await registerLink(opts, async () => { throw new Error('offline'); });
    expect(down).toEqual({ ok: false, missing: false, error: 'offline' });
    expect((await removeLink(opts, async (_u: string, init: RequestInit) => new Response(init.method === 'DELETE' ? '{}' : 'no'))).ok).toBe(true);
  });
});

describe('remote link (Worker side)', () => {
  const kv = () => {
    const m = new Map<string, string>();
    return { get: async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null), put: async (k: string, v: string) => void m.set(k, v), delete: async (k: string) => void m.delete(k) };
  };
  const env = { REMOTE_LINKS: kv() };
  const req = (method: string, id: string, body?: unknown) => new Request(`https://w.example/freecast/remote/${id}`, { method, body: body ? JSON.stringify(body) : undefined });
  const secret = 'a'.repeat(24);

  it('ignores other paths', async () => {
    expect(await handleRemoteLink(new Request('https://w.example/gemini/x'), env)).toBeNull();
  });
  it('forwards a registered link to the tunnel and only the owner can change it', async () => {
    expect((await handleRemoteLink(req('GET', 'link12345'), env)).status).toBe(404);
    expect((await handleRemoteLink(req('PUT', 'link12345', { secret, url: 'https://one.trycloudflare.com' }), env)).status).toBe(200);
    const go = await handleRemoteLink(req('GET', 'link12345'), env);
    expect(go.status).toBe(302);
    expect(go.headers.get('location')).toBe('https://one.trycloudflare.com/?view=remote');
    // Same secret moves it to the new tunnel; another secret is refused.
    expect((await handleRemoteLink(req('PUT', 'link12345', { secret, url: 'https://two.trycloudflare.com' }), env)).status).toBe(200);
    expect((await handleRemoteLink(req('GET', 'link12345'), env)).headers.get('location')).toContain('two.trycloudflare.com');
    expect((await handleRemoteLink(req('PUT', 'link12345', { secret: 'b'.repeat(24), url: 'https://evil.trycloudflare.com' }), env)).status).toBe(403);
    expect((await handleRemoteLink(req('DELETE', 'link12345', { secret: 'b'.repeat(24) }), env)).status).toBe(403);
  });
  it('only accepts trycloudflare addresses, and DELETE removes the link', async () => {
    expect((await handleRemoteLink(req('PUT', 'link67890', { secret, url: 'https://evil.example.com' }), env)).status).toBe(400);
    await handleRemoteLink(req('PUT', 'link67890', { secret, url: 'https://ok.trycloudflare.com' }), env);
    expect((await handleRemoteLink(req('DELETE', 'link67890', { secret }), env)).status).toBe(200);
    expect((await handleRemoteLink(req('GET', 'link67890'), env)).status).toBe(404);
  });
});
