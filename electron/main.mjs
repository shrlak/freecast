// FreeCast desktop app: runs the FreeCast server inside the app and shows the console,
// audience outputs and stage displays as native windows placed on your displays.
import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, safeStorage, screen, session, shell, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses, startServer } from '../server/app.mjs';
import { checkForUpdates, installUpdate, startUpdater, updateState } from './updater.mjs';
import { PUBLISH } from './publish.mjs';
import { setAiConfigProvider } from '../server/ai.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
// Fixed port: the console's saved library lives in browser storage tied to this address.
const PORT = 47317;
const SMOKE = process.env.FREECAST_SMOKE;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { networkRemote: false, ai: {}, outputDisplays: {} };

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    let ai = {};
    if (raw.aiEnc && safeStorage.isEncryptionAvailable()) ai = JSON.parse(safeStorage.decryptString(Buffer.from(raw.aiEnc, 'base64')));
    else if (raw.aiPlain) ai = raw.aiPlain;
    settings = { networkRemote: !!raw.networkRemote, ai, outputDisplays: raw.outputDisplays ?? {}, lastOsVersion: raw.lastOsVersion ?? null };
  } catch {
    // first run
  }
}

function saveSettings() {
  const out = { networkRemote: settings.networkRemote, outputDisplays: settings.outputDisplays, lastOsVersion: settings.lastOsVersion ?? null };
  // AI proxy address and optional own Gemini / OpenRouter keys, encrypted with the OS keychain.
  if (Object.keys(settings.ai ?? {}).length) {
    if (safeStorage.isEncryptionAvailable()) out.aiEnc = safeStorage.encryptString(JSON.stringify(settings.ai)).toString('base64');
    else out.aiPlain = settings.ai;
  }
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(out, null, 2));
}

// ---------- server ----------
let running = null;
async function restartServer() {
  await running?.close();
  running = await startServer({ root: path.join(appRoot, 'dist'), port: PORT, host: settings.networkRemote ? '0.0.0.0' : '127.0.0.1' });
}
const origin = () => `http://127.0.0.1:${PORT}`;

// ---------- windows ----------
let mainWindow = null;
let splashWindow = null;
/** The start-screen animation ends (or is clicked away) — splash.js sets its title to "fc-done". */
let splashDone = false;
let mainReady = false;
/** KCCP emblem — window/taskbar icon on Windows & Linux, Dock icon when run unpackaged. */
const APP_ICON = path.join(here, 'icon.png');

/** Big animated KCCP start screen, shown while the built-in server starts. */
function showSplash() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.round(Math.min(1440, sw * 0.78));
  const height = Math.round(Math.min(sh * 0.82, width * 0.6));
  splashWindow = new BrowserWindow({
    width, height, frame: false, resizable: false, center: true, show: false,
    backgroundColor: '#040d1a', alwaysOnTop: true, skipTaskbar: true, roundedCorners: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(here, 'splash.html'));
  splashWindow.once('ready-to-show', () => splashWindow?.show());
  splashWindow.on('page-title-updated', (_e, title) => {
    if (title !== 'fc-done') return;
    splashDone = true;
    revealMain();
  });
  // Never keep the app waiting on a splash that stopped animating.
  setTimeout(() => {
    splashDone = true;
    revealMain();
  }, 12000);
}

/** Show the main window once it has loaded and the start screen has finished. */
function revealMain() {
  if (!mainReady || !splashDone || !mainWindow || mainWindow.isVisible()) return;
  mainWindow.show();
  setTimeout(() => {
    splashWindow?.destroy();
    splashWindow = null;
  }, 150);
}

const viewWindows = new Map();

const webPreferences = {
  preload: path.join(here, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
};

function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `${d.label || `Display ${i + 1}`} (${d.size.width}×${d.size.height})${d.id === primary ? ' · main' : ''}`,
    primary: d.id === primary,
  }));
}

/** Open (or move) an output/stage window. With a display it goes fullscreen there. */
function openView(url, displayId) {
  const u = new URL(url, origin());
  if (u.origin !== origin()) return;
  const key = `${u.searchParams.get('view')}:${u.searchParams.get('screen') ?? ''}:${u.searchParams.get('layout') ?? ''}`;
  const screenId = u.searchParams.get('screen') ?? u.searchParams.get('view');
  if (displayId === undefined) displayId = settings.outputDisplays[screenId];
  else {
    settings.outputDisplays[screenId] = displayId;
    saveSettings();
  }
  const display = screen.getAllDisplays().find((d) => d.id === displayId);
  let win = viewWindows.get(key);
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({
      width: 960, height: 540, title: 'FreeCast', backgroundColor: '#000000', autoHideMenuBar: true, icon: APP_ICON,
      show: false, webPreferences,
    });
    win.on('closed', () => viewWindows.delete(key));
    viewWindows.set(key, win);
    win.loadURL(u.toString());
    win.once('ready-to-show', () => win.show());
  }
  if (display) {
    win.setFullScreen(false);
    win.setBounds(display.bounds);
    win.setFullScreen(true);
  } else if (displayId === null && win.isFullScreen()) {
    win.setFullScreen(false);
    win.setSize(960, 540);
    win.center();
  }
  win.focus();
  return win;
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: () => checkForUpdates() },
        { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open Audience Output', accelerator: 'CmdOrCtrl+1', click: () => openView(`${origin()}/?view=output`) },
        { label: 'Open Stage Display', accelerator: 'CmdOrCtrl+2', click: () => openView(`${origin()}/?view=stage`) },
        { label: 'Close All Outputs', accelerator: 'CmdOrCtrl+Shift+W', click: () => viewWindows.forEach((w) => w.close()) },
        { type: 'separator' },
        { label: 'Open Data Folder', click: () => shell.openPath(app.getPath('userData')) },
        ...(isMac ? [] : [{ type: 'separator' }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640, title: 'FreeCast', icon: APP_ICON,
    backgroundColor: '#0b0d12', show: false, webPreferences,
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return { action: 'deny' };
    }
    if (u.origin === origin() && ['output', 'stage', 'remote', 'multiview'].includes(u.searchParams.get('view') ?? '')) openView(url);
    else if (u.protocol === 'https:' || u.protocol === 'http:') shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(origin())) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  mainWindow.once('ready-to-show', () => {
    if (SMOKE) return;
    mainReady = true;
    if (!splashWindow) splashDone = true;
    revealMain();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    viewWindows.forEach((w) => w.destroy());
  });
  mainWindow.loadURL(`${origin()}/`);
}

