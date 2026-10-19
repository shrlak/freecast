import type { LiveState } from './types';

export type LiveMessage = { type: 'state'; state: LiveState } | { type: 'hello' };

const CHANNEL = 'freecast-live';

/** Same-origin channel linking the operator console with output and stage windows. */
export function openLiveChannel(onMessage: (m: LiveMessage) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  ch.onmessage = (e: MessageEvent<LiveMessage>) => onMessage(e.data);
  return {
    post: (m: LiveMessage) => ch.postMessage(m),
    close: () => ch.close(),
  };
}
