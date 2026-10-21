// Internet access for the phone/tablet remote: a public https address that reaches this computer's
// FreeCast server from any network. It runs Cloudflare's free "quick tunnel" (cloudflared: no
// account, no time limit), downloaded once into the app's data folder. Everything arriving through
// the tunnel is treated as "public" (see isPublicHost) and limited to the remote.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RELEASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';
// Where each computer type gets its cloudflared from (the Mac ones are .tgz archives).
const ASSETS = {
  'darwin-arm64': 'cloudflared-darwin-arm64.tgz',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz',
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-arm64': 'cloudflared-windows-amd64.exe',
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64',
};
const URL_RE = /https:\/\/(?!api\.)[a-z0-9][a-z0-9-]*\.trycloudflare\.com/i;

/** Which cloudflared download this computer needs, or null when there is none. */
export function cloudflaredAsset(platform = process.platform, arch = process.arch) {
  return ASSETS[`${platform}-${arch}`] ?? null;
}

/** Terminal colour codes and other control characters removed (cloudflared logs are plain, but be safe). */
export function cleanOutput(text) {
  return String(text)
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');
}

/** Pull the public address out of cloudflared's log. */
export function parseTunnelUrl(text) {
  return URL_RE.exec(cleanOutput(text))?.[0].toLowerCase() ?? null;
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: 'ignore', windowsHide: true });
    c.on('error', reject);
    c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} 종료 코드 ${code}`))));
  });
}

/** Path of cloudflared in `dir`, downloading it first when it is not there yet. */
export async function ensureCloudflared(dir, onNote) {
  const asset = cloudflaredAsset();
  if (!asset) throw new Error(`이 컴퓨터(${process.platform}/${process.arch})용 cloudflared가 없습니다.`);
  const bin = path.join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(bin)) return bin;
  fs.mkdirSync(dir, { recursive: true });
  onNote?.('인터넷 연결 프로그램(cloudflared)을 내려받는 중…');
  const res = await fetch(`${RELEASE}/${asset}`, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`cloudflared 다운로드 실패 (${res.status})`);
  const tmp = path.join(dir, `download-${asset}`);
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    if (asset.endsWith('.tgz')) {
      await run('tar', ['-xzf', tmp, '-C', dir, 'cloudflared']);
      fs.rmSync(tmp, { force: true });
    } else {
      fs.renameSync(tmp, bin);
    }
    fs.chmodSync(bin, 0o755);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(bin, { force: true });
    throw e;
  }
  return bin;
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
 * Open the tunnel to `port` and keep it open (reconnects after a drop). `dir` is where cloudflared is kept.
 * `onChange({ status: 'connecting' | 'on' | 'error', url, error, note })` reports progress.
 */
export function startTunnel(port, onChange, { dir }) {
  let child = null;
  let stopped = false;
  let retry;
  let state = { status: 'connecting', url: null, error: null, note: null };
  const set = (next) => {
    state = { ...state, ...next };
    onChange?.(state);
  };

  const connect = async () => {
    set({ status: 'connecting', url: null, error: null, note: null });
    let bin;
    try {
      bin = await ensureCloudflared(dir, (note) => set({ note }));
    } catch (e) {
      if (stopped) return;
      set({ status: 'error', error: `준비 실패: ${e.message}`, note: null });
      retry = setTimeout(connect, 30_000);
      return;
    }
    if (stopped) return;
    set({ note: null });
    let out = '';
    let gotUrl = false;
    let pending = null;
    // http2 (plain TCP) goes through firewalls that block the faster QUIC/UDP.
    child = spawn(bin, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://127.0.0.1:${port}`], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const read = (chunk) => {
      out = (out + chunk).slice(-4000);
      pending = parseTunnelUrl(out) ?? pending;
      // The address is printed before the tunnel is reachable: show it once the connection is registered.
      if (pending && /Registered tunnel connection/.test(out) && state.url !== pending) {
        gotUrl = true;
        set({ status: 'on', url: pending, error: null });
      }
    };
    // No working connection after a while: say what cloudflared reported, then try again.
    const quiet = setTimeout(() => {
      if (gotUrl || stopped) return;
      child?.kill();
    }, 45_000);
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.on('error', (e) => {
      child = null;
      if (stopped) return;
      set({ status: 'error', url: null, error: `실행 실패: ${e.message}` });
      // A broken download is removed so the next try fetches it again.
      fs.rmSync(bin, { force: true });
      retry = setTimeout(connect, 15_000);
    });
    child.on('close', () => {
      clearTimeout(quiet);
      if (!child) return;
      child = null;
      if (stopped) return;
      if (gotUrl) set({ status: 'connecting', url: null });
      else {
        const said = cleanOutput(out).trim().split('\n').filter(Boolean).filter((l) => /ERR|WRN|failed|error/i.test(l)).slice(-2).join(' ').replace(/\d{4}-\d\d-\d\dT[\d:]+Z /g, '');
        set({ status: 'error', url: null, error: `연결 실패${said ? `: ${said.slice(0, 240)}` : ''}` });
      }
      retry = setTimeout(connect, gotUrl ? 3000 : 15_000);
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
