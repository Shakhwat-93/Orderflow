const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  dialog,
  Notification,
  nativeImage,
  ipcMain,
} = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');
const { spawn } = require('child_process');

const APP_NAME = 'Canvas Order';
const PREFERRED_PORT_START = 39480;
const PREFERRED_PORT_END = 39499;

/** @type {Set<BrowserWindow>} */
const desktopWindows = new Set();
let primaryWindow = null;
let splashWindow = null;
let tray = null;
let serverProcess = null;
let activePort = null;
let serverStartedAt = null;
let isQuitting = false;
let ipcRegistered = false;

// Ensure single instance for main app entry
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId('com.canvasorder.desktop');

function getLogFilePath() {
  try {
    return path.join(app.getPath('userData'), 'desktop.log');
  } catch {
    return path.join(process.cwd(), 'desktop.log');
  }
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    fs.appendFileSync(getLogFilePath(), line, 'utf8');
  } catch {
    // ignore log write failures
  }
}

function parseEnvFile(filePath) {
  const out = {};
  if (!filePath || !fs.existsSync(filePath)) return out;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key) out[key] = val;
    }
  } catch (err) {
    logLine(`Warning parsing env file ${filePath}: ${err.message}`);
  }
  return out;
}

function resolveStandaloneDir() {
  if (app.isPackaged) {
    const resDir = path.join(process.resourcesPath, 'standalone');
    if (fs.existsSync(path.join(resDir, 'server.js'))) return resDir;
  }
  const localDist = path.join(__dirname, '..', 'dist-desktop', 'standalone');
  if (fs.existsSync(path.join(localDist, 'server.js'))) return localDist;
  const nextStandalone = path.join(__dirname, '..', '.next', 'standalone');
  if (fs.existsSync(path.join(nextStandalone, 'server.js'))) return nextStandalone;
  return null;
}

function checkPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, host);
  });
}

async function pickConsistentPort() {
  for (let p = PREFERRED_PORT_START; p <= PREFERRED_PORT_END; p += 1) {
    if (await checkPortFree(p, '127.0.0.1')) return p;
  }
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => resolve(addr.port));
    });
  });
}

function seedInitialData(standaloneDir, userDataDir) {
  try {
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    const targetCache = path.join(userDataDir, 'steadfast_statements_cache.json');
    if (!fs.existsSync(targetCache)) {
      const bundledCache = path.join(standaloneDir, 'data', 'steadfast_statements_cache.json');
      if (fs.existsSync(bundledCache)) {
        fs.copyFileSync(bundledCache, targetCache);
        logLine('Seeded initial Steadfast statements cache into userData.');
      }
    }
  } catch (err) {
    logLine(`Seed data warning: ${err.message}`);
  }
}

