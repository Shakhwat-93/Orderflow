'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  ShieldCheck,
  Headphones,
  Truck,
  Factory,
  BarChart3,
  TrendingUp,
  LogOut,
  Users,
  Package,
  ClipboardList,
  Megaphone,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  X,
  DatabaseBackup,
  CreditCard,
  LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { UserRole } from '@/types';

interface MenuItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: 'Main Console' | 'Logistics' | 'Intelligence' | 'System';
  roles?: UserRole[];
  badge?: string | number;
  children?: Array<{
    path: string;
    label: string;
    status?: string;
    tone?: string;
    badge?: string | number;
  }>;
}

const menuItems: MenuItem[] = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, group: 'Main Console' },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList, group: 'Main Console' },
  {
    path: '/orders',
    label: 'Orders',
    icon: ShoppingCart,
    group: 'Main Console',
    children: [
      { path: '/orders?status=All', label: 'All Orders', status: 'All', tone: 'all' },
      { path: '/orders?status=Pending%20Call', label: 'Pending Call', status: 'Pending Call', tone: 'pending' },
      { path: '/orders?status=Final%20Call%20Pending', label: 'Final Call', status: 'Final Call Pending', tone: 'final' },
      { path: '/orders?status=Confirmed', label: 'Confirmed', status: 'Confirmed', tone: 'confirmed' },
      { path: '/orders?status=Cancelled', label: 'Cancelled', status: 'Cancelled', tone: 'cancelled' },
      { path: '/orders?status=Fake%20Order', label: 'Fake Order', status: 'Fake Order', tone: 'fake' },
      { path: '/orders?status=Incomplete', label: 'Incomplete Orders', status: 'Incomplete', tone: 'incomplete' },
    ],
  },
  { path: '/payments', label: 'Payments', icon: CreditCard, group: 'Main Console' },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['Admin', 'Moderator'], group: 'Main Console' },
  { path: '/factory', label: 'Confirmed', icon: Factory, roles: ['Admin', 'Factory Team'], group: 'Logistics' },
  { path: '/courier', label: 'Bulk Exported', icon: Truck, roles: ['Admin', 'Courier Team', 'Factory Team'], group: 'Logistics' },
  { path: '/steadfast', label: 'Steadfast Hub', icon: Truck, roles: ['Admin', 'Courier Team', 'Moderator'], group: 'Logistics' },
  { path: '/moderator', label: 'Moderator', icon: ShieldCheck, roles: ['Admin', 'Moderator'], group: 'Intelligence' },
  { path: '/call-team', label: 'Call Team', icon: Headphones, roles: ['Admin', 'Call Team'], group: 'Intelligence' },
  { path: '/users', label: 'Users', icon: Users, roles: ['Admin'], group: 'Intelligence' },
  { path: '/fraud', label: 'Fraud', icon: ShieldAlert, roles: ['Admin'], group: 'Intelligence' },
  { path: '/reports', label: 'Analytics', icon: BarChart3, roles: ['Admin'], group: 'System' },
  { path: '/sales-report', label: 'Sales Report', icon: TrendingUp, roles: ['Admin', 'Moderator', 'Call Team'], group: 'System' },
  {
    path: '/digital-marketer',
    label: 'Marketing',
    icon: Megaphone,
    roles: ['Admin', 'Digital Marketer'],
    group: 'System',
    children: [
      { path: '/digital-marketer', label: 'Campaigns' },
      { path: '/digital-marketer/content-planning', label: 'Content Planning' },
      { path: '/digital-marketer/finance-planning', label: 'Finance Plan' },
    ],
  },
  { path: '/backup', label: 'Backup', icon: DatabaseBackup, roles: ['Admin'], group: 'System' },
];

const GROUP_ORDER: Array<'Main Console' | 'Logistics' | 'Intelligence' | 'System'> = [
  'Main Console',
  'Logistics',
  'Intelligence',
  'System',
];

