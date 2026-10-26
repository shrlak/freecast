import type { BundleDeps } from './safeMode';
import { getMedia, putMedia } from './media';
import { cloudApi, loadSession } from './cloud';

const PIN_CACHE = 'freecast-service-pins';

/** The real files and network behind the service bundle. */
export const browserBundleDeps: BundleDeps = {
  hasMedia: async (id) => !!(await getMedia(id)),
  async fetchMedia(id) {
    const token = loadSession()?.token;
    if (!token) return false;
    await putMedia(id, await cloudApi.downloadMedia(token, id));
    return true;
  },
  async cacheImage(url) {
    if (typeof caches === 'undefined') return (await fetch(url)).ok;
    const cache = await caches.open(PIN_CACHE);
    if (await cache.match(url)) return true;
    const res = await fetch(url);
    if (!res.ok) return false;
    await cache.put(url, res);
    return true;
  },
};
