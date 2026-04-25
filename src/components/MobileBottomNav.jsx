import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Headphones,
  Truck,
  Megaphone,
  ClipboardList,
  BarChart3,
  ShieldCheck,
  Package,
  Factory,
  Users,
  MoreHorizontal,
  Download
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import './MobileBottomNav.css';

/**
 * MobileBottomNav — Fixed bottom navigation bar for mobile screens.
 * Shows the most relevant routes based on user role.
 * Always shows max 5 tabs (overflow handled by a "More" sheet).
 */
export const MobileBottomNav = () => {
  const { hasAnyRole } = useAuth();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const allItems = [
    { path: '/',                label: 'Overview',   icon: LayoutDashboard, roles: null },
    { path: '/orders',          label: 'Orders',     icon: ShoppingCart,    roles: null },
    { path: '/call-team',       label: 'Calls',      icon: Headphones,      roles: ['Admin', 'Call Team'] },
    { path: '/moderator',       label: 'Moderator',  icon: ShieldCheck,     roles: ['Admin', 'Moderator'] },
    { path: '/courier',         label: 'Courier',    icon: Truck,           roles: ['Admin', 'Courier Team'] },
    { path: '/steadfast',       label: 'Steadfast',  icon: Truck,           roles: ['Admin', 'Courier Team', 'Moderator'] },
    { path: '/factory',         label: 'Factory',    icon: Factory,         roles: ['Admin', 'Factory Team'] },
    { path: '/inventory',       label: 'Inventory',  icon: Package,         roles: ['Admin', 'Moderator'] },
    { path: '/digital-marketer',label: 'Marketing',  icon: Megaphone,       roles: ['Admin', 'Digital Marketer'] },
    { path: '/tasks',           label: 'Tasks',      icon: ClipboardList,   roles: null },
    { path: '/reports',         label: 'Analytics',  icon: BarChart3,       roles: ['Admin'] },
    { path: '/users',           label: 'Users',      icon: Users,           roles: ['Admin'] },
  ];

  // Filter by role
  const visibleItems = allItems.filter(item =>
    !item.roles || hasAnyRole(item.roles)
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const standaloneMedia = window.matchMedia?.('(display-mode: standalone)');
    const updateInstalledState = () => {
      const standalone = standaloneMedia?.matches || window.navigator.standalone === true;
      setIsInstalled(Boolean(standalone));
    };

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      updateInstalledState();
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
      setIsMoreOpen(false);
    };

    updateInstalledState();

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    standaloneMedia?.addEventListener?.('change', updateInstalledState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      standaloneMedia?.removeEventListener?.('change', updateInstalledState);
    };
  }, []);

  const canInstallPwa = Boolean(installPromptEvent) && !isInstalled;

  const handleInstallClick = async () => {
    if (!installPromptEvent) {
      return;
    }

    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
    } finally {
      setInstallPromptEvent(null);
      setIsMoreOpen(false);
    }
  };

  // Show first 4 items in bar, rest in "More" sheet
  const primaryItems = visibleItems.slice(0, 4);
  const overflowItems = visibleItems.slice(4);
  const hasOverflow = overflowItems.length > 0;

  const isActive = (path) => location.pathname === path;
  const isOverflowActive = overflowItems.some(item => isActive(item.path));

  return (
    <>
      {/* ── Bottom Nav Bar ── */}
      <nav className="mobile-bottom-nav">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mob-nav-item ${active ? 'active' : ''}`}
              onClick={() => setIsMoreOpen(false)}
            >
              <div className="mob-nav-icon-wrap">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {active && <span className="mob-nav-pip" />}
              </div>
              <span className="mob-nav-label">{item.label}</span>
            </Link>
          );
        })}

        {hasOverflow && (
          <button
            className={`mob-nav-item ${isOverflowActive ? 'active' : ''} ${isMoreOpen ? 'more-open' : ''}`}
            onClick={() => setIsMoreOpen(prev => !prev)}
          >
            <div className="mob-nav-icon-wrap">
              <MoreHorizontal size={22} strokeWidth={isOverflowActive ? 2.5 : 1.8} />
              {isOverflowActive && <span className="mob-nav-pip" />}
            </div>
            <span className="mob-nav-label">More</span>
          </button>
        )}
      </nav>

      {/* ── More Sheet Overlay ── */}
      {isMoreOpen && (
        <>
          <div
            className="mob-more-overlay"
            onClick={() => setIsMoreOpen(false)}
          />
          <div className="mob-more-sheet">
            <div className="mob-more-handle" />
            <p className="mob-more-title">More Sections</p>
            <div className="mob-more-grid has-install">
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`mob-more-item ${active ? 'active' : ''}`}
                    onClick={() => setIsMoreOpen(false)}
                  >
                    <div className="mob-more-icon-box">
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                className={`mob-more-item mob-more-install ${canInstallPwa ? 'install-ready' : ''} ${isInstalled ? 'is-installed' : ''}`}
                onClick={handleInstallClick}
                disabled={!canInstallPwa}
                title={isInstalled ? 'App installed' : canInstallPwa ? 'Install app' : 'Install not available yet'}
              >
                <div className="mob-more-icon-box mob-more-icon-box-install">
                  <Download size={20} strokeWidth={2.2} />
                </div>
                <span>{isInstalled ? 'Installed' : 'Install App'}</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};
