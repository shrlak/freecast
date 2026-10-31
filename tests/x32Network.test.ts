import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import http from 'node:http';
// @ts-expect-error plain ESM server module
import { createX32Link, oscMessage, parseOsc, x32Middleware } from '../server/x32.mjs';
import {
  createOscDecoder, defaultMidiSettings, describeMidi, learnBinding, midiTarget, normalizeMidiSettings, type MidiSettings,
} from '../src/domain/midi';

/** A UDP socket stand-in: records what is sent, and lets the test play the X32's replies. */
class FakeSocket extends EventEmitter {
  sent: { address: string; port: number; host: string }[] = [];
  closed = false;
  bind(cb: () => void) { cb(); }
  setBroadcast() {}
  send(buf: Buffer, port: number, host: string) { this.sent.push({ address: parseOsc(buf)!.address, port, host }); }
  close() { this.closed = true; }
  reply(from: string, address: string, args: (number | string)[] = []) { this.emit('message', oscMessage(address, args), { address: from }); }
}

describe('OSC for the X32', () => {
  it('encodes and decodes messages with 4-byte padding', () => {
    const buf = oscMessage('/ch/32/mix/on', [1]);
    expect(buf.length % 4).toBe(0);
    expect(buf.subarray(0, 16).toString('latin1')).toBe('/ch/32/mix/on\0\0\0');
    expect(parseOsc(buf)).toEqual({ address: '/ch/32/mix/on', args: [{ type: 'i', value: 1 }] });
    expect(parseOsc(oscMessage('/info', ['V2.07', 'osc-server', 'X32', '4.06'])).args.map((a: { value: string }) => a.value)).toEqual(['V2.07', 'osc-server', 'X32', '4.06']);
    const fader = parseOsc(oscMessage('/ch/01/mix/fader', [0.75]));
    expect(fader.args[0].type).toBe('f');
    expect(fader.args[0].value).toBeCloseTo(0.75);
    expect(parseOsc(Buffer.from('#bundle\0garbage'))).toBeNull();
    expect(parseOsc(Buffer.from([1, 2, 3]))).toBeNull();
  });
});

describe('X32 network link', () => {
  const setup = () => {
    const sockets: FakeSocket[] = [];
    let t = 0;
    const link = createX32Link({ createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; }, now: () => t });
    const events: Record<string, unknown>[] = [];
    link.subscribe((e: Record<string, unknown>) => events.push(e));
    return { link, sockets, events, advance: (ms: number) => { t += ms; } };
  };

  it('subscribes with /xremote, becomes connected on the reply and forwards whole-number changes only', () => {
    const { link, sockets, events } = setup();
    link.connect('192.168.0.64');
    const s = sockets[0];
    expect(s.sent.map((m) => m.address)).toEqual(['/xinfo', '/xremote', '/info']);
    expect(s.sent.every((m) => m.port === 10023 && m.host === '192.168.0.64')).toBe(true);
    s.reply('192.168.0.64', '/xinfo', ['192.168.0.64', 'Church X32', 'X32', '4.06']);
    expect(link.state).toMatchObject({ status: 'connected', name: 'Church X32', model: 'X32' });
    s.reply('192.168.0.64', '/ch/32/mix/on', [0]);
    s.reply('192.168.0.64', '/ch/01/mix/fader', [0.5]);
    s.reply('10.0.0.9', '/ch/31/mix/on', [0]); // someone else's packet
    expect(events.filter((e) => e.type === 'osc')).toEqual([{ type: 'osc', address: '/ch/32/mix/on', value: 0 }]);
    link.disconnect();
    expect(s.closed).toBe(true);
    expect(link.state.status).toBe('off');
  });

  it('reports a lost mixer when it stops answering, and refuses a bad address', () => {
    vi.useFakeTimers();
    try {
      const { link, sockets, advance } = setup();
      link.connect('192.168.0.64');
      sockets[0].reply('192.168.0.64', '/info', ['V2.07', 'osc-server', 'X32', '4.06']);
      expect(link.state.status).toBe('connected');
      advance(25000);
      vi.advanceTimersByTime(8000);
      expect(link.state.status).toBe('lost');
      expect(sockets[0].sent.filter((m) => m.address === '/xremote').length).toBe(2);
      link.connect('192.168.0.64'); // same IP: keeps the link
      expect(sockets).toHaveLength(1);
      expect(() => link.connect('mixer.local')).toThrow();
      expect(() => link.connect('300.1.1.1')).toThrow();
      link.disconnect();
    } finally {
      vi.useRealTimers();
    }
  });

  it('finds X32s that answer /xinfo', async () => {
    const { link, sockets } = setup();
    const pending = link.scan(20);
    const s = sockets[0];
    expect(s.sent.every((m) => m.address === '/xinfo' && m.port === 10023)).toBe(true);
    s.reply('192.168.0.64', '/xinfo', ['192.168.0.64', 'Church X32', 'X32', '4.06']);
    expect(await pending).toEqual([{ ip: '192.168.0.64', name: 'Church X32', model: 'X32', version: '4.06' }]);
  });

  it('only serves the console on this computer', async () => {
    const server = http.createServer((req, res) => x32Middleware(req, res, () => res.writeHead(404).end()));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as { port: number };
    try {
      const bad = await fetch(`http://127.0.0.1:${port}/api/x32/connect`, { method: 'POST', body: JSON.stringify({ ip: 'nope' }) });
      expect(bad.status).toBe(400);
      const get = await fetch(`http://127.0.0.1:${port}/api/x32/connect`);
      expect(get.status).toBe(405);
      const off = await fetch(`http://127.0.0.1:${port}/api/x32/disconnect`, { method: 'POST' });
      expect((await off.json()).status).toBe('off');
      const other = await fetch(`http://127.0.0.1:${port}/api/other`);
      expect(other.status).toBe(404);
    } finally {
      server.close();
    }
    const res = { writeHead: (status: number) => ({ status }), end: () => undefined, status: 0 } as unknown as http.ServerResponse;
    let status = 0;
    (res as unknown as { writeHead: (s: number) => void }).writeHead = (s: number) => { status = s; };
    await x32Middleware({ url: '/api/x32/scan', method: 'POST', headers: {}, socket: { remoteAddress: '192.168.0.20' } }, res, () => undefined);
    expect(status).toBe(403);
  });
});

