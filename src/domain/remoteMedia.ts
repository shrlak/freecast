import type { Background, LiveState, Slide } from './types';
import { getMedia } from './media';

const MAX_BYTES = 60 * 1024 * 1024;
/** Ids already on the computer's server, so each file is sent once. */
const sent = new Set<string>();

/** Every picture/video id a slide, background, prop or the logo points at. */
export function mediaIdsFor(parts: { slides?: Slide[]; backgrounds?: (Background | null | undefined)[]; live?: LiveState | null }): string[] {
  const ids = new Set<string>();
  const bg = (b?: Background | null) => b?.kind === 'media' && ids.add(b.mediaId);
  for (const s of parts.slides ?? []) {
    bg(s.background);
    for (const e of s.elements ?? []) if (e.mediaId) ids.add(e.mediaId);
  }
  for (const b of parts.backgrounds ?? []) bg(b);
  const live = parts.live;
  if (live) {
    bg(live.background);
    for (const s of [live.slide, live.announcement?.slide]) {
      bg(s?.background);
      for (const e of s?.elements ?? []) if (e.mediaId) ids.add(e.mediaId);
    }
    if (live.logoMediaId) ids.add(live.logoMediaId);
    for (const p of live.props) if (p.mediaId) ids.add(p.mediaId);
  }
  return [...ids];
}

/** Hand media to the server so remotes can draw slides the way this computer does. */
export async function sendMediaToRemotes(ids: string[]) {
  for (const id of ids) {
    if (sent.has(id)) continue;
    sent.add(id);
    try {
      const blob = await getMedia(id);
      if (!blob || blob.size > MAX_BYTES) continue;
      const res = await fetch(`/api/remote-media/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
      if (!res.ok) sent.delete(id);
    } catch {
      sent.delete(id);
    }
  }
}

/** Forget what was sent (the server restarted or a new remote needs everything again). */
export const resetSentMedia = () => sent.clear();
