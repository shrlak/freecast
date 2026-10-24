import type { ConnectionQuality } from '../domain/connectionQuality';
import { qualityLabel } from '../domain/connectionQuality';
import { useNow } from './hooks';

export function ConnectionQualityBadge({ quality, connected, compact = false }: { compact?: boolean; quality: ConnectionQuality | null | undefined; connected: boolean }) {
  const now = useNow(1000);
  const level = !connected ? 'offline' : !quality || now - quality.at > 20000 ? 'measuring' : quality.level;
  const detail = level === 'measuring' ? '왕복 응답시간을 측정하고 있습니다.' : level === 'offline' ? '연결이 끊겼습니다. 자동 재연결을 기다려 주세요.' : `왕복 응답 ${quality?.latencyMs ?? '—'}ms · 변동 ${quality?.jitterMs ?? 0}ms · 최근 측정 응답 없음 ${quality?.lossPercent ?? 0}%`;
  return <span className={`connection-quality ${level}`} role="status" title={detail} aria-label={`${qualityLabel[level]} · ${detail}`}><i aria-hidden="true" />{compact ? ({ measuring: '측정 중', good: '양호', fair: '지연', poor: '불안정', offline: '끊김' }[level]) : qualityLabel[level]}{quality?.latencyMs != null && !['offline', 'measuring'].includes(level) ? ` · ${quality.latencyMs}ms` : ''}</span>;
}
