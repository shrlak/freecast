import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs server module
import { cleanOutput, cloudflaredAsset, isPublicHost, parseTunnelUrl } from '../server/tunnel.mjs';

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
