import { useEffect, useMemo, useRef, useState } from 'react';
import type { Library, LiveState } from '../domain/types';
import type { Cursor } from '../domain/live';
import { locateLive, standbyHealth, standbyRelayUrl, type StandbyHealth } from '../domain/standby';
import { useNow, useRelay } from './hooks';

const KEY = 'freecast.standby';
export interface StandbyConfig { on: boolean; address: string }
export function loadStandby(): StandbyConfig {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.address === 'string') return { on: v.on === true, address: v.address };
  } catch { /* unreadable: standby is off */ }
  return { on: false, address: '' };
}
export const saveStandby = (c: StandbyConfig) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* storage blocked */ } };

export interface StandbyFeed { health: StandbyHealth | 'off'; live: LiveState | null; cursor: Cursor | null; connected: boolean }

/** Follows the main computer's screen as a viewer; this computer's own show is untouched until takeover. */
export function useStandby(config: StandbyConfig, library: Library, playlistId: string): StandbyFeed {
  const url = config.on ? standbyRelayUrl(config.address) : null;
  const [live, setLive] = useState<LiveState | null>(null);
  const [everConnected, setEver] = useState(false);
  const [lostAt, setLostAt] = useState<number | null>(null);
  const relay = useRelay(url ? { type: 'hello', role: 'viewer' } : null, (m) => {
    if (m.type === 'state' && m.state) setLive(m.state as LiveState);
  }, url ?? undefined);
  const wasConnected = useRef(false);
  useEffect(() => {
    if (!url) { setLive(null); setEver(false); setLostAt(null); wasConnected.current = false; return; }
    if (relay.connected) { setEver(true); setLostAt(null); wasConnected.current = true; }
    else if (wasConnected.current) { wasConnected.current = false; setLostAt(Date.now()); }
  }, [url, relay.connected]);
  const now = useNow(1000);
  const cursor = useMemo(() => locateLive(library, live, playlistId), [library, live?.slide?.id, live?.title, playlistId]);
  return { health: url ? standbyHealth(relay.connected, everConnected, lostAt, now) : 'off', live, cursor, connected: relay.connected };
}
