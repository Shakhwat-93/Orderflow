'use client';

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Search,
  Pin,
  PinOff,
  CopyPlus,
  FolderOpen,
  Sun,
  Moon,
  LayoutDashboard,
  ShoppingCart,
  Headphones,
  Factory,
  Truck,
  CreditCard,
  Package,
  ReceiptText,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  TrendingUp,
  Megaphone,
  Users,
  ClipboardList,
  DatabaseBackup,
  Settings,
  User as UserIcon,
  Printer,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Barcode,
  Scan,
  X,
  CornerDownLeft,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import type { DesktopWindowState, DesktopEngineInfo } from '@/types/desktop';
import type { UserRole } from '@/types';
import './desktop.css';

interface RouteDef {
  href: string;
  label: string;
  group: string;
  keywords: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

interface WorkspaceTab {
  href: string;
  label: string;
  group: string;
}

interface PaletteCommand {
  id: string;
  title: string;
  subtitle: string;
  category: 'Navigation' | 'Desktop Actions';
  keywords: string;
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
}

const ROUTES: RouteDef[] = [
  { href: '/', label: 'Overview', group: 'Workspace', keywords: 'dashboard home kpi summary', icon: LayoutDashboard },
  { href: '/tasks', label: 'Tasks', group: 'Workspace', keywords: 'todo work assignments', icon: ClipboardList },
  { href: '/orders?status=All', label: 'All Orders', group: 'Orders', keywords: 'orders list all manage', icon: ShoppingCart },
  { href: '/orders?status=Pending%20Call', label: 'Pending Call', group: 'Orders', keywords: 'pending call confirm queue', icon: Headphones },
  { href: '/orders?status=Final%20Call%20Pending', label: 'Final Call', group: 'Orders', keywords: 'final call follow up', icon: Headphones },
  { href: '/orders?status=Confirmed', label: 'Confirmed Orders', group: 'Orders', keywords: 'confirmed approved orders', icon: ShoppingCart },
  { href: '/orders?status=Cancelled', label: 'Cancelled Orders', group: 'Orders', keywords: 'cancelled rejected', icon: ShoppingCart },
  { href: '/orders?status=Fake%20Order', label: 'Fake Orders', group: 'Orders', keywords: 'spam fake fraud', icon: ShieldAlert },
  { href: '/orders?status=Incomplete', label: 'Incomplete Orders', group: 'Orders', keywords: 'draft incomplete checkout', icon: ShoppingCart },
  { href: '/payments', label: 'Payments', group: 'Finance', keywords: 'payments cod settlement ledger', icon: CreditCard },
  { href: '/inventory', label: 'Inventory', group: 'Operations', keywords: 'stock items products sku', icon: Package, roles: ['Admin', 'Moderator'] },
  { href: '/material-accounts', label: 'Material Accounts', group: 'Operations', keywords: 'materials cost production expense', icon: ReceiptText, roles: ['Admin', 'Moderator', 'Factory Team'] },
  { href: '/factory', label: 'Confirmed Dispatch', group: 'Logistics', keywords: 'factory production dispatch', icon: Factory, roles: ['Admin', 'Factory Team'] },
  { href: '/parcels', label: 'Parcel Hub', group: 'Logistics', keywords: 'parcels tracking barcode scanner dispatch returns', icon: Barcode, roles: ['Admin', 'Factory Team', 'Courier Team', 'Moderator'] },
  { href: '/parcels/dispatch', label: 'Factory Dispatch Scanner', group: 'Logistics', keywords: 'barcode scanner dispatch factory parcel terminal', icon: Scan, roles: ['Admin', 'Factory Team', 'Courier Team', 'Moderator'] },
  { href: '/parcels/returns', label: 'Return Parcel Scanner', group: 'Logistics', keywords: 'returns barcode scanner qc inspection damaged restock', icon: RotateCcw, roles: ['Admin', 'Factory Team', 'Courier Team', 'Moderator'] },
  { href: '/parcels/inventory', label: 'Parcel Inventory Ledger', group: 'Logistics', keywords: 'parcel inventory stock ledger sku', icon: Package, roles: ['Admin', 'Factory Team', 'Courier Team', 'Moderator'] },
  { href: '/parcels/tracking', label: 'Parcel Search & Tracking', group: 'Logistics', keywords: 'search parcel tracking barcode journey', icon: Search, roles: ['Admin', 'Factory Team', 'Courier Team', 'Moderator'] },
  { href: '/parcels/reports', label: 'Parcel Reports & Audit', group: 'Logistics', keywords: 'reports parcel dispatch return audit excel', icon: BarChart3, roles: ['Admin', 'Moderator'] },
  { href: '/courier', label: 'Bulk Exported', group: 'Logistics', keywords: 'courier bulk exported csv excel', icon: Truck, roles: ['Admin', 'Courier Team', 'Factory Team'] },
  { href: '/steadfast', label: 'Steadfast Hub', group: 'Logistics', keywords: 'steadfast tracking consignment balance', icon: Truck, roles: ['Admin', 'Courier Team', 'Moderator'] },
  { href: '/moderator', label: 'Moderator Panel', group: 'Team', keywords: 'moderator team queue', icon: ShieldCheck, roles: ['Admin', 'Moderator'] },
  { href: '/call-team', label: 'Call Team', group: 'Team', keywords: 'call team agents calling', icon: Headphones, roles: ['Admin', 'Call Team'] },
  { href: '/users', label: 'Users & Roles', group: 'Admin', keywords: 'staff accounts roles permissions', icon: Users, roles: ['Admin'] },
  { href: '/fraud', label: 'Fraud Control', group: 'Intelligence', keywords: 'fraud blacklist phone block', icon: ShieldAlert, roles: ['Admin'] },
  { href: '/reports', label: 'Analytics', group: 'Reports', keywords: 'analytics charts metrics', icon: BarChart3, roles: ['Admin'] },
  { href: '/sales-report', label: 'Sales Report', group: 'Reports', keywords: 'sales profit revenue cost', icon: TrendingUp, roles: ['Admin', 'Moderator', 'Call Team'] },
  { href: '/digital-marketer', label: 'Marketing Campaigns', group: 'Marketing', keywords: 'ads campaigns spend meta', icon: Megaphone, roles: ['Admin', 'Digital Marketer'] },
  { href: '/digital-marketer/content-planning', label: 'Content Planning', group: 'Marketing', keywords: 'content posts schedule', icon: Megaphone, roles: ['Admin', 'Digital Marketer'] },
  { href: '/digital-marketer/finance-planning', label: 'Finance Planning', group: 'Marketing', keywords: 'budget finance marketing', icon: Megaphone, roles: ['Admin', 'Digital Marketer'] },
  { href: '/backup', label: 'Backup', group: 'System', keywords: 'backup restore export json', icon: DatabaseBackup, roles: ['Admin'] },
  { href: '/settings', label: 'Settings', group: 'System', keywords: 'settings api courier config', icon: Settings },
  { href: '/profile', label: 'My Profile', group: 'Account', keywords: 'profile password avatar account', icon: UserIcon },
];

const DEFAULT_WINDOW_STATE: DesktopWindowState = {
  isMaximized: false,
  isFullScreen: false,
  isFocused: true,
  isAlwaysOnTop: false,
  canGoBack: false,
  canGoForward: false,
  zoomFactor: 1,
};

const TABS_STORAGE_KEY = 'canvas_desktop_workspace_tabs_v1';
const MAX_TABS = 5;

function resolveRouteInfo(pathname: string, search: string): WorkspaceTab {
  if (pathname === '/login') {
    return { href: '/login', label: 'Sign In', group: 'Auth' };
  }
  const params = new URLSearchParams(search);
  const statusParam = params.get('status');

  if (pathname === '/orders') {
    if (statusParam) {
      const exactHref = `/orders?status=${encodeURIComponent(statusParam)}`;
      const matched = ROUTES.find((r) => r.href === exactHref);
      if (matched) return { href: matched.href, label: matched.label, group: matched.group };
      return { href: exactHref, label: statusParam, group: 'Orders' };
    }
    return { href: '/orders?status=All', label: 'All Orders', group: 'Orders' };
  }

  const matched = ROUTES.find((r) => r.href === pathname);
  if (matched) {
    return { href: matched.href, label: matched.label, group: matched.group };
  }

  const fallbackName = pathname.replace(/^\//, '').replace(/[-_/]+/g, ' ') || 'Overview';
  return {
    href: pathname || '/',
    label: fallbackName.replace(/\b\w/g, (c) => c.toUpperCase()),
    group: 'Workspace',
  };
}

export const DesktopShell: React.FC = () => {
  const [isDesktop, setIsDesktop] = useState(false);
  const [winState, setWinState] = useState<DesktopWindowState>(DEFAULT_WINDOW_STATE);
  const [engineInfo, setEngineInfo] = useState<DesktopEngineInfo | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [currentSearch, setCurrentSearch] = useState('');
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const pathname = usePathname() || '/';
  const router = useRouter();
  const { user, hasAnyRole } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const paletteInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync window.location.search reliably without requiring useSearchParams Suspense wrapper
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCurrentSearch(window.location.search || '');
    const handlePop = () => setCurrentSearch(window.location.search || '');
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, [pathname]);

  // Activate desktop shell strictly inside Electron desktop runtime
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !window.desktopApp?.isDesktop) {
      return;
    }

