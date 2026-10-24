import { describe, expect, it } from 'vitest';
import { connectionQuality } from '../src/domain/connectionQuality';

describe('measured connection quality', () => {
  it('distinguishes an unmeasured connection, offline, and a fast stable path', () => {
    expect(connectionQuality([], true, 1).level).toBe('measuring');
    expect(connectionQuality([30, 40, 35], false, 1).level).toBe('offline');
    expect(connectionQuality([30, 40, 35], true, 1)).toMatchObject({ level: 'good', latencyMs: 35, lossPercent: 0 });
  });
  it('warns about slow responses, large variations, and missed probes even when other packets arrive', () => {
    expect(connectionQuality([240, 300], true, 1).level).toBe('fair');
    expect(connectionQuality([800, 900], true, 1).level).toBe('poor');
    expect(connectionQuality([20, 650], true, 1).level).toBe('poor');
    expect(connectionQuality([20, null, 25, null], true, 1)).toMatchObject({ level: 'poor', lossPercent: 50 });
  });
  it('recovers after eight fresh samples instead of keeping old failures forever', () => {
    expect(connectionQuality([null, null, 9000, ...Array(8).fill(40)], true, 1)).toMatchObject({ level: 'good', latencyMs: 40, lossPercent: 0 });
  });
});
