/** Private reconnect token. getRandomValues also works on a phone's HTTP LAN connection. */
export function phoneIdentity(kind: 'remote' | 'team') {
  const key = `freecast.${kind}.clientToken`;
  let token = localStorage.getItem(key);
  if (!token) { token = [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem(key, token); }
  return token;
}
