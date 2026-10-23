import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
import { RemoteInfoReader } from '../src/domain/remoteSlides';
// @ts-expect-error plain ESM server module
import { attachRelay } from '../server/relay.mjs';

function message(ws: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.off('message', receive); reject(new Error(`Missing ${type}`)); }, 2000);
    function receive(raw: WebSocket.RawData) {
      const m = JSON.parse(String(raw));
      if (m.type === type) { clearTimeout(timer); ws.off('message', receive); resolve(m); }
    }
    ws.on('message', receive);
  });
}

describe('remote connection status', () => {
  it('reports host arrival/departure and answers liveness checks', async () => {
    const server = http.createServer();
    const relay = attachRelay(server);
    const sockets: WebSocket[] = [];
    try {
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const connect = async () => { const ws = new WebSocket(`ws://127.0.0.1:${address.port}/freecast-ws`); sockets.push(ws); await once(ws, 'open'); return ws; };
      const remote = await connect();
      const noHost = message(remote, 'host-status');
      remote.send(JSON.stringify({ type: 'hello', role: 'remote' }));
      expect(await noHost).toMatchObject({ connected: false });
      const host = await connect();
      const hostArrived = message(remote, 'host-status');
      host.send(JSON.stringify({ type: 'hello', role: 'host' }));
      expect(await hostArrived).toMatchObject({ connected: true });
      const pong = message(remote, 'pong');
      remote.send(JSON.stringify({ type: 'ping' }));
      expect(await pong).toMatchObject({ type: 'pong' });
      const gone = message(remote, 'host-status');
      host.close();
      expect(await gone).toMatchObject({ connected: false });
    } finally {
      sockets.forEach((s) => s.terminate());
      for (const client of relay.clients) client.terminate();
      await new Promise<void>((resolve) => relay.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});


describe('full remote catalog relay', () => {
  it('replays completed catalogs and in-flight chunks to reconnecting phones, accepting catalogs only from hosts', async () => {
    const server = http.createServer();
    const relay = attachRelay(server);
    const sockets: WebSocket[] = [];
    try {
      server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No port');
      const connect = async () => { const ws = new WebSocket(`ws://127.0.0.1:${address.port}/freecast-ws`); sockets.push(ws); await once(ws, 'open'); return ws; };
      const host = await connect(); host.send(JSON.stringify({ type: 'hello', role: 'host' }));
      const observer = await connect(); const welcome = message(observer, 'welcome');
      observer.send(JSON.stringify({ type: 'hello', role: 'remote' })); await welcome;
      const old = { upcoming: [], all: [], themes: {}, name: 'previous catalog' };
      const initial = message(observer, 'info'); host.send(JSON.stringify({ type: 'info', info: old })); await initial;
      const info = { ...old, name: 'all current slides' }, json = JSON.stringify(info), half = Math.floor(json.length / 2);
      const chunks = [json.slice(0, half), json.slice(half)].map((data, index) => ({ type: 'info-chunk', id: 'catalog', index, total: 2, data }));
      const started = message(observer, 'info-chunk'); host.send(JSON.stringify(chunks[0])); await started;
      const late = await connect(); const previous = message(late, 'info'), prefix = message(late, 'info-chunk');
      late.send(JSON.stringify({ type: 'hello', role: 'remote' }));
      const reader = new RemoteInfoReader();
      expect(reader.accept(await previous)?.name).toBe('previous catalog');
      expect(reader.accept(await prefix)).toBeNull();
      const finished = message(late, 'info-chunk'); host.send(JSON.stringify(chunks[1]));
      expect(reader.accept(await finished)).toEqual(info);
      // A phone cannot overwrite the cached host catalog for other phones.
      observer.send(JSON.stringify({ type: 'info-chunk', id: 'fake', index: 0, total: 1, data: JSON.stringify({ ...old, name: 'fake' }) }));
      const pong = message(observer, 'pong'); observer.send(JSON.stringify({ type: 'ping' })); await pong;
      const fresh = await connect();
      const cached = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Missing cached catalog')), 2000);
        const nextReader = new RemoteInfoReader();
        fresh.on('message', raw => {
          const full = nextReader.accept(JSON.parse(String(raw)));
          if (full) { clearTimeout(timeout); resolve(full); }
        });
      });
      fresh.send(JSON.stringify({ type: 'hello', role: 'remote' }));
      expect(await cached).toEqual(info);
    } finally {
      sockets.forEach((s) => s.terminate());
      for (const client of relay.clients) client.terminate();
      await new Promise<void>((resolve) => relay.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
