// The fixed address of the internet remote. A free Cloudflare quick tunnel gets a new random
// address every time it starts, so the church Worker keeps a permanent link that forwards to the
// current one: <Worker>/freecast/remote/<id>. This computer tells the Worker where the tunnel is
// each time it connects; <secret> proves the update comes from this computer (see worker/remote-link.js).
import crypto from 'node:crypto';

/** A fresh link: its public id and the private secret that lets this computer update it. */
export function newLinkCredentials() {
  return { id: crypto.randomBytes(12).toString('base64url'), secret: crypto.randomBytes(24).toString('base64url') };
}

/** One installable web-app address, independent of the computer or tunnel. */
export const remoteWebAppAddress = (proxy) => `${String(proxy).replace(/\/+$/, '')}/freecast/remote/`;
export const remotePairingAddress = (proxy, id) => `${remoteWebAppAddress(proxy)}#${id}`;

/** The private-id registration endpoint (older saved links also open the web app). */
export const linkAddress = (proxy, id) => `${String(proxy).replace(/\/+$/, '')}/freecast/remote/${id}`;

async function call(method, { proxy, origin, id, secret, url }, fetchFn) {
  try {
    const res = await fetchFn(linkAddress(proxy, id), {
      method,
      headers: { Origin: origin, 'content-type': 'application/json' },
      body: JSON.stringify({ secret, url }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    // The Worker answered but has no such route: it has not been updated yet.
    if (res.status === 404 && (data.error === 'not found' || !data.error)) return { ok: false, missing: true, error: '교회 서버(Worker)에 고정 링크 기능이 아직 설치되지 않았습니다.' };
    return { ok: false, missing: false, error: data.error ?? `오류 ${res.status}` };
  } catch (e) {
    return { ok: false, missing: false, error: e.message };
  }
}

/** Point the permanent link at the tunnel's current address `url`. */
export const registerLink = (opts, fetchFn = fetch) => call('PUT', opts, fetchFn);
/** Stop the permanent link from working (a new link was made). */
export const removeLink = (opts, fetchFn = fetch) => call('DELETE', opts, fetchFn);
