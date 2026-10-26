import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
// @ts-expect-error plain ESM server module
import { attachRelay } from '../server/relay.mjs';

type Packet = Record<string, unknown>;

async function fixture() {
  const server = http.createServer(), relay = attachRelay(server);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing port');
  const port = address.port;
  const sockets: WebSocket[] = [];
  async function connect(role: string, token = '') {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/freecast-ws`);
    sockets.push(ws);
    const packets: Packet[] = [];
    ws.on('message', (raw) => packets.push(JSON.parse(String(raw))));
    await once(ws, 'open');
    const send = (packet: unknown) => ws.send(JSON.stringify(packet));
    const flush = async () => {
      const pong = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Missing pong')), 2000);
        const receive = (raw: WebSocket.RawData) => { if (JSON.parse(String(raw)).type === 'pong') { clearTimeout(timeout); ws.off('message', receive); resolve(); } };
        ws.on('message', receive);
      });
      send({ type: 'ping' }); await pong;
    };
    send({ type: 'hello', role, clientToken: token }); await flush();
    return { send, flush, packets, commands: () => packets.filter((p) => p.type === 'command').map((p) => p.command) };
  }
  return { connect, async close() { sockets.forEach((s) => s.terminate()); for (const s of relay.clients) s.terminate(); await new Promise<void>((r) => relay.close(r)); await new Promise<void>((r) => server.close(() => r())); } };
}

describe('commands from the pastor tablet', () => {
  it('passes the controller’s verse, key and timer commands to the computer', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), tablet = await f.connect('remote', 'pastor-tablet-token-1');
      tablet.send({ type: 'command', command: { type: 'bible/show', refs: '요3:16', live: true } });
      tablet.send({ type: 'command', command: { type: 'live/chords', shift: 2, capo: 1 } });
      tablet.send({ type: 'command', command: { type: 'timer/op', id: 'timer_sermon', op: 'start' } });
      tablet.send({ type: 'command', command: { type: 'live/go', presentationId: 'p1', seq: 3, playlistIndex: 2 } });
      await expect.poll(() => host.commands().length, { timeout: 2000 }).toBe(4);
      expect(host.commands()).toEqual([
        { type: 'bible/show', refs: '요3:16', live: true },
        { type: 'live/chords', shift: 2, capo: 1 },
        { type: 'timer/op', id: 'timer_sermon', op: 'start' },
        { type: 'live/go', presentationId: 'p1', seq: 3, playlistIndex: 2 },
      ]);
    } finally { await f.close(); }
  });
  it('still refuses commands that are not on the list, oversized text and nested data', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), tablet = await f.connect('remote', 'pastor-tablet-token-2');
      tablet.send({ type: 'command', command: { type: 'library/replace', library: {} } });
      tablet.send({ type: 'command', command: { type: 'bible/show', refs: 'x'.repeat(501) } });
      tablet.send({ type: 'command', command: { type: 'bible/show', refs: { nested: true } } });
      tablet.send({ type: 'command', command: { type: 'bible/delete', refs: 'x' } });
      await tablet.flush();
      expect(host.commands()).toEqual([]);
    } finally { await f.close(); }
  });
  it('lets only the controlling remote call a verse', async () => {
    const f = await fixture();
    try {
      const host = await f.connect('host'), first = await f.connect('remote', 'pastor-tablet-token-3'), second = await f.connect('remote', 'pastor-tablet-token-4');
      second.send({ type: 'command', command: { type: 'bible/show', refs: '롬8:28', live: true } });
      await second.flush();
      expect(host.commands()).toEqual([]);
      first.send({ type: 'command', command: { type: 'bible/show', refs: '롬8:28', live: false } });
      await expect.poll(() => host.commands().length, { timeout: 2000 }).toBe(1);
    } finally { await f.close(); }
  });
});
