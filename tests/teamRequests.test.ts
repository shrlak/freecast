import { describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import type { TeamRequest } from '../src/domain/teamRequests';
import type { RemoteControlState } from '../src/domain/remoteControl';
// @ts-expect-error plain ESM server module
import { attachRelay } from '../server/relay.mjs';

async function fixture() {
  const server = http.createServer(), relay = attachRelay(server, { publicOpen: () => true, teamKey: () => 'a'.repeat(64) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  const port = address.port, sockets: WebSocket[] = [];
  async function connect(role: string, token = 'private-connection-token-for-' + role, name = role, path = '/freecast-ws', headers: Record<string, string> = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers }); sockets.push(ws);
    const packets: Record<string, unknown>[] = [];
    ws.on('message', (raw) => packets.push(JSON.parse(String(raw))));
    await once(ws, 'open');
    const send = (m: unknown) => ws.send(JSON.stringify(m));
    const flush = async () => {
      const pong = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('No pong')), 2000);
        const onMessage = (raw: WebSocket.RawData) => { if (JSON.parse(String(raw)).type === 'pong') { clearTimeout(timer); ws.off('message', onMessage); resolve(); } };
        ws.on('message', onMessage);
      }); send({ type: 'ping' }); await pong;
    };
    send({ type: 'hello', role, clientToken: token, name }); await flush();
    const requests = () => (packets.filter((p) => p.type === 'team-requests').at(-1)?.requests ?? []) as TeamRequest[];
    const control = () => packets.filter((p) => p.type === 'remote-control').at(-1) as unknown as RemoteControlState;
    return { ws, send, flush, packets, requests, control };
  }
  return { connect, async close() { sockets.forEach((s) => s.terminate()); for (const c of relay.clients) c.terminate(); await new Promise<void>((r) => relay.close(r)); await new Promise<void>((r) => server.close(() => r())); } };
}
const waitFor = async (fn: () => boolean) => expect.poll(fn, { timeout: 2000 }).toBe(true);
const request = (text: string, id = 'message-id-123456789') => ({ type: 'team-request', action: 'send', id, text });

