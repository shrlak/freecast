import { describe, expect, it } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket from 'ws';
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
