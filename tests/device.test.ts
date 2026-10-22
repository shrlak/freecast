import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let values: Map<string, string>;
beforeEach(() => {
  vi.resetModules(); values = new Map();
  vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Windows NT 10.0' });
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('local device identity', () => {
  it('keeps the same identity and registered names after reloading the app', async () => {
    const first = await import('../src/domain/device');
    const id = first.getDevice().id;
    first.saveDeviceProfile(' 교회 Mac ', ' 민수 ');
    vi.resetModules();
    const reloaded = await import('../src/domain/device');
    expect(reloaded.getDevice()).toMatchObject({ id, name: '교회 Mac', userName: '민수', platform: 'Windows' });
    expect(reloaded.deviceLabel(reloaded.getDevice())).toBe('교회 Mac · 민수');
  });
  it('uses a different identity for a separate local profile', async () => {
    const first = (await import('../src/domain/device')).getDevice();
    values.clear(); vi.resetModules();
    const second = (await import('../src/domain/device')).getDevice();
    expect(second.id).not.toBe(first.id);
  });
  it('rejects invalid names and never reports a failed storage write as saved', async () => {
    const device = await import('../src/domain/device');
    const before = device.getDevice();
    expect(() => device.saveDeviceProfile(' ', '민수')).toThrow();
    expect(() => device.saveDeviceProfile('x'.repeat(61), '')).toThrow();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); } });
    expect(() => device.saveDeviceProfile('새 이름', '새 사용자')).toThrow('quota exceeded');
    expect(device.getDevice()).toEqual(before);
  });
});
