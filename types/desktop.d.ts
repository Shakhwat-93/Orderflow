export interface DesktopWindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
  isAlwaysOnTop: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  zoomFactor: number;
}

export interface DesktopEngineInfo {
  port: number | null;
  version: string;
  startedAt: number | null;
  windowCount: number;
  platform: string;
  arch: string;
}

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  arch: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  getWindowState: () => Promise<DesktopWindowState>;
  setAlwaysOnTop: (flag?: boolean) => Promise<boolean>;
  openNewWindow: (routePath?: string) => Promise<boolean>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: (ignoreCache?: boolean) => Promise<void>;
  setZoomFactor: (factor: number) => Promise<number>;
  adjustZoom: (delta: number) => Promise<number>;
  openDataFolder: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  toggleDevTools: () => Promise<void>;
  printPage: () => Promise<void>;
  getEngineInfo: () => Promise<DesktopEngineInfo>;
  onWindowStateChange: (callback: (state: DesktopWindowState) => void) => () => void;
}

declare global {
  interface Window {
    desktopApp?: DesktopBridge;
  }
}
