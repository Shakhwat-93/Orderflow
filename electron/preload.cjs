const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  minimize: () => ipcRenderer.invoke('desktop:window-minimize'),
  toggleMaximize: () => ipcRenderer.invoke('desktop:window-toggle-maximize'),
  close: () => ipcRenderer.invoke('desktop:window-close'),
  getWindowState: () => ipcRenderer.invoke('desktop:window-get-state'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('desktop:window-set-always-on-top', flag),
  openNewWindow: (routePath) => ipcRenderer.invoke('desktop:window-open-new', routePath),
  goBack: () => ipcRenderer.invoke('desktop:nav-back'),
  goForward: () => ipcRenderer.invoke('desktop:nav-forward'),
  reload: (ignoreCache = false) => ipcRenderer.invoke('desktop:nav-reload', ignoreCache),
  setZoomFactor: (factor) => ipcRenderer.invoke('desktop:zoom-set', factor),
  adjustZoom: (delta) => ipcRenderer.invoke('desktop:zoom-adjust', delta),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
  toggleDevTools: () => ipcRenderer.invoke('desktop:toggle-devtools'),
  printPage: () => ipcRenderer.invoke('desktop:print'),
  getEngineInfo: () => ipcRenderer.invoke('desktop:get-engine-info'),
  onWindowStateChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:window-state', listener);
    return () => ipcRenderer.removeListener('desktop:window-state', listener);
  },
});
