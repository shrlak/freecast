// Self-updating for the FreeCast desktop app.
// - Windows: electron-updater (NSIS) downloads in the background and installs on restart.
// - macOS: Apple's updater only works for apps signed with a paid Developer ID, so unsigned builds
//   download the new release .zip, swap the app bundle with a small script and relaunch.
// Updates are checked at launch, every 4 hours, when the computer wakes, and right away when
// macOS / Windows itself was updated since the last launch.
import { app, Notification, powerMonitor, shell } from 'electron';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import updaterPkg from 'electron-updater';
import { newer } from './version.mjs';

const { autoUpdater } = updaterPkg;
const CHECK_EVERY = 4 * 60 * 60 * 1000;

let send = () => undefined;
let state = { status: 'idle', version: null, progress: 0, error: null, osUpdated: false };
let macUpdate = null; // { version, zipUrl, appPath (downloaded .app) }
let checking = false;
let publish = null;

function set(patch) {
  state = { ...state, ...patch };
  send(state);
}

function notify(title, body, onClick) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  if (onClick) n.on('click', onClick);
  n.show();
}

// Test hook: FREECAST_UPDATE_API points the macOS updater at another release feed (e.g. a local server).
const client = (url) => (url.startsWith('http:') && process.env.FREECAST_UPDATE_API ? http : https);

function getJson(url) {
  return new Promise((resolve, reject) => {
    client(url).get(url, { headers: { 'user-agent': 'FreeCast-Updater', accept: 'application/vnd.github+json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(getJson(res.headers.location));
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`GitHub ${res.statusCode}`))));
    }).on('error', reject);
  });
}

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    client(url).get(url, { headers: { 'user-agent': 'FreeCast-Updater', accept: 'application/octet-stream' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(download(res.headers.location, dest, onProgress));
      if (res.statusCode !== 200) return reject(new Error(`Download failed (${res.statusCode})`));
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      const out = fs.createWriteStream(dest);
      res.on('data', (c) => {
        got += c.length;
        if (total) onProgress(got / total);
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve(dest)));
      out.on('error', reject);
    }).on('error', reject);
  });
}

/** The running .app bundle (…/FreeCast.app). */
const currentBundle = () => path.resolve(process.execPath, '..', '..', '..');

async function checkMac() {
  const rel = await getJson(process.env.FREECAST_UPDATE_API || `https://api.github.com/repos/${publish.owner}/${publish.repo}/releases/latest`);
  const version = String(rel.tag_name ?? '').replace(/^v/, '');
  if (!version || !newer(version, app.getVersion())) return set({ status: 'none', version: app.getVersion() });
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const zips = (rel.assets ?? []).filter((a) => a.name.endsWith('-mac.zip'));
  const asset = zips.find((a) => a.name.includes(arch)) ?? zips.find((a) => !/arm64/.test(a.name) && arch === 'x64');
  if (!asset) return set({ status: 'error', error: `No macOS (${arch}) download in release ${version}` });
  if (macUpdate?.version === version) return set({ status: 'ready', version });
  set({ status: 'downloading', version, progress: 0 });
  notify('FreeCast 업데이트', `새 버전 ${version}을(를) 내려받는 중입니다…`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freecast-update-'));
  const zip = await download(asset.browser_download_url, path.join(dir, asset.name), (p) => set({ progress: Math.round(p * 100) }));
  await new Promise((resolve, reject) => execFile('/usr/bin/ditto', ['-x', '-k', zip, dir], (e) => (e ? reject(e) : resolve())));
  const appDir = fs.readdirSync(dir).find((n) => n.endsWith('.app'));
  if (!appDir) throw new Error('The update archive has no FreeCast.app');
  macUpdate = { version, appPath: path.join(dir, appDir) };
  set({ status: 'ready', version, progress: 100 });
  notify('FreeCast 업데이트 준비됨', `버전 ${version} — 클릭하면 재시작하여 설치합니다.`, () => installUpdate());
  if (process.env.FREECAST_UPDATE_AUTOINSTALL === '1') installUpdate();
}

function installMac() {
  if (!macUpdate) return;
  const target = currentBundle();
  let writable = true;
  try {
    fs.accessSync(path.dirname(target), fs.constants.W_OK);
  } catch {
    writable = false;
  }
  if (!writable || !target.endsWith('.app')) {
    // Can't replace in place (e.g. not in a user-writable folder): show the new app to drag in.
    shell.showItemInFolder(macUpdate.appPath);
    return;
  }
  const script = path.join(os.tmpdir(), `freecast-update-${Date.now()}.sh`);
  fs.writeFileSync(script, `#!/bin/sh
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
rm -rf "${target}.old"
mv "${target}" "${target}.old" && /usr/bin/ditto "${macUpdate.appPath}" "${target}" && rm -rf "${target}.old" || mv "${target}.old" "${target}"
/usr/bin/xattr -dr com.apple.quarantine "${target}" 2>/dev/null
open "${target}"
rm -f "$0"
`, { mode: 0o755 });
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  app.quit();
}

function setupWindows() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => set({ status: 'none', version: app.getVersion() }));
  autoUpdater.on('update-available', (info) => {
    set({ status: 'downloading', version: info.version, progress: 0 });
    notify('FreeCast 업데이트', `새 버전 ${info.version}을(를) 내려받는 중입니다…`);
  });
  autoUpdater.on('download-progress', (p) => set({ progress: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version, progress: 100 });
    notify('FreeCast 업데이트 준비됨', `버전 ${info.version} — 클릭하면 재시작하여 설치합니다.`, () => installUpdate());
  });
  autoUpdater.on('error', (e) => set({ status: 'error', error: e?.message ?? String(e) }));
}

export async function checkForUpdates() {
  if (!app.isPackaged || !publish || checking) return state;
  checking = true;
  try {
    set({ status: 'checking', error: null });
    if (process.platform === 'darwin') await checkMac();
    else await autoUpdater.checkForUpdates();
  } catch (e) {
    set({ status: 'error', error: e?.message ?? String(e) });
  } finally {
    checking = false;
  }
  return state;
}

export function installUpdate() {
  if (state.status !== 'ready') return;
  if (process.platform === 'darwin') installMac();
  else autoUpdater.quitAndInstall(false, true);
}

export const updateState = () => state;

/**
 * Start the updater. `publishConfig` is the GitHub repo that hosts releases;
 * `settings` persists the last OS version seen so an OS update triggers a check.
 */
export function startUpdater({ publishConfig, sendToRenderer, settings, saveSettings }) {
  publish = publishConfig;
  send = sendToRenderer;
  if (!app.isPackaged || !publish) return;
  if (process.platform !== 'darwin') setupWindows();

  const osVersion = `${process.platform} ${os.release()}`;
  const osUpdated = settings.lastOsVersion && settings.lastOsVersion !== osVersion;
  settings.lastOsVersion = osVersion;
  saveSettings();
  if (osUpdated) {
    set({ osUpdated: true });
    notify('운영체제가 업데이트되었습니다', 'FreeCast 업데이트를 확인합니다…');
  }

  setTimeout(checkForUpdates, osUpdated ? 2000 : 10000);
  setInterval(checkForUpdates, CHECK_EVERY);
  powerMonitor.on('resume', () => setTimeout(checkForUpdates, 5000));
}
