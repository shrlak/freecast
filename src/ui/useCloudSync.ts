import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Library } from '../domain/types';
import { cloudApi, loadBase, loadSession, saveBase, saveSession, syncMedia, getCloudStorageUsage, type CloudSession } from '../domain/cloud';
import { mergeLibrary, syncable } from '../domain/cloudMerge';
import { getDevice, initializeDevice, saveDeviceProfile } from '../domain/device';
import { type CloudStorageUsage } from '../domain/cloudStorage';
import { saveSyncRestorePoint } from '../domain/restorePoints';
import { normalizeLibrary } from '../domain/persistence';

export interface CloudStatus {
  session: CloudSession | null;
  state: 'off' | 'syncing' | 'synced' | 'error';
  message: string | null;
  lastSync: number | null;
  storageUsage?: CloudStorageUsage | null;
  storageError?: string | null;
}

const PUSH_DELAY = 1000;
const POLL_EVERY = 20_000;

/**
 * Keeps this computer's library in step with the church cloud library while signed in:
 * pull + merge on start and every 20 s, push 1 s after any change, media both ways.
 */
export function useCloudSync(library: Library, dispatch: Dispatch<Action>, notify: (m: string) => void) {
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const [storage, setStorage] = useState<{ loading: boolean; usage: CloudStorageUsage | null; error: string | null }>({ loading: false, usage: null, error: null });
  const [status, setStatus] = useState<CloudStatus>(() => ({ session: loadSession(), state: loadSession() ? 'syncing' : 'off', message: null, lastSync: null }));
  const [device, setDevice] = useState(getDevice);
  const resumedToken = useRef(loadSession()?.token ?? null);
  useEffect(() => {
    if (!status.session || resumedToken.current !== status.session.token) return;
    resumedToken.current = null;
    const identity = getDevice();
    dispatch({ type: 'activity/record', entry: { id: crypto.randomUUID(), at: Date.now(), action: 'app/open', detail: identity.name, device: identity, account: status.session.username } });
  }, [status.session?.token, dispatch]);
  useEffect(() => { void initializeDevice().then(setDevice).catch(() => undefined); }, []);
  useEffect(() => {
    if (!status.session) return;
    dispatch({ type: 'device/register', device: { ...device, lastSeen: Date.now(), account: status.session.username } });
  }, [device, status.session?.token, dispatch]);
  const record = (action: string, account: string | null, identity = getDevice()) => dispatch({ type: 'activity/record', entry: { id: crypto.randomUUID(), at: Date.now(), action, detail: identity.name, device: identity, account } });
  const renameDevice = (name: string, userName: string) => {
    const identity = saveDeviceProfile(name, userName);
    setDevice(identity);
    record('device/profile', loadSession()?.username ?? null, identity);
  };
  const libRef = useRef(library);
  libRef.current = library;
  const busy = useRef(false);
  const lastPushed = useRef<string>('');
  const requested = useRef(false);
  const storageRequest = useRef(0);
  const refreshStorage = useCallback(async () => {
    const session = loadSession();
    if (!session) return;
    const request = ++storageRequest.current;
    setStorage((s) => ({ ...s, loading: true, error: null }));
    try {
      const usage = await getCloudStorageUsage(session.token);
      if (storageRequest.current === request && loadSession()?.token === session.token) setStorage({ loading: false, usage, error: null });
    } catch (e) {
      if (storageRequest.current === request && loadSession()?.token === session.token) setStorage((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (!status.session) return;
    void refreshStorage();
    const timer = setInterval(() => void refreshStorage(), 30000);
    return () => clearInterval(timer);
  }, [status.session?.token, refreshStorage]);

  const setSession = (s: CloudSession | null) => {
    saveSession(s);
    setStatus((st) => ({ ...st, session: s, state: s ? st.state : 'off' }));
  };

  /** Merge a server library into ours; returns the merged syncable library. */
  const absorb = useCallback(async (remoteData: unknown, remoteVersion: number, session: CloudSession) => {
    const remote = normalizeLibrary(remoteData);
    if (!remote) return { merged: syncable(libRef.current), version: remoteVersion };
    const base = await loadBase();
    const local = syncable(libRef.current);
    const { library: merged, conflicts } = mergeLibrary(base, local, remote);
    dispatch({ type: 'library/merge', library: merged });
    await saveBase(remote);
    setSession({ ...session, version: remoteVersion });
    if (conflicts.length) notifyRef.current(`두 기기에서 동시에 고친 프레젠테이션은 둘 다 남겼습니다: ${conflicts.join(', ')}`);
    return { merged, version: remoteVersion };
  }, [dispatch]);

  const sync = useCallback(async (reason: 'pull' | 'push'): Promise<void> => {
    const session = loadSession();
    if (!session) return;
    if (busy.current) { requested.current = true; return; }
    busy.current = true;
    requested.current = false;
    setStatus((s) => ({ ...s, state: 'syncing', message: null }));
    let succeeded = false;
    try {
      let version = session.version;
      let current = syncable(libRef.current);
      // Keep the exact local state before any network request or incoming merge.
      try { await saveSyncRestorePoint(current); }
      catch { throw new Error('동기화 전 복원 지점을 저장하지 못했습니다. 저장 공간을 확인한 뒤 다시 동기화하세요.'); }
      const remote = await cloudApi.getLibrary(session.token, reason === 'push' ? version : version || undefined);
      if (loadSession()?.token !== session.token) return;
      if (remote && remote.version !== version) ({ merged: current, version } = await absorb(remote.data, remote.version, session));
      const base = await loadBase();
      if (!base || JSON.stringify(base) !== JSON.stringify(current) || version === 0) {
        // Merging may have incorporated newer edits; preserve the submitted state too.
        await saveSyncRestorePoint(current);
        let res = await cloudApi.putLibrary(session.token, version, current);
        if (res.status === 409 && res.data.data) {
          ({ merged: current, version } = await absorb(res.data.data, res.data.version, session));
          await saveSyncRestorePoint(current);
          res = await cloudApi.putLibrary(session.token, version, current);
        }
        if (res.status !== 200) throw new Error('다른 기기의 수정과 충돌했습니다. 복원 지점은 보관했으며 다음 동기화에서 다시 시도합니다.');
        if (loadSession()?.token !== session.token) return;
        if (res.data.data) {
          const canonical = normalizeLibrary(res.data.data);
          if (!canonical) throw new Error('서버의 미디어 정리 결과가 올바르지 않습니다.');
          const { library: merged } = mergeLibrary(current, syncable(libRef.current), canonical);
          dispatch({ type: 'library/merge', library: merged });
          current = canonical;
        }
        version = res.data.version;
        await saveBase(current);
        setSession({ ...session, version });
      }
      // Never mark edits made during an in-flight request as already uploaded.
      lastPushed.current = JSON.stringify(current);
      await syncMedia(session.token, current, (m) => setStatus((s) => ({ ...s, message: m })));
      if (loadSession()?.token !== session.token) return;
      setStatus((s) => ({ ...s, state: 'synced', message: null, lastSync: Date.now() }));
      succeeded = true;
      void refreshStorage();
    } catch (e) {
      if (loadSession()?.token !== session.token) return;
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setSession(null);
        notifyRef.current('클라우드 로그인이 만료되었습니다. 다시 로그인하세요.');
      }
      setStatus((s) => ({ ...s, state: err.status === 401 ? 'off' : 'error', message: err.message }));
    } finally {
      busy.current = false;
      if (loadSession()?.token === session.token && (requested.current || (succeeded && JSON.stringify(syncable(libRef.current)) !== lastPushed.current))) {
        requested.current = false;
        setTimeout(() => void sync('push'), PUSH_DELAY);
      }
    }
  }, [absorb, refreshStorage, dispatch]);

  // Start + poll.
  useEffect(() => {
    if (!status.session) return;
    sync('pull');
    const t = setInterval(() => sync('pull'), POLL_EVERY);
    const onFocus = () => sync('pull');
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.session?.token]);

  // Push shortly after local edits.
  useEffect(() => {
    if (!status.session) return;
    const text = JSON.stringify(syncable(library));
    if (text === lastPushed.current) return;
    const t = setTimeout(() => sync('push'), PUSH_DELAY);
    return () => clearTimeout(t);
  }, [library, status.session, sync]);

  const login = async (username: string, password: string) => {
    const r = await cloudApi.login(username, password);
    setSession({ token: r.data.token, username: r.data.username, version: 0 });
    record('account/login', r.data.username);
    notify(`${r.data.username}(으)로 로그인했습니다 — 라이브러리를 동기화합니다`);
  };
  const logout = async () => {
    const s = loadSession();
    if (s) { record('account/logout', s.username); await cloudApi.logout(s.token); }
    setSession(null);
    setStorage({ loading: false, usage: null, error: null });
  };

  return { status: { ...status, storageUsage: storage.usage, storageError: storage.error }, storage, refreshStorage, device, registeredDevices: library.devices ?? [], renameDevice, login, logout, syncNow: () => sync('pull') };
}

export type CloudSync = ReturnType<typeof useCloudSync>;