// ---------- IPC (exposed to the console through preload.cjs) ----------
const fromMain = (e) => e.senderFrame?.url?.startsWith(origin());
ipcMain.handle('desktop:info', (e) => {
  if (!fromMain(e)) return null;
  return {
    version: app.getVersion(),
    platform: process.platform,
    displays: displayList(),
    outputDisplays: settings.outputDisplays,
    ai: { proxyUrl: settings.ai.proxyUrl ?? '', hasGeminiKey: !!settings.ai.geminiKey, hasOpenrouterKey: !!settings.ai.openrouterKey },
    networkRemote: settings.networkRemote,
    lanUrls: settings.networkRemote ? lanAddresses().map((ip) => `http://${ip}:${PORT}`) : [],
  };
});
ipcMain.handle('desktop:openView', (e, url, displayId) => {
  if (!fromMain(e) || typeof url !== 'string') return;
  openView(url, typeof displayId === 'number' ? displayId : displayId === null ? null : undefined);
});
ipcMain.handle('desktop:setAiConfig', (e, patch) => {
  if (!fromMain(e) || !patch || typeof patch !== 'object') return;
  const next = { ...settings.ai };
  for (const k of ['proxyUrl', 'geminiKey', 'openrouterKey']) {
    if (!(k in patch)) continue;
    const v = typeof patch[k] === 'string' ? patch[k].trim() : '';
    if (v) next[k] = v;
    else delete next[k];
  }
  settings.ai = next;
  saveSettings();
});
ipcMain.handle('desktop:setNetworkRemote', async (e, on) => {
  if (!fromMain(e)) return;
  settings.networkRemote = !!on;
  saveSettings();
  await restartServer();
});
ipcMain.handle('desktop:updateState', (e) => (fromMain(e) ? updateState() : null));
ipcMain.handle('desktop:checkUpdates', (e) => (fromMain(e) ? checkForUpdates() : null));
ipcMain.handle('desktop:installUpdate', (e) => {
  if (fromMain(e)) installUpdate();
});
ipcMain.handle('desktop:closeOutputs', (e) => {
  if (fromMain(e)) viewWindows.forEach((w) => w.close());
});

// ---------- lifecycle ----------
async function smokeTest() {
  const result = { ok: false };
  try {
    const wc = mainWindow.webContents;
    if (wc.isLoading()) await new Promise((r) => wc.once('did-finish-load', r));
    result.console = await wc.executeJavaScript(`new Promise((r) => setTimeout(() => r({ topbar: !!document.querySelector('.topbar, .rb-tabs'), title: document.title, desktop: typeof window.freecastDesktop, online: document.querySelector('.online-status')?.textContent ?? null }), 6000))`);
    result.ai = await wc.executeJavaScript(`fetch('/api/ai/status').then((r) => r.json())`);
    result.info = await wc.executeJavaScript('window.freecastDesktop.info()');
    const out = openView(`${origin()}/?view=output`);
    await new Promise((r) => out.webContents.once('did-finish-load', r));
    result.output = await out.webContents.executeJavaScript(`new Promise((r) => setTimeout(() => r({ title: document.title, canvas: !!document.querySelector('.canvas') || document.body.innerText.slice(0, 60) }), 1500))`);
    result.ok = result.console.topbar && result.console.desktop === 'object' && !!result.output.title;
  } catch (err) {
    result.error = String(err);
  }
  fs.writeFileSync(SMOKE, JSON.stringify(result, null, 2));
  app.exit(result.ok ? 0 : 1);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(APP_ICON);
  if (!SMOKE) showSplash();
  loadSettings();
  setAiConfigProvider(() => settings.ai);
  try {
    await restartServer();
  } catch (err) {
    splashWindow?.destroy();
    dialog.showErrorBox('FreeCast could not start', err.code === 'EADDRINUSE'
      ? `Port ${PORT} is already in use. Close the other program using it (or another FreeCast) and try again.`
      : String(err.message ?? err));
    app.exit(1);
    return;
  }
  // Output recording: hand the FreeCast audience window to getDisplayMedia without a picker.
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    const out = sources.find((s) => s.name.startsWith('FreeCast — ') && !s.name.includes('Stage')) ?? sources.find((s) => s.id.startsWith('screen')) ?? sources[0];
    callback(out ? { video: out } : {});
  });
  buildMenu();
  createMainWindow();
  if (!SMOKE) {
    startUpdater({
      publishConfig: PUBLISH,
      sendToRenderer: (st) => mainWindow?.webContents.send('desktop:update', st),
      settings,
      saveSettings,
    });
  }
  const notify = () => mainWindow?.webContents.send('desktop:displays', displayList());
  screen.on('display-added', notify);
  screen.on('display-removed', notify);
  if (SMOKE) smokeTest();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => running?.close());