    const html = document.documentElement;
    html.classList.add('is-desktop-app');
    setIsDesktop(true);
    setIsOnline(navigator.onLine);

    const bridge = window.desktopApp;
    const applyWinState = (next: DesktopWindowState) => {
      setWinState(next);
      html.classList.toggle('desktop-window-maximized', Boolean(next.isMaximized));
      html.classList.toggle('desktop-window-fullscreen', Boolean(next.isFullScreen));
      html.classList.toggle('desktop-window-unfocused', !next.isFocused);
    };

    bridge.getWindowState().then(applyWinState).catch(() => {});
    bridge.getEngineInfo().then(setEngineInfo).catch(() => {});
    const unsubscribe = bridge.onWindowStateChange(applyWinState);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    try {
      const saved = sessionStorage.getItem(TABS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setTabs(parsed);
      }
    } catch {
      // ignore session storage errors
    }

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentRoute = useMemo(
    () => resolveRouteInfo(pathname, currentSearch),
    [pathname, currentSearch]
  );

  // Keep clean workspace tab strip updated as user moves across modules
  useEffect(() => {
    if (!isDesktop || pathname === '/login') return;

    setTabs((prev) => {
      const exists = prev.some((t) => t.href === currentRoute.href);
      const next = exists
        ? prev.map((t) => (t.href === currentRoute.href ? currentRoute : t))
        : [...prev, currentRoute].slice(-MAX_TABS);

      try {
        sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, [isDesktop, pathname, currentRoute]);

  const closeTab = useCallback(
    (href: string, e?: React.MouseEvent | React.KeyboardEvent) => {
      e?.stopPropagation();
      e?.preventDefault();
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.href === href);
        const next = prev.filter((t) => t.href !== href);
        try {
          sessionStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        if (currentRoute.href === href && next.length > 0) {
          const target = next[Math.min(idx, next.length - 1)];
          router.push(target.href);
        }
        return next;
      });
    },
    [currentRoute.href, router]
  );

  const openCommandLauncher = useCallback(() => {
    setPaletteQuery('');
    setSelectedIdx(0);
    setPaletteOpen(true);
  }, []);

  // Global desktop keyboard launcher (Ctrl+P, plus Ctrl+K when Header search isn't present)
  useEffect(() => {
    if (!isDesktop) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPaletteOpen((open) => {
          if (!open) {
            setPaletteQuery('');
            setSelectedIdx(0);
          }
          return !open;
        });
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        const hasHeaderSearch = Boolean(document.querySelector('.header-search input'));
        if (!hasHeaderSearch) {
          e.preventDefault();
          openCommandLauncher();
        }
        return;
      }

      if (e.key === 'Escape' && paletteOpen) {
        e.preventDefault();
        setPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, paletteOpen, openCommandLauncher]);

  useEffect(() => {
    if (!paletteOpen) return;
    const id = requestAnimationFrame(() => {
      paletteInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [paletteOpen]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const bridge = typeof window !== 'undefined' ? window.desktopApp : undefined;
    const navCommands: PaletteCommand[] = user
      ? ROUTES.filter((r) => !r.roles || hasAnyRole(r.roles)).map((r) => ({
          id: `nav:${r.href}`,
          title: r.label,
          subtitle: r.group,
          category: 'Navigation',
          keywords: `${r.label} ${r.group} ${r.keywords}`,
          icon: r.icon,
          run: () => {
            setPaletteOpen(false);
            router.push(r.href);
          },
        }))
      : [];

    const fullPath = `${pathname}${currentSearch || ''}`;
    const actionCommands: PaletteCommand[] = [
      {
        id: 'act:new-window',
        title: 'Open New Desktop Window',
        subtitle: 'Open current view in a side-by-side window',
        category: 'Desktop Actions',
        keywords: 'new window multi split screen monitor',
        shortcut: 'Ctrl+Shift+N',
        icon: CopyPlus,
        run: () => {
          setPaletteOpen(false);
          bridge?.openNewWindow(fullPath);
        },
      },
      {
        id: 'act:theme',
        title: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
        subtitle: `Currently using ${theme === 'dark' ? 'Dark' : 'Light'} appearance`,
        category: 'Desktop Actions',
        keywords: 'theme dark light appearance mode',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => {
          setPaletteOpen(false);
          toggleTheme();
        },
      },
      {
        id: 'act:pin',
        title: winState.isAlwaysOnTop ? 'Unpin Window from Top' : 'Pin Window Always on Top',
        subtitle: 'Keep Canvas Order floating above other applications',
        category: 'Desktop Actions',
        keywords: 'pin always on top float overlay',
        icon: winState.isAlwaysOnTop ? PinOff : Pin,
        run: () => {
          setPaletteOpen(false);
          bridge?.setAlwaysOnTop(!winState.isAlwaysOnTop);
        },
      },
      {
        id: 'act:reload',
        title: 'Reload Active Screen',
        subtitle: 'Refresh data & re-sync workspace view',
        category: 'Desktop Actions',
        keywords: 'reload refresh sync f5',
        shortcut: 'F5',
        icon: RotateCw,
        run: () => {
          setPaletteOpen(false);
          bridge?.reload(false);
        },
      },
      {
        id: 'act:zoom-in',
        title: 'Zoom In Interface',
        subtitle: `Increase display scale (Currently ${Math.round(winState.zoomFactor * 100)}%)`,
        category: 'Desktop Actions',
        keywords: 'zoom in scale larger',
        shortcut: 'Ctrl+=',
        icon: ZoomIn,
        run: () => {
          setPaletteOpen(false);
          bridge?.adjustZoom(0.1);
        },
      },
      {
        id: 'act:zoom-out',
        title: 'Zoom Out Interface',
        subtitle: `Decrease display scale (Currently ${Math.round(winState.zoomFactor * 100)}%)`,
        category: 'Desktop Actions',
        keywords: 'zoom out scale smaller compact',
        shortcut: 'Ctrl+-',
        icon: ZoomOut,
        run: () => {
          setPaletteOpen(false);
          bridge?.adjustZoom(-0.1);
        },
      },
      {
        id: 'act:zoom-reset',
        title: 'Reset Display Scale (100%)',
        subtitle: 'Restore default desktop UI scaling',
        category: 'Desktop Actions',
        keywords: 'zoom reset default 100',
        shortcut: 'Ctrl+0',
        icon: RotateCcw,
        run: () => {
          setPaletteOpen(false);
          bridge?.setZoomFactor(1);
        },
      },
      {
        id: 'act:print',
        title: 'Print Current View',
        subtitle: 'Send active view to Windows printer or PDF',
        category: 'Desktop Actions',
        keywords: 'print pdf invoice label',
        icon: Printer,
        run: () => {
          setPaletteOpen(false);
          bridge?.printPage();
        },
      },
      {
        id: 'act:data-folder',
        title: 'Open Local Cache & Logs Folder',
        subtitle: 'Reveal desktop configuration & runtime logs in Explorer',
        category: 'Desktop Actions',
        keywords: 'folder data cache logs explorer',
        icon: FolderOpen,
        run: () => {
          setPaletteOpen(false);
          bridge?.openDataFolder();
        },
      },
      {
        id: 'act:devtools',
        title: 'Toggle Developer Inspector',
        subtitle: 'Inspect DOM, console, and network diagnostics',
        category: 'Desktop Actions',
        keywords: 'devtools console debug inspector',
        shortcut: 'F12',
        icon: Terminal,
        run: () => {
          setPaletteOpen(false);
          bridge?.toggleDevTools();
        },
      },
    ];

    return [...navCommands, ...actionCommands];
  }, [user, hasAnyRole, router, pathname, currentSearch, theme, toggleTheme, winState]);

  const filteredCommands = useMemo(() => {
    const tokens = paletteQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return commands;
    return commands.filter((cmd) => {
      const haystack = `${cmd.title} ${cmd.subtitle} ${cmd.keywords} ${cmd.category}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [commands, paletteQuery]);

  useEffect(() => {
    if (selectedIdx >= filteredCommands.length) {
      setSelectedIdx(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, selectedIdx]);

  useEffect(() => {
    if (!paletteOpen || !listRef.current) return;
    const activeEl = listRef.current.querySelector(`[data-cmd-index="${selectedIdx}"]`);
    if (activeEl && 'scrollIntoView' in activeEl) {
      (activeEl as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, paletteOpen]);

  // Zero footprint on web browsers
  if (!isDesktop) return null;

  const bridge = window.desktopApp!;
  const isAuthPage = pathname === '/login';
  const fullRoutePath = `${pathname}${currentSearch || ''}`;
  const zoomPercent = Math.round((winState.zoomFactor || 1) * 100);

  return (
    <>
      {/* ── Top Frameless Windows Native Titlebar (40px) ───────────────────── */}
      <div className="dt-titlebar" role="banner" aria-label="Window Titlebar">
        <div className="dt-left">
          <div className="dt-brand">
            {/* Crisp SVG app mark (DPI independent, zero latency) */}
            <svg
              className="dt-brand-icon"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="24" height="24" rx="6" fill="url(#dtBrandGrad)" />
              <path
                d="M7.5 12.2L10.6 15.3L16.8 8.8"
                stroke="#ffffff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <defs>
                <linearGradient id="dtBrandGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366F1" />
                  <stop offset="1" stopColor="#4F46E5" />
                </linearGradient>
              </defs>
            </svg>
            <span className="dt-brand-name">Canvas Order</span>
            <span className="dt-brand-badge">Desktop</span>
          </div>

          <span className="dt-sep" />

          <div className="dt-nav-group">
            <button
              type="button"
              className="dt-icon-btn"
              onClick={() => bridge.goBack()}
              disabled={!winState.canGoBack}
              title="Back (Alt+Left)"
              aria-label="Go Back"
            >
              <ArrowLeft size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="dt-icon-btn"
              onClick={() => bridge.goForward()}
              disabled={!winState.canGoForward}
              title="Forward (Alt+Right)"
              aria-label="Go Forward"
            >
              <ArrowRight size={14} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="dt-icon-btn"
              onClick={() => bridge.reload(false)}
              title="Reload Screen (F5)"
              aria-label="Reload Screen"
            >
              <RotateCw size={13} strokeWidth={2} />
            </button>
          </div>

          {!isAuthPage && tabs.length > 0 && (
            <>
              <span className="dt-sep" />
              <div className="dt-tabs" role="tablist" aria-label="Workspace Tabs">
                {tabs.map((tab) => {
                  const active = tab.href === currentRoute.href;
                  return (
                    <div
                      key={tab.href}
                      role="tab"
                      aria-selected={active}
                      tabIndex={0}
                      className={`dt-tab ${active ? 'active' : ''}`}
                      title={`${tab.group} — ${tab.label}`}
                      onClick={() => {
                        if (!active) router.push(tab.href);
                      }}
                      onAuxClick={(e) => {
                        if (e.button === 1 && tabs.length > 1) {
                          closeTab(tab.href, e);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!active) router.push(tab.href);
                        }
                      }}
                    >
                      <span className="dt-tab-dot" />
                      <span className="dt-tab-label">{tab.label}</span>
                      {tabs.length > 1 && (
                        <span
                          role="button"
                          aria-label={`Close ${tab.label} tab`}
                          className="dt-tab-close"
                          onClick={(e) => closeTab(tab.href, e)}
                        >
                          <X size={10} strokeWidth={2.5} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Center Draggable Strip + Quick Command Launcher */}
        <div className="dt-center">
          <button
            type="button"
            className="dt-command-pill"
            onClick={openCommandLauncher}
            title="Quick Jump & Desktop Commands (Ctrl+P)"
          >
            <span className="dt-command-pill-left">
              <Search size={12.5} strokeWidth={2.1} />
              <span className="dt-command-pill-text">
                {isAuthPage ? 'Desktop Commands...' : `${currentRoute.group} · ${currentRoute.label}`}
              </span>
            </span>
            <kbd className="dt-kbd">Ctrl+P</kbd>
          </button>
        </div>

        {/* Right Desktop Controls & Windows 11 Caption Buttons */}
        <div className="dt-right">
          <div className="dt-utils">
            <div
              className="dt-engine-pill"
              title={
                engineInfo?.port
                  ? `Local Engine Active · 127.0.0.1:${engineInfo.port} (${engineInfo.windowCount} window${engineInfo.windowCount > 1 ? 's' : ''})`
                  : 'Local Engine Active'
              }
            >
              <span className={`dt-engine-dot ${isOnline ? '' : 'offline'}`} />
              <span>{isOnline ? 'Synced' : 'Offline'}</span>
            </div>

            <button
              type="button"
              className={`dt-icon-btn ${winState.isAlwaysOnTop ? 'is-active' : ''}`}
              onClick={() => bridge.setAlwaysOnTop(!winState.isAlwaysOnTop)}
              title={winState.isAlwaysOnTop ? 'Unpin Window from Top' : 'Pin Window Always on Top'}
              aria-label="Toggle Always on Top"
            >
              {winState.isAlwaysOnTop ? <PinOff size={13.5} /> : <Pin size={13.5} />}
            </button>

            <button
              type="button"
              className="dt-icon-btn"
              onClick={() => bridge.openNewWindow(fullRoutePath)}
              title="Open New Workspace Window (Ctrl+Shift+N)"
              aria-label="Open New Window"
            >
              <CopyPlus size={13.5} />
            </button>

            {isAuthPage && (
              <button
                type="button"
                className="dt-icon-btn"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                aria-label="Toggle Theme"
              >
                {theme === 'dark' ? <Sun size={13.5} /> : <Moon size={13.5} />}
              </button>
            )}
          </div>

          <div className="dt-window-controls" aria-label="Window Controls">
            <button
              type="button"
              className="dt-win-btn"
              onClick={() => bridge.minimize()}
              aria-label="Minimize"
              title="Minimize"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.15" />
              </svg>
            </button>
            <button
              type="button"
              className="dt-win-btn"
              onClick={() => bridge.toggleMaximize()}
              aria-label={winState.isMaximized ? 'Restore' : 'Maximize'}
              title={winState.isMaximized ? 'Restore Down' : 'Maximize'}
            >
              {winState.isMaximized ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path
                    d="M3 3V1.5H8.5V7H7M1.5 3H7V8.5H1.5V3Z"
                    stroke="currentColor"
                    strokeWidth="1.05"
                  />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <rect x="1.5" y="1.5" width="7" height="7" stroke="currentColor" strokeWidth="1.05" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="dt-win-btn close"
              onClick={() => bridge.close()}
              aria-label="Close"
              title="Close Window"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <line x1="1.5" y1="1.5" x2="8.5" y2="8.5" stroke="currentColor" strokeWidth="1.15" />
                <line x1="8.5" y1="1.5" x2="1.5" y2="8.5" stroke="currentColor" strokeWidth="1.15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Bottom Native Status Bar (24px) ────────────────────────────────── */}
      <footer className="dt-statusbar" aria-label="Application Status Bar">
        <div className="dt-status-group">
          <span className="dt-status-item">
            <span className={`dt-engine-dot ${isOnline ? '' : 'offline'}`} />
            <span>{isOnline ? 'Local Engine · Connected' : 'Offline Mode'}</span>
          </span>

          <span className="dt-status-divider" />

          <span className="dt-status-item">
            {currentRoute.group} / <strong style={{ color: 'var(--dt-chrome-text)', fontWeight: 600 }}>{currentRoute.label}</strong>
          </span>

          <span className="dt-status-divider" />

          <div className="dt-zoom-box" title="Interface Scale (Ctrl+= / Ctrl+- / Ctrl+0)">
            <button
              type="button"
              className="dt-zoom-btn"
              onClick={() => bridge.adjustZoom(-0.1)}
              aria-label="Zoom Out"
            >
              -
            </button>
            <button
              type="button"
              className="dt-zoom-value"
              onClick={() => bridge.setZoomFactor(1)}
              title="Click to reset zoom to 100%"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              className="dt-zoom-btn"
              onClick={() => bridge.adjustZoom(0.1)}
              aria-label="Zoom In"
            >
              +
            </button>
          </div>
        </div>

        <div className="dt-status-group">
          <div className="dt-shortcuts-hint">
            <span>Ctrl+P Quick Jump</span>
            <span>·</span>
            <span>Ctrl+K Search</span>
            <span>·</span>
            <span>Ctrl+Shift+N New Window</span>
            <span>·</span>
            <span>F5 Refresh</span>
          </div>

          {winState.isAlwaysOnTop && (
            <button
              type="button"
              className="dt-status-btn pinned"
              onClick={() => bridge.setAlwaysOnTop(false)}
              title="Click to unpin window"
            >
              <Pin size={10.5} />
              <span>Pinned</span>
            </button>
          )}

          <span className="dt-status-divider" />

          <button
            type="button"
            className="dt-status-btn"
            onClick={() => bridge.openDataFolder()}
            title="Open Local Cache & Logs Folder"
          >
            <FolderOpen size={11} />
            <span>Data Folder</span>
          </button>

          <span className="dt-status-item">v{engineInfo?.version || '1.0.0'}</span>
        </div>
      </footer>

      {/* ── Command Palette Overlay (Ctrl+P) ───────────────────────────────── */}
      {paletteOpen && (
        <div
          className="dt-palette-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPaletteOpen(false);
          }}
        >
          <div
            className="dt-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Quick Switcher & Desktop Commands"
          >
            <div className="dt-palette-header">
              <Search size={15} style={{ color: 'var(--dt-chrome-subtle)', flexShrink: 0 }} />
              <input
                ref={paletteInputRef}
                type="text"
                className="dt-palette-input"
                placeholder="Jump to module or run a desktop command..."
                value={paletteQuery}
                onChange={(e) => {
                  setPaletteQuery(e.target.value);
                  setSelectedIdx(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIdx((i) => Math.min(filteredCommands.length - 1, i + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIdx((i) => Math.max(0, i - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const chosen = filteredCommands[selectedIdx];
                    if (chosen) chosen.run();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setPaletteOpen(false);
                  }
                }}
              />
              <kbd className="dt-kbd">Esc</kbd>
            </div>

            <div className="dt-palette-list" ref={listRef}>
              {filteredCommands.length === 0 ? (
                <div
                  style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    color: 'var(--dt-chrome-muted)',
                    fontSize: '12.5px',
                  }}
                >
                  No modules or desktop commands match &ldquo;{paletteQuery}&rdquo;
                </div>
              ) : (
                filteredCommands.map((cmd, idx) => {
                  const Icon = cmd.icon;
                  const prevCat = idx > 0 ? filteredCommands[idx - 1].category : null;
                  const showGroup = cmd.category !== prevCat;
                  const isSelected = idx === selectedIdx;

                  return (
                    <React.Fragment key={cmd.id}>
                      {showGroup && <div className="dt-palette-group">{cmd.category}</div>}
                      <button
                        type="button"
                        data-cmd-index={idx}
                        className={`dt-palette-item ${isSelected ? 'selected' : ''}`}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        onClick={() => cmd.run()}
                      >
                        <div className="dt-palette-item-left">
                          <span className="dt-palette-item-icon">
                            <Icon size={13.5} strokeWidth={2} />
                          </span>
                          <div>
                            <div className="dt-palette-item-title">{cmd.title}</div>
                            <div className="dt-palette-item-sub">{cmd.subtitle}</div>
                          </div>
                        </div>
                        {cmd.shortcut ? (
                          <kbd className="dt-kbd">{cmd.shortcut}</kbd>
                        ) : (
                          isSelected && <CornerDownLeft size={13} style={{ color: 'var(--dt-accent)' }} />
                        )}
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="dt-palette-footer">
              <span>↑↓ Navigate · ↵ Open · Esc Close</span>
              <span>Canvas Order Desktop</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
