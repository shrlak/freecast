import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
// @ts-expect-error plain .mjs server module
import { cleanOutput, cloudflaredAsset, isPublicHost, parseMetricsAddress, parseTunnelUrl, startTunnel } from '../server/tunnel.mjs';

describe('parseTunnelUrl', () => {
  it('finds the address in cloudflared\'s log', () => {
    const log = '2026-10-21T02:00:00Z INF Requesting new quick Tunnel on trycloudflare.com...\n2026-10-21T02:00:02Z INF +--------------------------------------------------------------------------------------------+\n2026-10-21T02:00:02Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |\n2026-10-21T02:00:02Z INF |  https://Random-Words-1234.trycloudflare.com                                               |';
    expect(parseTunnelUrl(log)).toBe('https://random-words-1234.trycloudflare.com');
  });
  it('ignores the API address and logs without an address', () => {
    expect(parseTunnelUrl('failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": EOF')).toBeNull();
    expect(parseTunnelUrl('INF Starting tunnel')).toBeNull();
  });
  it('strips terminal codes for messages', () => {
    expect(cleanOutput('\x1b[49m\x1b[?25lhello\x1b[0m')).toBe('hello');
  });
});

describe('cloudflaredAsset', () => {
  it('picks the download for each computer', () => {
    expect(cloudflaredAsset('darwin', 'arm64')).toBe('cloudflared-darwin-arm64.tgz');
    expect(cloudflaredAsset('darwin', 'x64')).toBe('cloudflared-darwin-amd64.tgz');
    expect(cloudflaredAsset('win32', 'x64')).toBe('cloudflared-windows-amd64.exe');
    expect(cloudflaredAsset('freebsd', 'x64')).toBeNull();
  });
});

describe('isPublicHost', () => {
  it('treats this computer and home networks as private', () => {
    for (const h of ['localhost:47317', '127.0.0.1:47317', '[::1]:47317', '192.168.0.12:47317', '10.0.0.5', '172.20.1.1:1', 'church-mac.local', 'church-mac:47317']) {
      expect(isPublicHost(h), h).toBe(false);
    }
  });
  it('treats internet addresses (and a missing host) as public', () => {
    for (const h of ['abc123.lhr.life', 'abc123.lhr.life:443', '8.8.8.8:47317', '172.32.0.1', undefined, '']) {
      expect(isPublicHost(h), String(h)).toBe(true);
    }
  });
});