function waitForServerHealth(port, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Local Next.js server timed out before becoming healthy.'));
      }
      const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
          return resolve();
        }
        setTimeout(attempt, 200);
      });
      req.on('error', () => setTimeout(attempt, 200));
      req.on('timeout', () => {
        req.destroy();
        setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function startLocalServer() {
  const standaloneDir = resolveStandaloneDir();
  if (!standaloneDir) {
    throw new Error(
      'Bundled standalone server.js was not found. Please rebuild the desktop package via "npm run desktop:build".'
    );
  }

  const userDataDir = app.getPath('userData');
  seedInitialData(standaloneDir, userDataDir);

  const port = await pickConsistentPort();
  activePort = port;
  serverStartedAt = Date.now();

  const bundledEnv = {
    ...parseEnvFile(path.join(standaloneDir, '.env')),
    ...parseEnvFile(path.join(standaloneDir, '.env.local')),
    ...parseEnvFile(path.join(userDataDir, '.env')),
  };

  const serverScript = path.join(standaloneDir, 'server.js');
  logLine(`Starting standalone server at ${serverScript} on http://127.0.0.1:${port}`);

  const childEnv = {
    ...process.env,
    ...bundledEnv,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: 'production',
    DESKTOP_APP: '1',
    HOSTNAME: '127.0.0.1',
    PORT: String(port),
    ORDERFLOW_DATA_DIR: userDataDir,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`,
  };

  serverProcess = spawn(process.execPath, [serverScript], {
    cwd: standaloneDir,
    env: childEnv,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) logLine(`[Next] ${text}`);
  });

  serverProcess.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) logLine(`[Next ERR] ${text}`);
  });

  serverProcess.once('exit', (code, signal) => {
    logLine(`Local Next.js server exited (code=${code}, signal=${signal})`);
    serverProcess = null;
    if (!isQuitting && desktopWindows.size > 0) {
      dialog.showErrorBox(
        `${APP_NAME} — Local Server Stopped`,
        `The background server stopped unexpectedly (code ${code}). Please restart ${APP_NAME}.`
      );
    }
  });

  await waitForServerHealth(port);
  logLine(`Local server healthy on http://127.0.0.1:${port}`);
  return port;
}

function stopLocalServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill('SIGTERM');
    setTimeout(() => {
      if (serverProcess) {
        try {
          serverProcess.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, 1500);
  } catch (err) {
    logLine(`Error stopping server: ${err.message}`);
  }
}

function loadWindowState() {
  const fallback = { width: 1440, height: 900, isMaximized: true, zoomFactor: 1 };
  try {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(stateFile)) {
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      if (parsed && typeof parsed.width === 'number' && typeof parsed.height === 'number') {
        return { ...fallback, ...parsed };
      }
    }
  } catch {
    // ignore corrupt state
  }
  return fallback;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? loadWindowState() : win.getBounds();
    const zoomFactor = win.webContents?.getZoomFactor?.() || 1;
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    fs.writeFileSync(
      stateFile,
      JSON.stringify({
        width: bounds.width || 1440,
        height: bounds.height || 900,
        x: bounds.x,
        y: bounds.y,
        isMaximized,
        zoomFactor,
      }),
      'utf8'
    );
  } catch {
    // ignore write failures
  }
}

function getWindowStatePayload(win) {
  if (!win || win.isDestroyed()) {
    return {
      isMaximized: false,
      isFullScreen: false,
      isFocused: false,
      isAlwaysOnTop: false,
      canGoBack: false,
      canGoForward: false,
      zoomFactor: 1,
    };
  }
  const wc = win.webContents;
  const navHist = wc.navigationHistory;
  const canGoBack = navHist ? navHist.canGoBack() : wc.canGoBack();
  const canGoForward = navHist ? navHist.canGoForward() : wc.canGoForward();

  return {
    isMaximized: win.isMaximized(),
    isFullScreen: win.isFullScreen(),
    isFocused: win.isFocused(),
    isAlwaysOnTop: win.isAlwaysOnTop(),
    canGoBack: Boolean(canGoBack),
    canGoForward: Boolean(canGoForward),
    zoomFactor: Number((wc.getZoomFactor() || 1).toFixed(2)),
  };
}

function broadcastWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('desktop:window-state', getWindowStatePayload(win));
  } catch {
    // ignore if renderer not ready
  }
}

function navigateBack(win) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  if (wc.navigationHistory?.canGoBack()) {
    wc.navigationHistory.goBack();
  } else if (wc.canGoBack()) {
    wc.goBack();
  }
}

function navigateForward(win) {
  if (!win || win.isDestroyed()) return;
  const wc = win.webContents;
  if (wc.navigationHistory?.canGoForward()) {
    wc.navigationHistory.goForward();
  } else if (wc.canGoForward()) {
    wc.goForward();
  }
}

function clampZoom(factor) {
  return Math.max(0.75, Math.min(1.5, Math.round(factor * 100) / 100));
}

