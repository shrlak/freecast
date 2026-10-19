// Bridge between the FreeCast console page and the desktop app (no Node access in the page).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('freecastDesktop', {
  info: () => ipcRenderer.invoke('desktop:info'),
  openView: (url, displayId) => ipcRenderer.invoke('desktop:openView', url, displayId),
  setAiConfig: (patch) => ipcRenderer.invoke('desktop:setAiConfig', patch),
  setNetworkRemote: (on) => ipcRenderer.invoke('desktop:setNetworkRemote', on),
  closeOutputs: () => ipcRenderer.invoke('desktop:closeOutputs'),
  updateState: () => ipcRenderer.invoke('desktop:updateState'),
  checkUpdates: () => ipcRenderer.invoke('desktop:checkUpdates'),
  installUpdate: () => ipcRenderer.invoke('desktop:installUpdate'),
  onUpdate: (cb) => {
    const listener = (_e, st) => cb(st);
    ipcRenderer.on('desktop:update', listener);
    return () => ipcRenderer.removeListener('desktop:update', listener);
  },
  onDisplays: (cb) => {
    const listener = (_e, displays) => cb(displays);
    ipcRenderer.on('desktop:displays', listener);
    return () => ipcRenderer.removeListener('desktop:displays', listener);
  },
});
