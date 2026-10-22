import type { Library } from './types';
import { normalizeLibrary } from './persistence';

// Snapshots of the library, kept in IndexedDB beside the media so a bad edit can be rolled back
// days later (undo only lasts for the open session).
const DB_NAME = 'freecast-restore';
const STORE = 'points';
export const MAX_POINTS = 30;
/** At most one automatic snapshot this often (ms). */
export const AUTO_INTERVAL = 10 * 60_000;

export interface RestorePoint {
  id: number;
  at: number;
  /** 'auto' (timer / startup), 'manual', or 'before restore'. */
  kind: 'auto' | 'manual' | 'safety';
  presentations: number;
  slides: number;
  json: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = f(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

/** Which snapshots survive: the newest `max`, but a manual or safety snapshot outlives autos. */
export function pruneIds(points: Pick<RestorePoint, 'id' | 'at' | 'kind'>[], max = MAX_POINTS): number[] {
  const newest = [...points].sort((a, b) => b.at - a.at);
  const keep = new Set<number>();
  for (const p of newest) if (p.kind !== 'auto' && keep.size < max) keep.add(p.id);
  for (const p of newest) if (p.kind === 'auto' && keep.size < max) keep.add(p.id);
  return newest.filter((p) => !keep.has(p.id)).map((p) => p.id);
}

/** Online songs are never saved with the library (they come back from the server). */
const serialize = (lib: Library) => JSON.stringify({ ...lib, presentations: lib.presentations.filter((p) => !p.online) });

export async function saveRestorePoint(lib: Library, kind: RestorePoint['kind'], at = Date.now()): Promise<void> {
  const mine = lib.presentations.filter((p) => !p.online);
  const point: RestorePoint = { id: at, at, kind, presentations: mine.length, slides: mine.reduce((n, p) => n + p.slides.length, 0), json: serialize(lib) };
  await run('readwrite', (s) => s.put(point));
  const all = await listRestorePoints();
  for (const id of pruneIds(all)) await run('readwrite', (s) => s.delete(id));
}

/** Newest first. */
export async function listRestorePoints(): Promise<RestorePoint[]> {
  const all = await run<RestorePoint[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.at - a.at);
}

/** The library of a snapshot (null if it can no longer be read). */
export const libraryOf = (p: RestorePoint): Library | null => {
  try {
    return normalizeLibrary(JSON.parse(p.json));
  } catch {
    return null;
  }
};