function sanitizeRoutePath(routePath) {
  if (!routePath || typeof routePath !== 'string') return '/';
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

function createSplashWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  splashWindow = new BrowserWindow({
    width: 460,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.center();
  splashWindow.focus();
}

function setupTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.png');
    const trayImg = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(trayImg);
    tray.setToolTip(APP_NAME);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Show ${APP_NAME}`,
        click: () => {
          const target = primaryWindow && !primaryWindow.isDestroyed()
            ? primaryWindow
            : Array.from(desktopWindows)[0];
          if (target) {
            if (target.isMinimized()) target.restore();
            target.show();
            target.focus();
          }
        },
      },
      {
        label: 'Open New Workspace Window',
        click: () => {
          if (activePort) createAppWindow(activePort, '/', { isSecondary: true });
        },
      },
      {
        label: 'Open Cache & Logs Folder',
        click: () => shell.openPath(app.getPath('userData')),
      },
      { type: 'separator' },
      {
        label: `Quit ${APP_NAME}`,
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => {
      const target = primaryWindow && !primaryWindow.isDestroyed()
        ? primaryWindow
        : Array.from(desktopWindows)[0];
      if (target) {
        if (target.isMinimized()) target.restore();
        target.show();
        target.focus();
      }
    });
  } catch (err) {
    logLine(`Tray setup warning: ${err.message}`);
  }
}

function buildContextMenuForWindow(win, params) {
  const wc = win.webContents;
  const navHist = wc.navigationHistory;
  const canBack = navHist ? navHist.canGoBack() : wc.canGoBack();
  const canForward = navHist ? navHist.canGoForward() : wc.canGoForward();

  let currentRoute = '/';
  try {
    const parsedUrl = new URL(wc.getURL());
    currentRoute = `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    currentRoute = '/';
  }

  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [];

  if (params.isEditable) {
    template.push(
      { role: 'undo', label: 'Undo' },
      { role: 'redo', label: 'Redo' },
      { type: 'separator' },
      { role: 'cut', label: 'Cut' },
      { role: 'copy', label: 'Copy' },
      { role: 'paste', label: 'Paste' },
      { role: 'selectAll', label: 'Select All' },
      { type: 'separator' }
    );
  } else if (params.selectionText && params.selectionText.trim().length > 0) {
    template.push(
      { role: 'copy', label: 'Copy Selected Text' },
      { type: 'separator' }
    );
  }

  template.push(
    {
      label: 'Back',
      enabled: Boolean(canBack),
      click: () => navigateBack(win),
    },
    {
      label: 'Forward',
      enabled: Boolean(canForward),
      click: () => navigateForward(win),
    },
    {
      label: 'Reload View',
      accelerator: 'F5',
      click: () => wc.reload(),
    },
    { type: 'separator' },
    {
      label: 'Open Current View in New Window',
      accelerator: 'CmdOrCtrl+Shift+N',
      click: () => activePort && createAppWindow(activePort, currentRoute, { isSecondary: true }),
    },
    {
      label: 'Keep Window Always on Top',
      type: 'checkbox',
      checked: win.isAlwaysOnTop(),
      click: (item) => {
        const enabled = Boolean(item.checked);
        win.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal');
        broadcastWindowState(win);
      },
    },
    { type: 'separator' },
    {
      label: 'Zoom In',
      click: () => {
        wc.setZoomFactor(clampZoom(wc.getZoomFactor() + 0.1));
        broadcastWindowState(win);
      },
    },
    {
      label: 'Zoom Out',
      click: () => {
        wc.setZoomFactor(clampZoom(wc.getZoomFactor() - 0.1));
        broadcastWindowState(win);
      },
    },
    {
      label: 'Reset Zoom (100%)',
      click: () => {
        wc.setZoomFactor(1);
        broadcastWindowState(win);
      },
    },
    { type: 'separator' },
    {
      label: 'Print Current Screen...',
      click: () => wc.print({ silent: false, printBackground: true }),
    },
    {
      label: 'Open App Data & Logs Folder',
      click: () => shell.openPath(app.getPath('userData')),
    },
    {
      label: 'Inspect Element',
      click: () => {
        wc.inspectElement(params.x, params.y);
      },
    }
  );

  return Menu.buildFromTemplate(template);
}

