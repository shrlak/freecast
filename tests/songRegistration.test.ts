import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteSharedSong, registerSharedSong } from '../src/domain/online';

afterEach(() => vi.unstubAllGlobals());
const song = { title: '콘티 확인한 찬양', sections: [{ label: 'V', lines: ['가사'] }] };

describe('shared song registration', () => {
  it('registers confirmed lyrics without sending an administrator credential', async () => {
    const request = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', request);
    await registerSharedSong(song);
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/songs'); expect(options.method).toBe('PUT');
    expect(new Headers(options.headers).has('authorization')).toBe(false);
    expect(JSON.parse(options.body as string).entry).toMatchObject({ ...song, verification: 'verified' });
  });
  it('keeps an administrator credential on deletion and reports registration failures', async () => {
    const request = vi.fn(async () => Response.json({ error: 'server unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', request);
    await expect(registerSharedSong(song)).rejects.toThrow('server unavailable');
    request.mockImplementation(async () => Response.json({ ok: true }));
    await deleteSharedSong(song.title, 'admin-test-only');
    const [, options] = request.mock.calls[1] as unknown as [string, RequestInit];
    expect(options.method).toBe('DELETE');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer admin-test-only');
  });
});
