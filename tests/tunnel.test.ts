import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs server module
import { isPublicHost, parseTunnelUrl } from '../server/tunnel.mjs';

describe('parseTunnelUrl', () => {
  it('finds the address in the tunnel service output', () => {
    expect(parseTunnelUrl('abc123.lhr.life tunneled with tls termination, https://abc123.lhr.life\n')).toBe('https://abc123.lhr.life');
  });
  it('ignores output without an address', () => {
    expect(parseTunnelUrl('Warning: Permanently added localhost.run')).toBeNull();
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
