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
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null);
    urlCache.set(id, p);
  }
  return p;
}

export function forgetMediaUrl(id: string) {
  urlCache.get(id)?.then((u) => u && URL.revokeObjectURL(u));
  urlCache.delete(id);
}
