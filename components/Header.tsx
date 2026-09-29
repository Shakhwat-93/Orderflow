'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Search,
  User as UserIcon,
  LogOut,
  Settings,
  Menu,
  Package,
  Info,
  Edit2,
  Truck,
  Trash2,
  Users,
  AlertOctagon,
  X,
  Loader2,
  ChevronRight,
  Command,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { PresenceStack } from '@/components/PresenceStack';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import { SmoothCaretInput } from '@/components/ui/smooth-caret-input';
import CurrencyIcon from '@/components/CurrencyIcon';
import { createClient } from '@/lib/supabase/client';

interface HeaderProps {
  onMenuToggle?: () => void;
  isSidebarOpen?: boolean;
}

interface NotificationItem {
  id: string | number;
  type: string;
  title: string;
  message: string;
  is_read?: boolean;
  created_at: string;
  actor_name?: string;
  data?: { newStatus?: string };
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const { profile, userRoles, isAdmin, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileSearch, setIsMobileSearch] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobileSearch(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ orders: any[]; users: any[] }>({
    orders: [],
    users: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  // Notifications State
  const [activeNotifTab, setActiveNotifTab] = useState<'Today' | 'This Week' | 'Earlier'>('Today');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = searchRef.current?.querySelector('input');
        if (searchInput) {
          searchInput.focus();
          setIsSearchDropdownOpen(true);
        }
      }
      if (e.key === 'Escape') {
        setIsSearchDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Real-time Search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ orders: [], users: [] });
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const searchTerm = `%${searchQuery}%`;

        const { data: orders } = await supabase
          .from('orders')
          .select('id, customer_name, phone, amount, status, product_name')
          .or(
            `customer_name.ilike.${searchTerm},phone.ilike.${searchTerm},product_name.ilike.${searchTerm}`
          )
          .order('created_at', { ascending: false })
          .limit(5);

