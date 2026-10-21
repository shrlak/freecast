import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LiveState } from '../domain/types';
import { mediaUrl, peekMediaUrl } from '../domain/media';
import { openLiveChannel } from '../domain/sync';
import { loadLive, saveLive } from '../domain/persistence';

/**
 * Object URL for a stored picture/video. When the id changes (the next slide has another background)
 * the previous URL stays until the new one is ready, so the screen never flashes empty between slides.
 */
export function useMediaUrl(id: string | null | undefined): string | null {
  const [, refresh] = useState(0);
  const shown = useRef<string | null>(null);
  const known = id ? peekMediaUrl(id) : null;
  if (!id) shown.current = null;
  else if (known) shown.current = known;
  useEffect(() => {
    if (!id || known) return;
    let alive = true;
    mediaUrl(id).then((u) => {
      if (!alive) return;
      shown.current = u;
      refresh((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [id, known]);
  return id ? shown.current : null;
}

const decoded = new Set<string>();

/**
 * The URL once the browser has decoded the picture. A new picture loads off-screen first and the
 * previous one stays up meanwhile, so swapping backgrounds never shows an empty frame.
 */
export function useReadyImage(url: string | null): string | null {
  const [, refresh] = useState(0);
  const shown = useRef<string | null>(null);
  if (!url) shown.current = null;
  else if (decoded.has(url)) shown.current = url;
  useEffect(() => {
    if (!url || decoded.has(url)) return;
    let alive = true;
    const img = new Image();
    img.src = url;
    const done = () => {
      decoded.add(url);
      if (!alive) return;
      shown.current = url;
      refresh((n) => n + 1);
    };
    img.decode().then(done, done);
    return () => {
      alive = false;
    };
  }, [url]);
  return url ? shown.current : null;
}

export function relayUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/freecast-ws`;
}

/**
 * A WebSocket to the FreeCast relay that reconnects on its own.
 * Returns a send function; `onMessage` receives parsed JSON.
 */
export function useRelay(hello: Record<string, unknown> | null, onMessage: (m: Record<string, unknown>) => void) {
  const handler = useRef(onMessage);
  handler.current = onMessage;
  const socket = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const helloKey = JSON.stringify(hello);
  useEffect(() => {
    if (!hello) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      const ws = new WebSocket(relayUrl());
      socket.current = ws;
      ws.onopen = () => {
        ws.send(helloKey);
        setConnected(true);
      };
      ws.onmessage = (e) => {
        try {
          handler.current(JSON.parse(String(e.data)));
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helloKey]);
  const send = (m: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  };
  return { send, connected };
}

/** Operator side: publish live state to output/stage windows (same computer) and the relay (other devices). */
export function useLiveBroadcast(live: LiveState, relaySend: (m: unknown) => void) {
  const latest = useRef(live);
  const channel = useRef<ReturnType<typeof openLiveChannel> | null>(null);
  useEffect(() => {
    channel.current = openLiveChannel((m) => {
      if (m.type === 'hello') channel.current?.post({ type: 'state', state: latest.current });
      // A slide show covering this very screen still answers to the arrow keys, Space and Esc.
      if (m.type === 'key') window.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, shiftKey: m.shiftKey, cancelable: true }));
    });
    return () => channel.current?.close();
  }, []);
  useEffect(() => {
    latest.current = live;
    saveLive(live);
    channel.current?.post({ type: 'state', state: live });
    relaySend({ type: 'state', state: live });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
}

/** Output side: receive live state locally (BroadcastChannel) or over the network (relay). */
export function useLiveFeed(): LiveState | null {
  const [live, setLive] = useState<LiveState | null>(() => loadLive());
  useEffect(() => {
    const ch = openLiveChannel((m) => m.type === 'state' && setLive(m.state));
    ch.post({ type: 'hello' });
    return () => ch.close();
  }, []);
  useRelay({ type: 'hello', role: 'viewer' }, (m) => {
    if (m.type === 'state' && m.state) setLive(m.state as LiveState);
  });
  return live;
}

export function useNow(intervalMs = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Width of an element, tracked with ResizeObserver. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Saves `value` a moment after it stops changing, and right away when the editor closes (unmounts)
 * with a save still pending — edits never need a 저장 button. The value it starts with is not saved.
 * Returns `flush`, to save a pending change now.
 */
export function useAutosave<T>(value: T, save: (v: T) => void, { delay = 700, enabled = true } = {}): () => void {
  const key = JSON.stringify(value);
  const saved = useRef(key);
  const pending = useRef<{ v: T; key: string } | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const flush = useCallback(() => {
    const p = pending.current;
    pending.current = null;
    if (!p || p.key === saved.current) return;
    saved.current = p.key;
    saveRef.current(p.v);
  }, []);
  useEffect(() => {
    if (!enabled || key === saved.current) return;
    pending.current = { v: value, key };
    const t = setTimeout(flush, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, delay, flush]);
  useEffect(() => flush, [flush]);
  return flush;
}
