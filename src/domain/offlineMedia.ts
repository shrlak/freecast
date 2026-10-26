import type { Library, MediaMeta } from './types';
import { getMedia } from './media';

/**
 * The pictures, videos and sounds the library uses that this computer does not have yet. Offline they cannot
 * play; once online, syncing downloads them.
 */
export async function missingLocalMedia(lib: Library): Promise<MediaMeta[]> {
  const missing: MediaMeta[] = [];
  for (const m of lib.media) if (!(await getMedia(m.id).catch(() => undefined))) missing.push(m);
  return missing;
}