interface SidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hasAnyRole, signOut, profile, user, userRoles } = useAuth();
  const { theme, setTheme } = useTheme();

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => ({
    orders: pathname === '/orders',
    marketing: pathname.startsWith('/digital-marketer'),
  }));

  const primaryRole = userRoles?.[0] || 'Team Member';
  const displayName = profile?.name || user?.email?.split('@')[0] || 'User';
  const currentStatus = searchParams?.get('status') || '';

  const handleMobileClose = () => {
    if (!onClose) return;
    // Defer closing slightly so touch event and Next.js transition dispatch before unmounting/transforming
    setTimeout(onClose, 50);
  };

  const filteredItems = menuItems.filter((item) => !item.roles || hasAnyRole(item.roles));

  const groupedItems = GROUP_ORDER.map((group) => ({
    group,
    items: filteredItems.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Application Sidebar">
      {/* ── Brand Section ── */}
      <div className="sidebar-header">
        <Link href="/" className="sidebar-logo-container" onClick={handleMobileClose} aria-label="Go to Home">
          <Image
            src="/orderflow-logo.png"
            alt="OrderFlow"
            width={124}
            height={32}
            className="sidebar-logo-img"
            priority
          />
        </Link>

        <div className="sidebar-header-actions">
          <AnimatedThemeToggler
            className="theme-toggle"
            theme={theme === 'dark' ? 'dark' : 'light'}
            onThemeChange={setTheme}
            variant="circle"
            duration={400}
            fromCenter={false}
            iconSize={15}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label="Toggle theme"
          />
          {onClose && (
            <button className="sidebar-close" onClick={onClose} aria-label="Close sidebar">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* ── Scrollable Navigation Groups ── */}
      <nav className="sidebar-nav">
        {groupedItems.map(({ group, items }) => (
          <div key={group} className="nav-group">
            <div className="nav-section-header">
              <span className="nav-section-label">{group}</span>
            </div>

            {items.map((item) => {
              const Icon = item.icon;
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const isActive = hasChildren
                ? pathname.startsWith(item.path)
                : pathname === item.path;
              const isMenuOpen = hasChildren && !!openMenus[item.label.toLowerCase()];

              return (
                <div key={item.path} className={`nav-item-shell ${hasChildren ? 'has-submenu' : ''}`}>
                  <Link
                    prefetch={true}
                    href={item.path}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      if (hasChildren) {
                        setOpenMenus((prev) => ({
                          ...prev,
                          [item.label.toLowerCase()]: true,
                        }));
                      }
                      handleMobileClose();
                    }}
                  >
                    {isActive && <span className="nav-active-pip" />}
                    <Icon className="nav-icon" size={16} />
                    <span className="nav-label">{item.label}</span>

                    {item.badge !== undefined && (
                      <span className="nav-item-badge">{item.badge}</span>
                    )}

                    {hasChildren ? (
                      <button
                        type="button"
                        className="nav-submenu-toggle-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenMenus((prev) => ({
                            ...prev,
                            [item.label.toLowerCase()]: !prev[item.label.toLowerCase()],
                          }));
                        }}
                        aria-label={`Toggle ${item.label} submenu`}
                      >
                        <ChevronDown
                          className={`nav-submenu-chevron ${isMenuOpen ? 'open' : ''}`}
                          size={13}
                        />
                      </button>
                    ) : (
                      isActive && <ChevronRight className="nav-active-chevron" size={14} />
                    )}
                  </Link>

                  {/* Dropdown Children */}
                  {hasChildren && isMenuOpen && (
                    <div className="nav-submenu">
                      {item.children?.map((child) => {
                        const isChildActive = child.status
                          ? pathname === item.path &&
                            (currentStatus === child.status || (!currentStatus && child.status === 'All'))
                          : pathname === child.path;

                        return (
                          <Link
                            prefetch={true}
                            key={child.status || child.path}
                            href={child.path}
                            className={`nav-subitem ${isChildActive ? 'active' : ''} ${
                              child.tone ? `tone-${child.tone}` : ''
                            }`}
                            onClick={handleMobileClose}
                          >
                            <span className="nav-subitem-dot" />
                            <span>{child.label}</span>
                            {child.badge !== undefined && (
                              <span className="nav-subitem-badge">{child.badge}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Footer / User Profile & Sign Out ── */}
      <div className="sidebar-footer">
        <Link href="/profile" className="sidebar-profile-card" onClick={handleMobileClose} title="View Profile">
          <div className="sidebar-profile-avatar">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt={displayName}
                width={28}
                height={28}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              displayName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="sidebar-profile-meta">
            <strong>{displayName}</strong>
            <span className="sidebar-profile-role-text">{primaryRole}</span>
          </div>
        </Link>

        <button className="logout-btn" onClick={() => signOut()} aria-label="Sign out of OrderFlow">
          <LogOut className="nav-icon" size={15} />
          <span className="nav-label">Sign out</span>
        </button>
      </div>
    </aside>
  );
};

Sidebar.displayName = 'Sidebar';