describe('X32 buttons over the network', () => {
  it('fires on every mute change, and on a user button press but not its release', () => {
    const decode = createOscDecoder();
    expect(decode('/ch/32/mix/on', 0)).toEqual({ kind: 'osc', address: '/ch/32/mix/on' });
    expect(decode('/ch/32/mix/on', 1)).toEqual({ kind: 'osc', address: '/ch/32/mix/on' });
    expect(decode('/ch/32/mix/on', 1)).toBeNull();
    expect(decode('/-stat/userpar/13/value', 127)).toEqual({ kind: 'osc', address: '/-stat/userpar/13/value' });
    expect(decode('/-stat/userpar/13/value', 0)).toBeNull();
    expect(decode('/-stat/userpar/13/value', 127)).toEqual({ kind: 'osc', address: '/-stat/userpar/13/value' });
  });
  it('ignores screen and selection changes on the console', () => {
    const decode = createOscDecoder();
    expect(decode('/-stat/selidx', 4)).toBeNull();
    expect(decode('/-stat/screen/screen', 2)).toBeNull();
    expect(decode('/-prefs/bright', 50)).toBeNull();
    expect(decode('/-stat/solosw/05', 1)).toEqual({ kind: 'osc', address: '/-stat/solosw/05' });
  });
  it('learns an X32 button heard over Wi-Fi and maps it', () => {
    const on: MidiSettings = { ...defaultMidiSettings(), enabled: true };
    const press = { kind: 'osc' as const, address: '/ch/32/mix/on' };
    const s = learnBinding(on, press, { type: 'command', command: 'next' });
    expect(midiTarget(s, press, [])).toEqual({ type: 'command', command: 'next' });
    expect(midiTarget(s, { kind: 'osc', address: '/ch/31/mix/on' }, [])).toBeNull();
    // MIDI defaults are untouched.
    expect(midiTarget(s, { kind: 'note', channel: 1, number: 60 }, [])).toEqual({ type: 'command', command: 'next' });
    expect(describeMidi(press)).toBe('X32 Ch 32 뮤트');
    expect(describeMidi({ kind: 'osc', address: '/config/mute/2' })).toBe('X32 뮤트 그룹 2');
    expect(describeMidi({ kind: 'osc', address: '/-stat/userpar/13/value' })).toBe('X32 사용자 버튼 13');
    expect(describeMidi({ kind: 'osc', address: '/dca/3/on' })).toBe('X32 DCA 3 뮤트');
  });
  it('saves the X32 address and network bindings', () => {
    const s = normalizeMidiSettings({ enabled: true, network: { on: true, ip: ' 192.168.0.64 ' }, bindings: [
      { kind: 'osc', address: '/ch/32/mix/on', target: { type: 'command', command: 'next' } },
      { kind: 'osc', address: 'no-slash', target: { type: 'command', command: 'next' } },
    ] });
    expect(s.network).toEqual({ on: true, ip: '192.168.0.64' });
    expect(s.bindings).toEqual([{ kind: 'osc', address: '/ch/32/mix/on', target: { type: 'command', command: 'next' } }]);
    expect(normalizeMidiSettings({ enabled: true }).network).toEqual({ on: false, ip: '' });
  });
});
