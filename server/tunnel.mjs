// Internet access for the phone/tablet remote: a public https address that reaches this computer's
// FreeCast server from any network. It uses the `ssh` that ships with macOS and Windows 10+
// (reverse tunnel through localhost.run: no account, no extra install). Everything arriving
// through the tunnel is treated as "public" (see isPublicHost) and limited to the remote.
import { spawn } from 'node:child_process';

const TUNNEL_HOST = 'nokey@localhost.run';
// Free tunnels are random *.lhr.life addresses; links such as admin.localhost.run (the account console) are not tunnels.
const HOST_RE = /(?:https:\/\/)?((?!admin\.)[a-z0-9][a-z0-9-]*\.lhr\.life)/i;

/** Terminal colour / cursor codes and other control characters removed. */
export function cleanOutput(text) {
  return String(text)
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[@-Z\\-_]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

/** Pull the public address out of what the tunnel service prints (plain text, a styled screen or JSON). */
export function parseTunnelUrl(text) {
  const m = HOST_RE.exec(cleanOutput(text));
  return m ? `https://${m[1].toLowerCase()}` : null;
}

/**
 * True when the request came in over a public address. Local and home-network visitors use
 * localhost, a private IPv4 address, a .local name or a bare computer name; the tunnel forwards the public host name.
 */
export function isPublicHost(host) {
  const h = String(host ?? '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.localhost') || !h.includes('.')) return false;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (!m) return true;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return !(a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254));
}

/**
 * Open the tunnel to `port` and keep it open (reconnects after a drop).
 * `onChange({ status: 'connecting' | 'on' | 'error', url, error })` reports progress.
 */
export function startTunnel(port, onChange) {
  let child = null;
  // localhost.run's default screen is a styled text UI; JSON output is plain. Try JSON first, then text.
  let json = true;
  let stopped = false;
  let retry;
  let state = { status: 'connecting', url: null, error: null };
  const set = (next) => {
    state = { ...state, ...next };
    onChange?.(state);
  };

  const connect = () => {
    set({ status: 'connecting', url: null, error: null });
    let out = '';
    let gotUrl = false;
    try {
      child = spawn('ssh', [
        // No -N: localhost.run prints the public address on the session channel, which -N never opens.
        '-T',
        '-o', 'StrictHostKeyChecking=accept-new',
        '-o', 'ServerAliveInterval=30',
        '-o', 'ExitOnForwardFailure=yes',
        '-o', 'BatchMode=yes',
        '-R', `80:127.0.0.1:${port}`,
        TUNNEL_HOST,
        ...(json ? ['--', '--output', 'json'] : []),
      ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) {
      return set({ status: 'error', error: e.message });
    }
    const read = (chunk) => {
      out = (out + chunk).slice(-4000);
      const url = parseTunnelUrl(out);
      if (url && state.url !== url) {
        gotUrl = true;
        set({ status: 'on', url, error: null });
      }
    };
    // Connected but no address after a while: say what the service printed.
    const quiet = setTimeout(() => {
      if (gotUrl || stopped) return;
      const said = cleanOutput(out).trim().split('\n').filter(Boolean).slice(-3).join(' ');
      set({ status: 'error', url: null, error: `주소를 받지 못했습니다${said ? `: ${said.slice(0, 240)}` : ''}` });
      child?.kill();
    }, 20_000);
    child.on('close', () => clearTimeout(quiet));
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', (e) => {
      set({ status: 'error', url: null, error: e.code === 'ENOENT' ? 'ssh를 찾을 수 없습니다 (이 컴퓨터에 OpenSSH가 필요합니다).' : e.message });
      if (e.code !== 'ENOENT' && !stopped) retry = setTimeout(connect, 5000);
    });
    child.on('close', () => {
      child = null;
      if (stopped) return;
      if (state.status === 'error' && !/^(연결|주소)/.test(state.error ?? '')) return;
      // Never got an address: show what the service said instead of waiting forever.
      const said = cleanOutput(out).trim().split('\n').filter(Boolean).slice(-3).join(' ');
      if (gotUrl) set({ status: 'connecting', url: null });
      else json = !json;
      if (!gotUrl) set({ status: 'error', url: null, error: `연결 실패${said ? `: ${said.slice(0, 240)}` : ''}` });
      retry = setTimeout(connect, gotUrl ? 5000 : 15000);
    });
  };

  connect();
  return {
    state: () => state,
    stop() {
      stopped = true;
      clearTimeout(retry);
      child?.kill();
    },
  };
}