        let users: any[] = [];
        if (isAdmin) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, name, email')
            .or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
            .limit(3);
          users = userData || [];
        }

        setSearchResults({ orders: orders || [], users });
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const delay = setTimeout(performSearch, 300);
    return () => clearTimeout(delay);
  }, [searchQuery, isAdmin, supabase]);

  // Load Notifications
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (data) {
          setNotifications(data as NotificationItem[]);
          setUnreadCount(data.filter((n: NotificationItem) => !n.is_read).length);
        }
      } catch (err) {
        console.warn('Could not load notifications:', err);
      }
    };

    loadNotifications();
  }, [supabase]);

  const filterNotifs = (allNotifs: NotificationItem[], tab: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return allNotifs.filter((n) => {
      const d = new Date(n.created_at);
      if (tab === 'Today') return d >= today;
      if (tab === 'This Week') return d < today && d >= weekAgo;
      if (tab === 'Earlier') return d < weekAgo;
      return true;
    });
  };

  const filteredNotifs = filterNotifs(notifications, activeNotifTab);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'ORDER_CREATED':
        return <Package size={16} />;
      case 'STATUS_CHANGE':
        return <Info size={16} />;
      case 'ORDER_UPDATED':
        return <Edit2 size={16} />;
      case 'TRACKING_ADDED':
        return <Truck size={16} />;
      case 'ORDER_DELETED':
        return <Trash2 size={16} />;
      case 'LOW_STOCK':
        return <AlertOctagon size={16} />;
      case 'TASK_ASSIGNED':
        return <Users size={16} />;
      default:
        return <Bell size={16} />;
    }
  };

  const getNotifTone = (notif: NotificationItem) => {
    const type = String(notif?.type || '').toUpperCase();
    const nextStatus = String(notif?.data?.newStatus || '').toLowerCase();

    if (type === 'STATUS_CHANGE') {
      if (nextStatus.includes('confirm')) return 'success';
      if (nextStatus.includes('cancel')) return 'danger';
      if (nextStatus.includes('pending')) return 'warning';
      if (nextStatus.includes('courier')) return 'info';
      return 'primary';
    }
    if (type === 'ORDER_CREATED') return 'primary';
    if (type === 'ORDER_UPDATED') return 'info';
    if (type === 'ORDER_DELETED') return 'danger';
    if (type === 'LOW_STOCK') return 'warning';
    return 'primary';
  };

  const markAllAsRead = async () => {
    try {
      await supabase.from('notifications').update({ is_read: true }).eq('is_read', false);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const clearAllNotifications = async () => {
    try {
      await supabase.from('notifications').delete().neq('id', 0);
      setNotifications([]);
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to clear notifications:', err);
    }
  };

  const primaryRole = userRoles[0] || 'User';
  const isOverviewPage = pathname === '/';

  return (
    <header className={`header ${isOverviewPage ? 'mobile-overview-header' : ''}`}>
      {/* ── Mobile Menu Toggle ── */}
      {onMenuToggle && (
        <button
          className="mobile-menu-toggle"
          onClick={onMenuToggle}
          aria-label="Open navigation menu"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      )}

      {/* 🔍 Elite Search Hub */}
      <div className={`header-search ${isSearchDropdownOpen ? 'active' : ''}`} ref={searchRef}>
        <Search className="header-search-icon" size={18} />
        <SmoothCaretInput
          type="text"
          placeholder={isMobileSearch ? 'Search...' : 'Search orders, customers, phone...'}
          className="search-input"
          wrapperClassName="w-full"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsSearchDropdownOpen(true);
          }}
          onFocus={() => setIsSearchDropdownOpen(true)}
        />
        <span className="search-shortcut hidden md:inline-block">⌘K</span>
        {isSearching && <Loader2 className="search-spinner-inline" size={16} />}

        {isSearchDropdownOpen && searchQuery.trim() && (
          <div className="search-results-dropdown-elite">
            {searchResults.orders.length > 0 && (
              <div className="search-result-group-elite">
                <div className="group-label-elite">
                  <Package size={12} /> <span>Orders</span>
                </div>
                {searchResults.orders.map((order) => (
                  <div
                    key={order.id}
                    className="search-item-elite"
                    onClick={() => {
                      router.push(`/orders?viewOrder=${order.id}`);
                      setIsSearchDropdownOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <div className="item-icon-box-elite">
                      <Package size={14} />
                    </div>
                    <div className="item-info-elite">
                      <div className="item-title-elite">
                        {order.customer_name} <span className="item-id-elite">#{order.id}</span>
                      </div>
                      <div className="item-sub-elite">
                        {order.product_name} • <CurrencyIcon size={10} />
                        {order.amount}
                      </div>
                    </div>
                    <ChevronRight className="item-arrow-elite" size={14} />
                  </div>
                ))}
              </div>
            )}

            {searchResults.users.length > 0 && (
              <div className="search-result-group-elite">
                <div className="group-label-elite">
                  <Users size={12} /> <span>Staff</span>
                </div>
                {searchResults.users.map((u) => (
                  <div
                    key={u.id}
                    className="search-item-elite"
                    onClick={() => {
                      router.push(`/users?viewUser=${u.id}`);
                      setIsSearchDropdownOpen(false);
                      setSearchQuery('');
                    }}
                  >
                    <div className="item-icon-box-elite accent">
                      <Users size={14} />
                    </div>
                    <div className="item-info-elite">
                      <div className="item-title-elite">{u.name}</div>
                      <div className="item-sub-elite">{u.email}</div>
                    </div>
                    <ChevronRight className="item-arrow-elite" size={14} />
                  </div>
                ))}
              </div>
            )}

            {!isSearching &&
              searchResults.orders.length === 0 &&
              searchResults.users.length === 0 && (
                <div className="search-no-results-elite">
                  <Command size={24} strokeWidth={1} />
                  <p>No results found for &ldquo;{searchQuery}&rdquo;</p>
                </div>
              )}

            <div className="search-footer-elite">
              <span>
                Press <kbd>Esc</kbd> to close
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="header-spacer" />

      {/* Presence Stack */}
      <div className={isOverviewPage ? 'presence-wrap' : 'presence-wrap desktop-only'}>
        <PresenceStack />
      </div>

      {/* Action Icons */}
      <div className="header-actions">
        {/* Theme Toggle */}
        <AnimatedThemeToggler
          className="icon-badge-btn theme-toggle-btn"
          theme={theme === 'dark' ? 'dark' : 'light'}
          onThemeChange={setTheme}
          variant="circle"
          duration={400}
          fromCenter={false}
          iconSize={18}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label="Toggle theme"
        />

        {/* Notifications Dropdown */}
        <div className="notifications-dropdown-container" ref={notifRef}>
          <button
            className="icon-badge-btn"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            aria-label="Notifications"
          >
            <Bell size={20} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {isNotifOpen && (
            <div className="notifications-panel-standard">
              <div className="panel-header-standard">
                <h3>Notifications</h3>
                <div className="header-actions-group">
                  <button className="see-all-btn" onClick={() => setIsNotifOpen(false)}>
                    See All
                  </button>
                  <button
                    className="clear-all-btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearAllNotifications();
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="notif-tabs-container">
                {(['Today', 'This Week', 'Earlier'] as const).map((tab) => (
                  <button
                    key={tab}
                    className={`notif-tab ${activeNotifTab === tab ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveNotifTab(tab);
                    }}
                  >
                    {tab}
                    {activeNotifTab === tab && notifications.length > 0 && (
                      <span className="tab-count">
                        {filterNotifs(notifications, tab).length}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="notifications-list-standard">
                {filteredNotifs.length > 0 ? (
                  filteredNotifs.map((notif) => (
                    <div
                      key={notif.id}
                      className={`notif-item-standard notif-tone-${getNotifTone(notif)} ${
                        notif.is_read ? '' : 'unread'
                      }`}
                      onClick={() => {
                        supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
                        setNotifications((prev) =>
                          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
                        );
                        setUnreadCount((c) => Math.max(0, c - 1));
                        setIsNotifOpen(false);
                        router.push(notif.type.startsWith('TASK_') ? '/tasks' : '/orders');
                      }}
                    >
                      <div
                        className={`notif-circular-icon notif-tone-${getNotifTone(
                          notif
                        )} ${notif.type.toLowerCase().split('_')[0]}`}
                      >
                        {getNotifIcon(notif.type)}
                      </div>

                      <div className="notif-content-standard">
                        <div className="notif-title-row">
                          <div className="notif-title-group">
                            {!notif.is_read && <span className="notif-status-dot" />}
                            <span className="notif-title-text">{notif.title}</span>
                          </div>
                          <span className="notif-time-standard">
                            {formatTime(notif.created_at)}
                          </span>
                        </div>
                        <p className="notif-message-standard">{notif.message}</p>
                        {notif.actor_name && (
                          <div className="notif-actor-standard">By {notif.actor_name}</div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-notifications-standard">
                    <Bell size={24} />
                    <p>All caught up in {activeNotifTab}!</p>
                  </div>
                )}
              </div>

              <div className="panel-footer-standard flex items-center justify-between">
                <button
                  className="text-xs text-blue-600 hover:underline font-semibold"
                  onClick={markAllAsRead}
                >
                  Mark all as read
                </button>
                <Link href="/settings" onClick={() => setIsNotifOpen(false)}>
                  System Settings
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar & Dropdown */}
        <div className="profile-actions-row">
          <div className="user-dropdown-container" ref={dropdownRef}>
            <div
              className="user-profile-trigger-premium"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              <div className="avatar-ring">
                <div className="avatar-premium">
                  {profile?.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt="Profile"
                      width={38}
                      height={38}
                      className="rounded-full object-cover"
                      unoptimized
                    />
                  ) : (
                    profile?.name?.substring(0, 2)?.toUpperCase() || 'U'
                  )}
                </div>
              </div>
            </div>

            {isDropdownOpen && (
              <div className="premium-dropdown">
                <div className="dropdown-user-header">
                  <div className="dropdown-user-name">{profile?.name || 'User'}</div>
                  <div className="dropdown-user-role">{primaryRole}</div>
                </div>

                <Link
                  href="/profile"
                  className="dropdown-item"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <UserIcon size={17} /> <span>Profile</span>
                </Link>
                <Link
                  href="/settings"
                  className="dropdown-item"
                  onClick={() => setIsDropdownOpen(false)}
                >
                  <Settings size={17} /> <span>Settings</span>
                </Link>
                <div className="dropdown-divider-light" />
                <button className="dropdown-item logout" onClick={() => signOut()}>
                  <LogOut size={17} /> <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
