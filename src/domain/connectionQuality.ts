export type ConnectionLevel = 'measuring' | 'good' | 'fair' | 'poor' | 'offline';
export interface ConnectionQuality { level: ConnectionLevel; latencyMs: number | null; jitterMs: number; lossPercent: number; at: number }
export function connectionQuality(samples: (number | null)[], connected: boolean, now: number): ConnectionQuality {
  const recent = samples.slice(-8), values = recent.filter((n): n is number => n != null && Number.isFinite(n) && n >= 0);
  const latencyMs = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  const jitterMs = values.length > 1 ? Math.round(Math.max(...values) - Math.min(...values)) : 0;
  const lossPercent = recent.length ? Math.round(100 * recent.filter((n) => n == null).length / recent.length) : 0;
  const level = !connected ? 'offline' : !recent.length ? 'measuring' : latencyMs == null || lossPercent >= 25 || latencyMs >= 700 || jitterMs >= 400 ? 'poor' : latencyMs >= 200 || lossPercent > 0 || jitterMs >= 150 ? 'fair' : 'good';
  return { level, latencyMs, jitterMs, lossPercent, at: now };
}
export const qualityLabel: Record<ConnectionLevel, string> = { measuring: '품질 측정 중', good: '연결 양호', fair: '응답 지연', poor: '연결 불안정', offline: '연결 끊김' };
