import { useCallback, useEffect, useRef, useState, type Dispatch } from 'react';
import type { Action } from '../domain/reducer';
import type { Library } from '../domain/types';
import { cloudApi, loadBase, loadSession, saveBase, saveSession, syncMedia, type CloudSession } from '../domain/cloud';
import { mergeLibrary, syncable } from '../domain/cloudMerge';
import { getDevice, initializeDevice, saveDeviceProfile } from '../domain/device';
import { normalizeLibrary } from '../domain/persistence';

export interface CloudStatus {
  session: CloudSession | null;
  state: 'off' | 'syncing' | 'synced' | 'error';
  message: string | null;
  lastSync: number | null;
}

const PUSH_DELAY = 1000;
const POLL_EVERY = 20_000;

/**
 * Keeps this computer's library in step with the church cloud library while signed in:
 * pull + merge on start and every 20 s, push 1 s after any change, media both ways.
 */
export function useCloudSync(library: Library, dispatch: Dispatch<Action>, notify: (m: string) => void) {
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
    if (conflicts.length) notify(`두 기기에서 동시에 고친 프레젠테이션은 둘 다 남겼습니다: ${conflicts.join(', ')}`);
    return { merged, version: remoteVersion };
  }, [dispatch, notify]);

  const sync = useCallback(async (reason: 'pull' | 'push') => {
    const session = loadSession();
    if (!session || busy.current) return;
    busy.current = true;
    setStatus((s) => ({ ...s, state: 'syncing', message: null }));
    try {
      let version = session.version;
      let current = syncable(libRef.current);
      // 1. Pull anything newer from the server and merge it in.
      const remote = await cloudApi.getLibrary(session.token, reason === 'push' ? version : version || undefined);
      if (remote && remote.version !== version) ({ merged: current, version } = await absorb(remote.data, remote.version, session));
      // 2. Push our library if it differs from what the server has.
      const text = JSON.stringify(current);
      const base = await loadBase();
      if (!base || JSON.stringify(base) !== text || version === 0) {
        let res = await cloudApi.putLibrary(session.token, version, current);
        if (res.status === 409 && res.data.data) {
          ({ merged: current, version } = await absorb(res.data.data, res.data.version, session));
          res = await cloudApi.putLibrary(session.token, version, current);
        }
        if (res.status === 200) {
          version = res.data.version;
          await saveBase(current);
          setSession({ ...session, version });
        }
      }
      lastPushed.current = JSON.stringify(syncable(libRef.current));
      await syncMedia(session.token, libRef.current, (m) => setStatus((s) => ({ ...s, message: m })));
      setStatus((s) => ({ ...s, state: 'synced', message: null, lastSync: Date.now() }));
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setSession(null);
        notify('클라우드 로그인이 만료되었습니다. 다시 로그인하세요.');
      }
      setStatus((s) => ({ ...s, state: err.status === 401 ? 'off' : 'error', message: err.message }));
    } finally {
      busy.current = false;
    }
  }, [absorb, notify]);

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
  };

  return { status, device, registeredDevices: library.devices ?? [], renameDevice, login, logout, syncNow: () => sync('pull') };
}

export type CloudSync = ReturnType<typeof useCloudSync>;