describe('tunnel recovery', () => {
  afterEach(() => { vi.useRealTimers(); });

  async function running(fetchFn: (url: string, init?: RequestInit) => Promise<Response> = vi.fn(async () => new Response('<div id="root"></div>'))) {
    vi.useFakeTimers();
    const processes: any[] = [];
    const changes: any[] = [];
    const spawnFn = vi.fn(() => {
      const proc = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
      proc.kill.mockImplementation(() => { proc.emit('close', 0); });
      processes.push(proc);
      return proc;
    });
    const tunnel = startTunnel(47317, (state: unknown) => changes.push(state), { dir: '/unused', ensureBinary: async () => '/unused/cloudflared', spawnFn, fetchFn });
    await vi.advanceTimersByTimeAsync(0);
    const ready = (index: number, name = 'one') => processes[index].stdout.emit('data', `https://${name}.trycloudflare.com\nRegistered tunnel connection`);
    ready(0);
    return { tunnel, fetchFn, spawnFn, processes, changes, ready };
  }

  it('replaces a live process whose tunnel repeatedly returns HTTP 530', async () => {
    const state = await running(vi.fn(async () => new Response('tunnel disconnected', { status: 530 })));
    try {
      await vi.advanceTimersByTimeAsync(15_000);
      expect(state.spawnFn).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(state.processes[0].kill).toHaveBeenCalledOnce();
      expect(state.spawnFn).toHaveBeenCalledTimes(2);
      state.ready(1, 'two');
      expect(state.tunnel.state()).toMatchObject({ status: 'on', url: 'https://two.trycloudflare.com' });
      // Old process events must not close or replace the new tunnel.
      state.processes[0].emit('close', 0);
      expect(state.tunnel.state().url).toBe('https://two.trycloudflare.com');
    } finally { state.tunnel.stop(); }
  });

  it('keeps a healthy tunnel and tolerates isolated network failures', async () => {
    const fetchFn = vi.fn(async () => new Response('<div id="root"></div>'));
    fetchFn.mockRejectedValueOnce(new Error('temporary network drop'));
    const state = await running(fetchFn);
    try {
      await vi.advanceTimersByTimeAsync(45_000);
      expect(fetchFn).toHaveBeenCalledTimes(3);
      expect(state.spawnFn).toHaveBeenCalledTimes(1);
      expect(state.processes[0].kill).not.toHaveBeenCalled();
    } finally { state.tunnel.stop(); }
  });

  // This computer cannot look up its own brand-new public address (its DNS remembers the failed
  // lookup, or a filter blocks trycloudflare.com) although phones reach the tunnel fine.
  const unreachableFromHere = (ready: Response | Error) => vi.fn(async (url: string) => {
    if (url.startsWith('http://127.0.0.1:53421/ready')) { if (ready instanceof Error) throw ready; return ready; }
    throw new Error('getaddrinfo ENOTFOUND one.trycloudflare.com');
  });
  it('keeps a tunnel this computer cannot reach while cloudflared says it is connected', async () => {
    const fetchFn = unreachableFromHere(new Response('{"status":200,"readyConnections":4}'));
    const state = await running(fetchFn);
    try {
      state.processes[0].stderr.emit('data', 'INF Starting metrics server on 127.0.0.1:53421/metrics\n');
      await vi.advanceTimersByTimeAsync(120_000);
      expect(state.spawnFn).toHaveBeenCalledTimes(1);
      expect(state.processes[0].kill).not.toHaveBeenCalled();
      expect(fetchFn.mock.calls.some(([url]) => url === 'http://127.0.0.1:53421/ready')).toBe(true);
      expect(state.tunnel.state()).toMatchObject({ status: 'on', url: 'https://one.trycloudflare.com' });
    } finally { state.tunnel.stop(); }
  });
  it('replaces the tunnel when it is unreachable and cloudflared has no connection either', async () => {
    for (const ready of [new Response('{"status":503,"readyConnections":0}', { status: 503 }), new Error('connection refused')]) {
      const state = await running(unreachableFromHere(ready));
      try {
        state.processes[0].stderr.emit('data', 'INF Starting metrics server on 127.0.0.1:53421/metrics\n');
        await vi.advanceTimersByTimeAsync(30_000);
        expect(state.processes[0].kill).toHaveBeenCalledOnce();
        expect(state.spawnFn).toHaveBeenCalledTimes(2);
      } finally { state.tunnel.stop(); vi.useRealTimers(); }
    }
  });
  it('asks cloudflared for a status server on this computer only and finds its port in the log', () => {
    expect(parseMetricsAddress('2026-11-01T01:00:00Z INF Starting metrics server on 127.0.0.1:53421/metrics')).toBe('127.0.0.1:53421');
    expect(parseMetricsAddress('INF Starting metrics server on 0.0.0.0:20241/metrics')).toBeNull();
    expect(parseMetricsAddress('no metrics here')).toBeNull();
  });

  it('reconnects on resume and cancels all recovery when turned off', async () => {
    const state = await running();
    state.tunnel.restart();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.processes[0].kill).toHaveBeenCalledOnce();
    expect(state.spawnFn).toHaveBeenCalledTimes(2);
    state.ready(1, 'resumed');
    state.tunnel.stop();
    state.tunnel.restart();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(state.spawnFn).toHaveBeenCalledTimes(2);
    expect(state.fetchFn).not.toHaveBeenCalled();
  });

  it('starts only the latest attempt when resumed during the binary download', async () => {
    vi.useFakeTimers();
    const pending: ((binary: string) => void)[] = [];
    const spawnFn = vi.fn(() => Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() }));
    const tunnel = startTunnel(47317, () => {}, { dir: '/unused', spawnFn, ensureBinary: () => new Promise(resolve => pending.push(resolve)) });
    try {
      tunnel.restart();
      pending[1]('/unused/cloudflared'); await vi.advanceTimersByTimeAsync(0);
      pending[0]('/unused/cloudflared'); await vi.advanceTimersByTimeAsync(0);
      expect(spawnFn).toHaveBeenCalledTimes(1);
    } finally { tunnel.stop(); }
  });
});
