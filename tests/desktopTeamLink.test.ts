import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Exercise the real settings and IPC code without starting Electron or touching user files.
const source = readFileSync(new URL('../electron/main.mjs', import.meta.url), 'utf8');
const settingsCode = source.slice(source.indexOf('const settingsFile ='), source.indexOf('// ---------- server ----------'));
const rotationCode = source.slice(source.indexOf("ipcMain.handle('desktop:newRemoteLink'"), source.indexOf("ipcMain.handle('desktop:updateState'"));
function fixture(keychainFails = false) {
  const raw = { networkRemote: true, internetRemote: true, remoteLinkId: 'saved-remote-id', remoteLinkSecret: 'saved-remote-private-secret', teamLinkId: 'saved-team-id', teamLinkSecret: 'saved-team-private-secret', aiEnc: 'eA==' };
  let saved = '', rotate: (() => Promise<void>) | undefined;
  const context = vm.createContext({ path, Buffer,
    app: { getPath: () => '/fake' },
    fs: { readFileSync: () => JSON.stringify(raw), mkdirSync: () => {}, writeFileSync: (_p: string, text: string) => { saved = text; } },
    safeStorage: { isEncryptionAvailable: () => true, decryptString: () => { if (keychainFails) throw new Error('Unavailable keychain'); return '{}'; } },
    ipcMain: { handle: (_event: string, fn: () => Promise<void>) => { rotate = fn; } },
    fromMain: () => true, removeLink: async () => ({ ok: true }), linkOpts: () => ({}), publishLink: () => {}, publishedFor: null, linkState: {},
    newLinkCredentials: () => ({ id: 'rotated-remote-id', secret: 'rotated-remote-secret' }),
  });
  vm.runInContext(settingsCode + '\nloadSettings(); saveSettings();\n' + rotationCode, context);
  return { raw, saved: () => JSON.parse(saved), rotate: async () => { await rotate!(); }, current: () => JSON.parse(vm.runInContext('JSON.stringify(settings)', context)) };
}
describe('permanent desktop team credentials', () => {
  it('preserves both saved links when settings are loaded and saved again', () => {
    const f = fixture();
    expect(f.saved()).toMatchObject({ remoteLinkId: f.raw.remoteLinkId, remoteLinkSecret: f.raw.remoteLinkSecret, teamLinkId: f.raw.teamLinkId, teamLinkSecret: f.raw.teamLinkSecret });
  });
  it('does not replace permanent links when only the AI keychain fails to decrypt', () => {
    const f = fixture(true);
    expect(f.saved()).toMatchObject({ remoteLinkId: f.raw.remoteLinkId, teamLinkId: f.raw.teamLinkId, teamLinkSecret: f.raw.teamLinkSecret });
  });
  it('normal remote-key rotation never changes the saved team identity or secret', async () => {
    const f = fixture(); await f.rotate();
    expect(f.current()).toMatchObject({ remoteLinkId: 'rotated-remote-id', teamLinkId: f.raw.teamLinkId, teamLinkSecret: f.raw.teamLinkSecret });
    expect(f.saved().teamLinkId).toBe(f.raw.teamLinkId);
  });
});
