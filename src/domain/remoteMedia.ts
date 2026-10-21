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

async function sendOne(id: string) {
  try {
    const blob = await getMedia(id);
    if (!blob || blob.size > MAX_BYTES) return;
    const res = await fetch(`/api/remote-media/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: blob });
    if (!res.ok) sent.delete(id);
  } catch {
    sent.delete(id);
  }
}

/** Hand media to the server (three at a time, in the order given) so remotes can draw slides like this computer does. */
export async function sendMediaToRemotes(ids: string[]) {
  const todo = ids.filter((id) => !sent.has(id));
  todo.forEach((id) => sent.add(id));
  const worker = async () => {
    for (let id = todo.shift(); id; id = todo.shift()) await sendOne(id);
  };
  await Promise.all([worker(), worker(), worker()]);
}

/** Forget what was sent (the server restarted or a new remote needs everything again). */
export const resetSentMedia = () => sent.clear();