function createAppWindow(port, routePath = '/', options = {}) {
  const { isSecondary = false } = options;
  const savedState = loadWindowState();
  const iconPath = path.join(__dirname, 'icon.ico');

  const winBounds = {
    width: savedState.width || 1440,
    height: savedState.height || 900,
    x: savedState.x,
    y: savedState.y,
  };

  if (isSecondary) {
    const focusedWin = BrowserWindow.getFocusedWindow() || primaryWindow;
    if (focusedWin && !focusedWin.isDestroyed()) {
      const b = focusedWin.getBounds();
      winBounds.width = Math.min(b.width || 1360, 1440);
      winBounds.height = Math.min(b.height || 860, 900);
      winBounds.x = (b.x ?? 80) + 36;
      winBounds.y = (b.y ?? 60) + 36;
    } else {
      winBounds.width = 1360;
      winBounds.height = 860;
      delete winBounds.x;
      delete winBounds.y;
    }
  }

  const win = new BrowserWindow({
    ...winBounds,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    frame: false,
    thickFrame: true,
    hasShadow: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    backgroundColor: '#141414',
    icon: fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  });

  desktopWindows.add(win);
  if (!primaryWindow || primaryWindow.isDestroyed()) {
    primaryWindow = win;
  }

  // Restore saved zoom factor
  if (typeof savedState.zoomFactor === 'number' && savedState.zoomFactor >= 0.75 && savedState.zoomFactor <= 1.5) {
    win.webContents.setZoomFactor(savedState.zoomFactor);
  }

  if (!isSecondary && savedState.isMaximized) {
    win.maximize();
  }

  // Window open handler — allow blank print popups (printUtils.js), route local popups cleanly, external to OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || url.startsWith('about:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          frame: true,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          icon: fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'icon.png'),
        },
      };
    }

    if (url.startsWith(`http://127.0.0.1:${port}`) || url.startsWith(`http://localhost:${port}`)) {
      try {
        const u = new URL(url);
        createAppWindow(port, `${u.pathname}${u.search}`, { isSecondary: true });
      } catch {
        createAppWindow(port, '/', { isSecondary: true });
      }
      return { action: 'deny' };
    }

    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const isLocalApp =
      url.startsWith(`http://127.0.0.1:${port}`) ||
      url.startsWith(`http://localhost:${port}`) ||
      url.startsWith('about:');
    if (!isLocalApp && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Notify on XLSX / file export completion
  win.webContents.session.on('will-download', (_event, item) => {
    item.once('done', (_e, stateStr) => {
      if (stateStr === 'completed') {
        const savedPath = item.getSavePath();
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: `${APP_NAME} — Export Complete`,
            body: path.basename(savedPath),
          });
          notif.on('click', () => shell.showItemInFolder(savedPath));
          notif.show();
        }
      }
    });
  });

  // Native right-click desktop menu
  win.webContents.on('context-menu', (_event, params) => {
    const menu = buildContextMenuForWindow(win, params);
    menu.popup({ window: win });
  });

  // Native keyboard shortcuts (works reliably even with no app menu bar)
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const ctrlOrCmd = input.control || input.meta;

    // Reload view (F5 or Ctrl+R)
    if (input.key === 'F5' || (ctrlOrCmd && input.key.toLowerCase() === 'r')) {
      event.preventDefault();
      if (input.shift) {
        win.webContents.reloadIgnoringCache();
      } else {
        win.webContents.reload();
      }
      return;
    }

    // Open New Desktop Window (Ctrl+Shift+N)
    if (ctrlOrCmd && input.shift && input.key.toLowerCase() === 'n') {
      event.preventDefault();
      let route = '/';
      try {
        const parsed = new URL(win.webContents.getURL());
        route = `${parsed.pathname}${parsed.search}`;
      } catch {
        route = '/';
      }
      createAppWindow(port, route, { isSecondary: true });
      return;
    }

    // Back / Forward (Alt+Left / Alt+Right)
    if (input.alt && input.key === 'ArrowLeft') {
      event.preventDefault();
      navigateBack(win);
      return;
    }
    if (input.alt && input.key === 'ArrowRight') {
      event.preventDefault();
      navigateForward(win);
      return;
    }

    // Fullscreen (F11)
    if (input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
      broadcastWindowState(win);
      return;
    }

    // Toggle DevTools (F12 or Ctrl+Shift+I)
    if (input.key === 'F12' || (ctrlOrCmd && input.shift && input.key.toLowerCase() === 'i')) {
      event.preventDefault();
      win.webContents.toggleDevTools();
      return;
    }

    // Zoom controls (Ctrl+= / Ctrl+- / Ctrl+0)
    if (ctrlOrCmd && !input.alt) {
      if (input.key === '=' || input.key === '+') {
        event.preventDefault();
        win.webContents.setZoomFactor(clampZoom(win.webContents.getZoomFactor() + 0.1));
        broadcastWindowState(win);
        return;
      }
      if (input.key === '-' || input.key === '_') {
        event.preventDefault();
        win.webContents.setZoomFactor(clampZoom(win.webContents.getZoomFactor() - 0.1));
        broadcastWindowState(win);
        return;
      }
      if (input.key === '0') {
        event.preventDefault();
        win.webContents.setZoomFactor(1);
        broadcastWindowState(win);
        return;
      }
    }
  });

  // Live window state updates to renderer
  const sync = () => broadcastWindowState(win);
  win.on('maximize', sync);
  win.on('unmaximize', sync);
  win.on('enter-full-screen', sync);
  win.on('leave-full-screen', sync);
  win.on('focus', sync);
  win.on('blur', sync);
  win.on('always-on-top-changed', sync);
  win.webContents.on('did-navigate', sync);
  win.webContents.on('did-navigate-in-page', sync);
  win.webContents.on('did-finish-load', sync);

  win.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    win.show();
    win.focus();
    sync();
  });

  win.on('close', () => {
    if (win === primaryWindow) {
      saveWindowState(win);
    }
  });

  win.on('closed', () => {
    desktopWindows.delete(win);
    if (primaryWindow === win) {
      primaryWindow = Array.from(desktopWindows)[0] || null;
    }
  });

  const cleanRoute = sanitizeRoutePath(routePath);
  win.loadURL(`http://127.0.0.1:${port}${cleanRoute}`);
  return win;
}

