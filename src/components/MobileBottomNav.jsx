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
  Download,
  Share2,
  PlusSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import { usePwaInstall } from '../context/PwaInstallContext';
import { isNativeApp } from '../platform/runtime';
import { Button } from './Button';
import { Modal } from './Modal';
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
  const [isInstallHelpOpen, setIsInstallHelpOpen] = useState(false);
  const { canInstall, canManualInstall, installMethod, isInstalled, promptInstall } = usePwaInstall();
  const showInstallAction = !isNativeApp();

  const allItems = [
    { path: '/',                label: 'Overview',   icon: LayoutDashboard, roles: null },
    { path: '/orders',          label: 'Orders',     icon: ShoppingCart,    roles: null },
    { path: '/call-team',       label: 'Calls',      icon: Headphones,      roles: ['Admin', 'Call Team'] },
    { path: '/moderator',       label: 'Moderator',  icon: ShieldCheck,     roles: ['Admin', 'Moderator'] },
    { path: '/courier',         label: 'Courier',    icon: Truck,           roles: ['Admin', 'Courier Team'] },
    { path: '/steadfast',       label: 'Steadfast',  icon: Truck,           roles: ['Admin', 'Courier Team', 'Moderator'] },
    { path: '/factory',         label: 'Confirmed',  icon: Factory,         roles: ['Admin', 'Factory Team'] },
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

  const handleInstallClick = async () => {
    if (isInstalled) {
      return;
    }

    if (installMethod === 'manual-ios') {
      setIsInstallHelpOpen(true);
      return;
    }

    if (!canInstall) {
      return;
    }

    await promptInstall();
    setIsMoreOpen(false);
  };

  // Show first 4 items in bar, rest in "More" sheet
  const primaryItems = visibleItems.slice(0, 4);
  const overflowItems = visibleItems.slice(4);
  const hasOverflow = overflowItems.length > 0;

  const isActive = (path) => location.pathname === path;
  const isOverflowActive = overflowItems.some(item => isActive(item.path));

  useEffect(() => {
    const handleBackButton = (event) => {
      if (isMoreOpen) {
        event.preventDefault();
        setIsMoreOpen(false);
      }
    };

    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [isMoreOpen]);

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
            <div className={`mob-more-grid ${showInstallAction ? 'has-install' : ''}`}>
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
              {showInstallAction ? (
                <button
                  type="button"
                  className={`mob-more-item mob-more-install ${(canInstall || canManualInstall) ? 'install-ready' : ''} ${isInstalled ? 'is-installed' : ''}`}
                  onClick={handleInstallClick}
                  disabled={!canInstall && !canManualInstall}
                  title={isInstalled ? 'App installed' : canManualInstall ? 'Install app on iPhone' : canInstall ? 'Install app' : 'Install not available yet'}
                >
                  <div className="mob-more-icon-box mob-more-icon-box-install">
                    <Download size={20} strokeWidth={2.2} />
                  </div>
                  <span>{isInstalled ? 'Installed' : 'Install App'}</span>
                </button>
              ) : null}
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={isInstallHelpOpen}
        onClose={() => setIsInstallHelpOpen(false)}
        title="Install on iPhone"
        subtitle="Use Safari's share menu to add this app to your Home Screen."
      >
        <div className="ios-install-guide">
          <div className="ios-install-guide__hero">
            <div className="ios-install-guide__hero-icon">
              <Download size={22} strokeWidth={2.2} />
            </div>
            <div>
              <strong>Manual PWA install</strong>
              <p>This works on iPhone even when the browser does not show a direct install prompt.</p>
            </div>
          </div>

          <ol className="ios-install-guide__steps">
            <li>
              <span className="ios-install-guide__step-icon"><Share2 size={16} /></span>
              <div>
                <strong>Tap the Share button</strong>
                <p>Use Safari's bottom toolbar and open the share sheet.</p>
              </div>
            </li>
            <li>
              <span className="ios-install-guide__step-icon"><PlusSquare size={16} /></span>
              <div>
                <strong>Select “Add to Home Screen”</strong>
                <p>Scroll the actions list if the option is lower in the sheet.</p>
              </div>
            </li>
            <li>
              <span className="ios-install-guide__step-icon"><Download size={16} /></span>
              <div>
                <strong>Tap “Add”</strong>
                <p>The app will appear on the Home Screen and run as an installed app.</p>
              </div>
            </li>
          </ol>

          <div className="ios-install-guide__footer">
            <Button variant="primary" onClick={() => setIsInstallHelpOpen(false)}>
              Understood
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
