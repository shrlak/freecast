// Client for the church cloud library (Worker /freecast/* via this app's /api/cloud proxy).
import type { Library } from './types';
import { deleteMedia as deleteLocalMedia, getMedia, putMedia } from './media';
import { normalizeLibrary } from './persistence';

const SESSION_KEY = 'freecast.cloud';
const BASE_KEY = 'cloud:base';

export interface CloudSession {
  token: string;
  username: string;
  /** Server library version this computer last synced with. */
  version: number;
}

export function loadSession(): CloudSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    return s?.token ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: CloudSession | null) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}

async function call<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<{ status: number; data: T }> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json');
  let res: Response;
  try {
    res = await fetch(`/api/cloud/${path}`, { ...init, headers });
  } catch {
    throw new Error('FreeCast 서버에 연결할 수 없습니다.');
  }
  if (res.status === 204) return { status: 204, data: null as T };
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.blob();
  if (res.status === 404 && (data as { error?: string })?.error === 'not found') {
    // The Worker answered but has no /freecast routes: the account feature is not deployed there yet.
    throw Object.assign(new Error('교회 서버(Cloudflare Worker)에 계정 기능이 아직 설치되지 않았습니다. 관리자가 Worker를 업데이트해야 로그인할 수 있어요.'), { status: 404 });
  }
  if (!res.ok && res.status !== 409) throw Object.assign(new Error((data as { error?: string })?.error ?? `오류 ${res.status}`), { status: res.status });
  return { status: res.status, data: data as T };
}

export const cloudApi = {
  register: (username: string, password: string, adminPassword: string) =>
    call<{ ok: boolean }>('register', { method: 'POST', body: JSON.stringify({ username, password, adminPassword }) }),
  login: (username: string, password: string) =>
    call<{ token: string; username: string }>('login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: (token: string) => call('logout', { method: 'POST', token }).catch(() => undefined),
  /** null when the server has nothing newer than `known`. */
  getLibrary: async (token: string, known?: number) => {
    const r = await call<{ version: number; data: unknown; updatedBy: string | null }>(`library${known != null ? `?known=${known}` : ''}`, { token });
    return r.status === 204 ? null : r.data;
  },
  putLibrary: (token: string, baseVersion: number, data: Library) =>
    call<{ version: number; conflict?: boolean; data?: unknown }>('library', { method: 'PUT', token, body: JSON.stringify({ baseVersion, data }) }),
  listMedia: (token: string) => call<{ items: { id: string; size: number }[] }>('media', { token }).then((r) => r.data.items),
  uploadMedia: (token: string, id: string, blob: Blob) =>
    call(`media/${encodeURIComponent(id)}`, { method: 'PUT', token, body: blob, headers: { 'content-type': blob.type || 'application/octet-stream' } }),
  deleteMedia: (token: string, id: string) => call(`media/${encodeURIComponent(id)}`, { method: 'DELETE', token }),
  downloadMedia: (token: string, id: string) => call<Blob>(`media/${encodeURIComponent(id)}`, { token }).then((r) => r.data),
};

/** The library as the server last saw it (kept in IndexedDB: it can be large). */
export async function loadBase(): Promise<Library | null> {
  const b = await getMedia(BASE_KEY).catch(() => undefined);
  if (!b) return null;
  try {
    return normalizeLibrary(JSON.parse(await b.text()));
  } catch {
    return null;
  }
}

export const saveBase = (lib: Library) => putMedia(BASE_KEY, new Blob([JSON.stringify(lib)], { type: 'application/json' }));

/** Upload media this computer has that the server lacks, and download the reverse. */
export async function syncMedia(token: string, lib: Library, onProgress: (msg: string) => void) {
  const remote = new Set((await cloudApi.listMedia(token)).map((m) => m.id));
  for (const m of lib.media) {
    const local = await getMedia(m.id).catch(() => undefined);
    if (local && !remote.has(m.id)) {
      if (local.size > 50 * 1024 * 1024) continue;
      onProgress(`미디어 올리는 중: ${m.name}`);
      await cloudApi.uploadMedia(token, m.id, local);
    } else if (!local && remote.has(m.id)) {
      onProgress(`미디어 받는 중: ${m.name}`);
      await putMedia(m.id, await cloudApi.downloadMedia(token, m.id));
    }
  }
}

const DELETES_KEY = 'freecast.cloud.mediaDeletes';
const pendingDeletes = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DELETES_KEY) ?? '[]');
  } catch {
    return [];
  }
};

/** Remove media from this computer and, as soon as signed in, from the server (retried until it works). */
export async function purgeMedia(ids: string[]) {
  const queue = [...new Set([...pendingDeletes(), ...ids])];
  for (const id of ids) await deleteLocalMedia(id).catch(() => undefined);
  const session = loadSession();
  const left: string[] = [];
  for (const id of queue) {
    if (!session) left.push(id);
    else await cloudApi.deleteMedia(session.token, id).catch((e: { status?: number }) => { if (e.status !== 404) left.push(id); });
  }
  try {
    localStorage.setItem(DELETES_KEY, JSON.stringify(left));
  } catch { /* storage unavailable */ }
}