describe('private stage-team requests', () => {
  it('does not grant the first team phone control and refuses grants, forged roles, commands and macros', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), team = await f.connect('team', undefined, '무대팀', '/freecast-team-ws');
      await waitFor(() => host.control().clients.some((c) => c.name === '무대팀'));
      const id = host.control().clients.find((c) => c.name === '무대팀')!.id;
      expect(host.control().controllerId).toBeNull();
      host.send({ type: 'remote-control', action: 'grant', id }); await host.flush();
      expect(host.control().controllerId).toBeNull();
      team.send({ type: 'hello', role: 'host' });
      for (const command of [{ type: 'live/next' }, { type: 'macro/run', id: 'm' }, { type: 'show/end' }]) team.send({ type: 'command', command });
      team.send({ type: 'remote-control', action: 'grant', id }); await team.flush();
      expect(host.packets.filter((p) => p.type === 'command')).toEqual([]);
      const remote = await f.connect('remote'); expect(remote.control().canControl).toBe(true);
    } finally { await f.close(); }
  });
  it('sends private requests only to the host and sender, with host-only acknowledgement and completion', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), viewer = await f.connect('viewer');
      const team = await f.connect('team', undefined, '찬양 인도자', '/freecast-team-ws');
      const other = await f.connect('remote');
      team.send(request('후렴 한 번 더')); await waitFor(() => host.requests().length === 1);
      expect(host.requests()[0]).toMatchObject({ name: '찬양 인도자', text: '후렴 한 번 더', status: 'pending' });
      expect(team.requests()).toEqual(host.requests());
      expect(other.requests()).toEqual([]); expect(JSON.stringify(viewer.packets)).not.toContain('후렴 한 번 더');
      expect(host.packets.filter((p) => p.type === 'command')).toEqual([]);
      const id = host.requests()[0].id;
      team.send({ type: 'team-request', action: 'status', id, status: 'done' }); await team.flush();
      expect(host.requests()[0].status).toBe('pending');
      host.send({ type: 'team-request', action: 'status', id, status: 'acknowledged' }); await waitFor(() => team.requests()[0]?.status === 'acknowledged');
      host.send({ type: 'team-request', action: 'status', id, status: 'done' }); await waitFor(() => team.requests()[0]?.status === 'done');
      expect(JSON.stringify(other.packets)).not.toContain('후렴 한 번 더');
    } finally { await f.close(); }
  });
  it('lets a view-only remote request help without acquiring presentation control', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'); await f.connect('remote');
      const viewOnly = await f.connect('remote', 'other-view-only-private-token');
      expect(viewOnly.control().canControl).toBe(false);
      viewOnly.send(request('잠시 대기')); await waitFor(() => host.requests().length === 1);
      expect(viewOnly.control().canControl).toBe(false);
      expect(host.packets.filter((p) => p.type === 'command')).toEqual([]);
    } finally { await f.close(); }
  });
  it('retains only a sender’s own requests across reconnects and never leaks a private connection token', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      const team = await f.connect('team', 'team-private-reconnect-token', '성가대', '/freecast-team-ws');
      team.send(request('가사 확인 부탁')); await waitFor(() => host.requests().length === 1);
      team.ws.close(); await once(team.ws, 'close');
      const back = await f.connect('team', 'team-private-reconnect-token', '성가대', '/freecast-team-ws');
      expect(back.requests()).toHaveLength(1);
      const otherRole = await f.connect('remote', 'team-private-reconnect-token');
      expect(otherRole.requests()).toEqual([]);
      expect(JSON.stringify(host.packets)).not.toContain('team-private-reconnect-token');
    } finally { await f.close(); }
  });
  it('lets an already open tab send a request after the same device opens another team tab', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      const first = await f.connect('team', 'same-team-browser-private-token', '팀', '/freecast-team-ws');
      const second = await f.connect('team', 'same-team-browser-private-token', '팀', '/freecast-team-ws');
      first.send(request('기존 창의 요청')); await waitFor(() => host.requests().length === 1);
      await waitFor(() => second.requests()[0]?.text === '기존 창의 요청');
    } finally { await f.close(); }
  });
  it('rejects offline and invalid requests, prevents duplicate delivery, and limits rapid repeated requests', async () => {
    const f = await fixture();
    try {
      const team = await f.connect('team', undefined, '팀', '/freecast-team-ws');
      team.send(request('잠시 대기')); await team.flush(); expect(team.packets.at(-2)?.type).toBe('team-request-error');
      const host = await f.connect('host'); expect(host.requests()).toEqual([]);
      team.send(request('x'.repeat(121))); team.send(request('   ')); await team.flush(); expect(host.requests()).toEqual([]);
      team.send(request('정상 요청')); await waitFor(() => host.requests().length === 1);
      team.send(request('정상 요청')); team.send(request('너무 빠른 요청', 'message-id-987654321')); await team.flush();
      expect(host.requests()).toHaveLength(1);
      expect(team.packets.some((p) => p.type === 'team-request-error' && String(p.message).includes('기다린'))).toBe(true);
    } finally { await f.close(); }
  });
  it('expires old requests without affecting actual output or saving them in the library', async () => {
    const f = await fixture(); let clock: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const host = await f.connect('host'), team = await f.connect('team', undefined, '팀', '/freecast-team-ws');
      team.send(request('만료될 요청')); await waitFor(() => host.requests().length === 1);
      const before = Date.now(); clock = vi.spyOn(Date, 'now').mockReturnValue(before + 3600001);
      host.send({ type: 'team-request', action: 'status', id: 'not-present', status: 'done' }); await waitFor(() => host.requests().length === 0);
      expect(host.packets.filter((p) => p.type === 'command')).toEqual([]);
    } finally { clock?.mockRestore(); await f.close(); }
  });
  it('team viewers receive actual output but not rehearsal state or the remote-only full slide catalogue', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      host.send({ type: 'state', state: { slide: { text: '실제 송출' } } });
      host.send({ type: 'rehearsal', active: true, state: { slide: { text: '연습 화면' } } });
      host.send({ type: 'info', info: { all: ['private notes'] } }); await host.flush();
      const team = await f.connect('team', undefined, '팀', '/freecast-team-ws');
      expect(team.packets.find((p) => p.type === 'state')?.state).toEqual({ slide: { text: '실제 송출' } });
      expect(team.packets.filter((p) => ['info', 'info-chunk', 'rehearsal'].includes(String(p.type)))).toEqual([]);
    } finally { await f.close(); }
  });
  it('enforces request-only roles on public team capabilities and rejects unauthenticated public upgrades', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      await expect(f.connect('team', undefined, '팀', '/freecast-team-ws', { Host: 'public.trycloudflare.com' })).rejects.toThrow();
      await expect(f.connect('team', undefined, '팀', '/freecast-team-ws', { Host: 'public.trycloudflare.com', 'x-freecast-team-key': 'b'.repeat(64) })).rejects.toThrow();
      const restricted = await f.connect('host', 'team-private-capability-token', '제한된 기기', '/freecast-team-ws', { Host: 'public.trycloudflare.com', 'x-freecast-team-key': 'a'.repeat(64) });
      restricted.send({ type: 'command', command: { type: 'live/next' } });
      restricted.send(request('무대팀 전용 요청')); await waitFor(() => host.requests().length === 1);
      expect(host.control().clients.find((c) => c.name === '제한된 기기')?.role).toBe('team');
      expect(host.packets.filter((p) => p.type === 'command')).toEqual([]);
    } finally { await f.close(); }
  });
  it('echoes probe IDs and reports a phone’s quality to the host, binding reports to the sender', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), team = await f.connect('team', undefined, '팀', '/freecast-team-ws');
      team.send({ type: 'ping', id: 125 }); await team.flush(); expect(team.packets.some((p) => p.type === 'pong' && p.id === 125)).toBe(true);
      team.send({ type: 'connection-quality', quality: { level: 'poor', latencyMs: 1000, jitterMs: 300, lossPercent: 25, at: -1 }, id: 'fake-other-device' });
      await waitFor(() => !!host.control().clients.find((c) => c.name === '팀')?.quality);
      expect(host.control().clients.find((c) => c.name === '팀')?.quality).toMatchObject({ level: 'poor', latencyMs: 1000, lossPercent: 25 });
      expect(host.control().clients.find((c) => c.name === '팀')?.quality?.at).toBeGreaterThan(0);
    } finally { await f.close(); }
  });
});
