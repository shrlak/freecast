import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs server module
import { cleanOutput, isPublicHost, parseTunnelUrl } from '../server/tunnel.mjs';

describe('parseTunnelUrl', () => {
  it('finds the address in the tunnel service output', () => {
    expect(parseTunnelUrl('abc123.lhr.life tunneled with tls termination, https://abc123.lhr.life\n')).toBe('https://abc123.lhr.life');
  });
  it('never takes the localhost.run account console for a tunnel', () => {
    expect(parseTunnelUrl('create a free account at https://admin.localhost.run/')).toBeNull();
    expect(parseTunnelUrl('https://admin.localhost.run  then  abc.lhr.life tunneled, https://abc.lhr.life')).toBe('https://abc.lhr.life');
  });
  it('reads the address from a styled screen, bare host names and JSON', () => {
    expect(parseTunnelUrl('\x1b[49m\x1b[?25l> \x1b[1mabc123.lhr.life\x1b[0m')).toBe('https://abc123.lhr.life');
    expect(parseTunnelUrl('{"event":"tunnel_status","address":"Abc-1.lhr.life","connection_id":"x"}')).toBe('https://abc-1.lhr.life');
  });
  it('cleans terminal codes for messages', () => {
    expect(cleanOutput('\x1b[49m\x1b[?25lhello\x1b[0m')).toBe('hello');
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