function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcRegistered = true;

  ipcMain.handle('desktop:window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.minimize();
  });

  ipcMain.handle('desktop:window-toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    broadcastWindowState(win);
    return win.isMaximized();
  });

  ipcMain.handle('desktop:window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
  });

  ipcMain.handle('desktop:window-get-state', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return getWindowStatePayload(win);
  });

  ipcMain.handle('desktop:window-set-always-on-top', (event, flag) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    const nextVal = typeof flag === 'boolean' ? flag : !win.isAlwaysOnTop();
    win.setAlwaysOnTop(nextVal, nextVal ? 'floating' : 'normal');
    broadcastWindowState(win);
    return win.isAlwaysOnTop();
  });

  ipcMain.handle('desktop:window-open-new', (_event, routePath) => {
    if (!activePort) return false;
    createAppWindow(activePort, sanitizeRoutePath(routePath), { isSecondary: true });
    return true;
  });

  ipcMain.handle('desktop:nav-back', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    navigateBack(win);
  });

  ipcMain.handle('desktop:nav-forward', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    navigateForward(win);
  });

  ipcMain.handle('desktop:nav-reload', (event, ignoreCache) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (ignoreCache) {
      win.webContents.reloadIgnoringCache();
    } else {
      win.webContents.reload();
    }
  });

  ipcMain.handle('desktop:zoom-set', (event, factor) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return 1;
    const next = clampZoom(Number(factor) || 1);
    win.webContents.setZoomFactor(next);
    broadcastWindowState(win);
    return next;
  });

  ipcMain.handle('desktop:zoom-adjust', (event, delta) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return 1;
    const cur = win.webContents.getZoomFactor() || 1;
    const next = clampZoom(cur + (Number(delta) || 0));
    win.webContents.setZoomFactor(next);
    broadcastWindowState(win);
    return next;
  });

  ipcMain.handle('desktop:open-data-folder', async () => {
    return shell.openPath(app.getPath('userData'));
  });

  ipcMain.handle('desktop:open-external', async (_event, url) => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('desktop:toggle-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
  });

  ipcMain.handle('desktop:print', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.print({ silent: false, printBackground: true });
    }
  });

  ipcMain.handle('desktop:get-engine-info', () => ({
    port: activePort,
    version: app.getVersion(),
    startedAt: serverStartedAt,
    windowCount: desktopWindows.size,
    platform: process.platform,
    arch: process.arch,
  }));
}

app.on('second-instance', () => {
  const target = primaryWindow && !primaryWindow.isDestroyed()
    ? primaryWindow
    : Array.from(desktopWindows)[0];
  if (target) {
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
  }
});

app.whenReady().then(async () => {
  // Remove legacy File/Edit/View web menu bar completely for pure native desktop feel
  Menu.setApplicationMenu(null);
  registerIpcHandlers();
  createSplashWindow();
  setupTray();

  try {
    const port = await startLocalServer();
    createAppWindow(port, '/', { isSecondary: false });
  } catch (err) {
    logLine(`Startup failure: ${err.stack || err.message}`);
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    dialog.showErrorBox(
      `${APP_NAME} — Startup Error`,
      `${err.message}\n\nCheck log: ${getLogFilePath()}`
    );
    isQuitting = true;
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopLocalServer();
});

app.on('window-all-closed', () => {
  isQuitting = true;
  stopLocalServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
