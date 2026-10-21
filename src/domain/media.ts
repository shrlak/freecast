// Media files live in IndexedDB so every window can load them by id.
const DB_NAME = 'freecast-media';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = run(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const putMedia = (id: string, blob: Blob) => tx('readwrite', (s) => s.put(blob, id)).then(() => undefined);
export const deleteMedia = (id: string) => tx('readwrite', (s) => s.delete(id)).then(() => undefined);
export const getMedia = (id: string) => tx<Blob | undefined>('readonly', (s) => s.get(id));

const urlCache = new Map<string, Promise<string | null>>();

/** Object URL for a stored media id, cached for the life of the window. */
export function mediaUrl(id: string): Promise<string | null> {
  let p = urlCache.get(id);
  if (!p) {
    p = getMedia(id)
      .then((b) => (b ? URL.createObjectURL(b) : isRemote() ? fromComputer(id) : null))
      .catch(() => null);
    urlCache.set(id, p);
    // A remote that could not get it may succeed later (the computer sends media a moment after a slide is chosen).
    p.then((u) => !u && urlCache.get(id) === p && urlCache.delete(id));
  }
  return p;
}

const isRemote = () => document.body?.dataset.view === 'remote';

/** The phone/tablet remote has no media of its own: it gets what slides use from the computer. */
async function fromComputer(id: string): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(`/remote-media/${encodeURIComponent(id)}`);
      if (res.ok) return URL.createObjectURL(await res.blob());
    } catch {
      // network hiccup: try again
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export function forgetMediaUrl(id: string) {
  urlCache.get(id)?.then((u) => u && URL.revokeObjectURL(u));
  urlCache.delete(id);
}
