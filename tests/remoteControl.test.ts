import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
// @ts-expect-error plain ESM server module
import { attachRelay } from '../server/relay.mjs';
import type { RemoteControlState } from '../src/domain/remoteControl';

type Packet = Record<string, unknown>;
async function fixture() {
  const server = http.createServer(), relay = attachRelay(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
  const port = address.port;
  const sockets: WebSocket[] = [];
  async function connect(role: string, token = '', name = '') {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/freecast-ws`);
    sockets.push(ws);
    const packets: Packet[] = [];
    ws.on('message', raw => packets.push(JSON.parse(String(raw))));
    await once(ws, 'open');
    const send = (packet: unknown) => ws.send(JSON.stringify(packet));
    async function flush() {
      const pong = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Missing pong')), 2000);
        const receive = (raw: WebSocket.RawData) => { if (JSON.parse(String(raw)).type === 'pong') { clearTimeout(timeout); ws.off('message', receive); resolve(); } };
        ws.on('message', receive);
      });
      send({ type: 'ping' }); await pong;
    }
    send({ type: 'hello', role, clientToken: token, name }); await flush();
    const control = () => packets.filter((p) => p.type === 'remote-control').at(-1) as unknown as RemoteControlState;
    return { ws, packets, send, flush, control };
  }
  return { connect, async close() { sockets.forEach((s) => s.terminate()); for (const s of relay.clients) s.terminate(); await new Promise<void>((r) => relay.close(r)); await new Promise<void>((r) => server.close(() => r())); } };
}
const command = { type: 'command', command: { type: 'live/next' } };
const control = (action: string, id?: string) => ({ type: 'remote-control', action, id });
async function waitFor(test: () => boolean) { await expect.poll(test, { timeout: 2000 }).toBe(true); }

describe('single remote controller enforced by the relay', () => {
  it('compresses larger WAN packets, replays compact position updates, and delivers commands', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      const phone = await f.connect('remote', 'private-token-for-phone-A');
      expect(phone.ws.extensions).toContain('permessage-deflate');
      host.send({ type: 'info', info: { all: [], upcoming: [], current: null, themes: {} } });
      host.send({ type: 'info-position', current: { presentationId: 'first', seq: 0 }, upcoming: [] });
      await waitFor(() => phone.packets.some((p) => p.type === 'info-position'));
      const nextPhone = await f.connect('remote', 'private-token-for-phone-B');
      expect(nextPhone.packets.some((p) => p.type === 'info')).toBe(true);
      expect(nextPhone.packets.some((p) => p.type === 'info-position')).toBe(true);
      phone.send(command);
      await waitFor(() => host.packets.filter((p) => p.type === 'command').length === 1);
      phone.send({ type: 'info-position', current: { presentationId: 'hijack', seq: 1 }, upcoming: [] });
      await phone.flush();
      expect(nextPhone.packets.filter((p) => p.type === 'info-position')).toHaveLength(1);
    } finally { await f.close(); }
  });
  it('blocks viewer commands, publishes requests, grants from the computer, and hands control back', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host');
      const a = await f.connect('remote', 'private-token-for-phone-A', '찬양 인도자');
      const b = await f.connect('remote', 'private-token-for-phone-B', '보조 담당자');
      expect(a.control().canControl).toBe(true); expect(b.control().canControl).toBe(false);
      b.send(command); await b.flush(); expect(host.packets.filter((p) => p.type === 'command')).toHaveLength(0);
      a.send(command); await waitFor(() => host.packets.filter((p) => p.type === 'command').length === 1);
      b.send(control('request')); await waitFor(() => host.control().clients.some((c) => c.name === '보조 담당자' && c.requested));
      host.send(control('grant', b.control().selfId!)); await waitFor(() => b.control().canControl);
      await waitFor(() => !a.control().canControl);
      a.send(command); await a.flush(); expect(host.packets.filter((p) => p.type === 'command')).toHaveLength(1);
      b.send(command); await waitFor(() => host.packets.filter((p) => p.type === 'command').length === 2);
      b.send(control('handoff', a.control().selfId!)); await waitFor(() => a.control().canControl);
      expect(a.control().clients.filter((c) => c.connected)).toHaveLength(2);
      expect(JSON.stringify(a.packets)).not.toContain('private-token-for-phone-B');
    } finally { await f.close(); }
  });
  it('cannot self-grant, impersonate a public roster ID, or upgrade hello from remote to host', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), a = await f.connect('remote', 'private-token-for-phone-A');
      const b = await f.connect('remote', a.control().selfId!); // Public ID is not the private reconnect token.
      expect(b.control().selfId).not.toBe(a.control().selfId);
      b.send(control('grant', b.control().selfId!));
      b.send({ type: 'hello', role: 'host' });
      b.send(control('grant', b.control().selfId!)); b.send(command); await b.flush();
      expect(b.control().canControl).toBe(false);
      expect(host.packets.filter((p) => p.type === 'command')).toHaveLength(0);
      expect(a.control().canControl).toBe(true);
    } finally { await f.close(); }
  });
  it('preserves the owner across reconnection, lets the computer revoke it, and keeps revoked devices view-only', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), a = await f.connect('remote', 'private-token-for-phone-A', '기존 기기');
      const id = a.control().selfId;
      a.ws.close(); await once(a.ws, 'close');
      const reconnected = await f.connect('remote', 'private-token-for-phone-A');
      expect(reconnected.control()).toMatchObject({ selfId: id, canControl: true });
      host.send(control('revoke', id!)); await waitFor(() => !reconnected.control().canControl);
      reconnected.ws.close(); await once(reconnected.ws, 'close');
      const again = await f.connect('remote', 'private-token-for-phone-A');
      expect(again.control()).toMatchObject({ selfId: id, canControl: false, controllerId: null });
      const newPhone = await f.connect('remote', 'private-token-for-phone-C');
      expect(newPhone.control().canControl).toBe(false);
    } finally { await f.close(); }
  });
  it('renames devices without changing their private identity or affecting the control owner', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), a = await f.connect('remote', 'private-token-for-phone-A');
      const id = a.control().selfId;
      a.send({ type: 'remote-control', action: 'rename', name: '찬양팀 아이폰' });
      await waitFor(() => host.control().clients.some((c) => c.name === '찬양팀 아이폰'));
      expect(a.control().selfId).toBe(id); expect(a.control().canControl).toBe(true);
    } finally { await f.close(); }
  });
  it('sends rehearsal only to phones and replays it on reconnect without changing actual viewer output', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), viewer = await f.connect('viewer'), a = await f.connect('remote', 'private-token-for-phone-A');
      host.send({ type: 'state', state: { slide: { text: '실제 송출' } } });
      await waitFor(() => viewer.packets.some((p) => p.type === 'state'));
      host.send({ type: 'rehearsal', active: true, state: { slide: { text: '연습 화면' } }, cursor: { presentationId: 'song', seq: 2 } });
      await waitFor(() => a.packets.some((p) => p.type === 'rehearsal' && p.active === true));
      expect(viewer.packets.filter((p) => p.type === 'rehearsal')).toHaveLength(0);
      expect(viewer.packets.filter((p) => p.type === 'state').at(-1)?.state).toEqual({ slide: { text: '실제 송출' } });
      const late = await f.connect('remote', 'private-token-for-phone-B');
      expect(late.packets.find((p) => p.type === 'rehearsal')).toMatchObject({ active: true, state: { slide: { text: '연습 화면' } } });
      a.send({ type: 'rehearsal', active: false }); await a.flush();
      expect(a.packets.filter((p) => p.type === 'rehearsal').at(-1)?.active).toBe(true);
      host.ws.close(); await once(host.ws, 'close');
      await waitFor(() => a.packets.filter((p) => p.type === 'rehearsal').at(-1)?.active === false);
    } finally { await f.close(); }
  });
});
