import { Bell, Search, User as UserIcon, LogOut, Settings, ChevronDown, Menu, Package, Info, AlertOctagon, Edit2, Truck, Trash2, Users, CreditCard, X, Loader2, ChevronRight, Command } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import './Header.css';
import './NotificationCenter.css';
import { Badge } from './Badge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { PresenceStack } from './PresenceStack';
import { supabase } from '../lib/supabase';
import { useDesktopExperience } from '../hooks/useDesktopExperience';
import CurrencyIcon from './CurrencyIcon';

export const Header = ({ onMenuToggle }) => {
  const isDesktopExperience = useDesktopExperience();
  const { profile, userRoles, isAdmin, signOut } = useAuth();
  const {
    notifications,
    toasts,
    startupUnreadNotifications,
    isStartupUnreadModalOpen,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAllNotifications,
    closeStartupUnreadModal
  } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  
  // 🔍 Elite Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ orders: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  
  const [activeTab, setActiveTab] = useState('Today');
  const previousToastCountRef = useRef(toasts.length);

  const filterNotifs = (allNotifs, tab) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return allNotifs.filter(n => {
      const d = new Date(n.created_at);
      if (tab === 'Today') return d >= today;
      if (tab === 'This Week') return d < today && d >= weekAgo;
      if (tab === 'Earlier') return d < weekAgo;
      return true;
    });
  };

  const filteredNotifs = filterNotifs(notifications, activeTab);

  const dropdownRef = useRef(null);
  const notifRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    if (toasts.length <= previousToastCountRef.current) {
      previousToastCountRef.current = toasts.length;
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(18);
    }

    try {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.015, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.12);
        oscillator.onended = () => {
          audioContext.close().catch(() => {});
        };
      }
    } catch (error) {
      console.debug('Notification feedback unavailable', error);
    }

    previousToastCountRef.current = toasts.length;
  }, [toasts.length]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ⌨️ Keyboard Shortcuts (Ctrl+K to focus search)
  useEffect(() => {
    const handleKeyDown = (e) => {
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

  // 🔎 Real-time Search Logic
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ orders: [], users: [] });
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const searchTerm = `%${searchQuery}%`;
        
        // Search Orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, customer_name, phone, amount, status, product_name')
          .or(`id.ilike.${searchTerm},customer_name.ilike.${searchTerm},phone.ilike.${searchTerm},product_name.ilike.${searchTerm}`)
          .order('created_at', { ascending: false })
          .limit(5);

        // Search Users (if admin)
        let users = [];
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
  }, [searchQuery, isAdmin]);

  const navigateToOrder = (order) => {
    navigate(`/orders?viewOrder=${order.id}`);
    setIsSearchDropdownOpen(false);
    setSearchQuery('');
  };

  const navigateToUser = (user) => {
    navigate(`/users?viewUser=${user.id}`);
    setIsSearchDropdownOpen(false);
    setSearchQuery('');
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'ORDER_CREATED': return <Package size={16} />;
      case 'STATUS_CHANGE': return <Info size={16} />;
      case 'ORDER_UPDATED': return <Edit2 size={16} />;
      case 'TRACKING_ADDED': return <Truck size={16} />;
      case 'ORDER_DELETED': return <Trash2 size={16} />;
      case 'LOW_STOCK': return <AlertOctagon size={16} />;
      case 'TASK_ASSIGNED': return <Users size={16} />;
      case 'TASK_UPDATED': return <Edit2 size={16} />;
      case 'TASK_DEADLINE': return <Bell size={16} />;
      default: return <Bell size={16} />;
    }
  };

  const handleNotifClick = (notif) => {
    markAsRead(notif.id);
    if (notif.type.startsWith('TASK_')) {
      navigate('/tasks');
    } else {
      navigate('/orders');
    }
    setIsNotifOpen(false);
  };

  const primaryRole = userRoles[0] || 'User';
  const isOverviewPage = location.pathname === '/';
  const panelMotion = isDesktopExperience
    ? {
        hidden: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { duration: 0.01 },
        },
        exit: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: { duration: 0.01 },
        },
      }
    : {
        hidden: { opacity: 0, y: -20, scale: 0.98, filter: 'blur(10px)' },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          transition: {
            duration: 0.28,
            ease: [0.16, 1, 0.3, 1],
            when: 'beforeChildren',
            staggerChildren: 0.05,
          },
        },
        exit: {
          opacity: 0,
          y: -14,
          scale: 0.985,
          filter: 'blur(8px)',
          transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
        },
      };
  const notificationItemMotion = isDesktopExperience
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.01 },
        },
        exit: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.01 },
        },
      }
    : {
        hidden: { opacity: 0, y: -10 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
        },
        exit: {
          opacity: 0,
          y: -8,
          transition: { duration: 0.16, ease: [0.4, 0, 0.2, 1] },
        },
      };

  return (
    <header className={`header ${isOverviewPage ? 'mobile-overview-header' : ''}`}>
      {/* Hamburger — mobile only */}
      {onMenuToggle && (
        <button
          className="mobile-menu-toggle mobile-only"
          onClick={onMenuToggle}
          aria-label="Toggle menu"
        >
          <Menu size={22} />
        </button>
      )}

      {/* 🔍 Elite Inline Search Hub */}
      <div className={`header-search ${isSearchDropdownOpen ? 'active' : ''}`} ref={searchRef}>
        <Search className="header-search-icon" size={18} />
        <input
          type="text"
          placeholder="Search everything..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsSearchDropdownOpen(true);
          }}
          onFocus={() => setIsSearchDropdownOpen(true)}
        />
        <span className="search-shortcut desktop-only-flex">(Ctrl+K)</span>
        {isSearching && <Loader2 className="search-spinner-inline" size={16} />}

        {isSearchDropdownOpen && searchQuery.trim() && (
          <div className="search-results-dropdown-elite">
            {/* Orders Section */}
            {searchResults.orders.length > 0 ? (
              <div className="search-result-group-elite">
                <div className="group-label-elite">
                  <Package size={12} /> <span>Orders</span>
                </div>
                {searchResults.orders.map(order => (
                  <div key={order.id} className="search-item-elite" onClick={() => navigateToOrder(order)}>
                    <div className="item-icon-box-elite">
                      <Package size={14} />
                    </div>
                    <div className="item-info-elite">
                      <div className="item-title-elite">{order.customer_name} <span className="item-id-elite">#{order.id}</span></div>
                      <div className="item-sub-elite">{order.product_name} • <CurrencyIcon size={10} />{order.amount}</div>
                    </div>
                    <ChevronRight className="item-arrow-elite" size={14} />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Users Section */}
            {searchResults.users.length > 0 ? (
              <div className="search-result-group-elite">
                <div className="group-label-elite">
                  <Users size={12} /> <span>Staff</span>
                </div>
                {searchResults.users.map(user => (
                  <div key={user.id} className="search-item-elite" onClick={() => navigateToUser(user)}>
                    <div className="item-icon-box-elite accent">
                      <Users size={14} />
                    </div>
                    <div className="item-info-elite">
                      <div className="item-title-elite">{user.name}</div>
                      <div className="item-sub-elite">{user.email}</div>
                    </div>
                    <ChevronRight className="item-arrow-elite" size={14} />
                  </div>
                ))}
              </div>
            ) : null}

            {!isSearching && searchResults.orders.length === 0 && searchResults.users.length === 0 && (
              <div className="search-no-results-elite">
                <Command size={24} strokeWidth={1} />
                <p>No results found for "{searchQuery}"</p>
              </div>
            )}
            
            <div className="search-footer-elite">
              <span>Press <kbd>Esc</kbd> to close</span>
            </div>
          </div>
        )}
      </div>

      <div className="header-spacer" />

      <PresenceStack />

      {/* Floating Real-time Toasts */}
      <div className="notification-toasts-container">
        <AnimatePresence>
          {toasts.map((toast, index) => (
            <motion.div
              key={toast.id}
              className="notif-toast"
              onClick={() => handleNotifClick(toast)}
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: { delay: index * 0.04, duration: 0.24, ease: [0.16, 1, 0.3, 1] },
              }}
              exit={{ opacity: 0, x: 20, scale: 0.97, transition: { duration: 0.18 } }}
              layout
            >
              {getNotifIcon(toast.type)}
              <div className="toast-content">
                <span className="toast-title">{toast.title}</span>
                <span className="toast-message">{toast.message}</span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isStartupUnreadModalOpen && (
        <div className="startup-unread-modal-overlay" onClick={closeStartupUnreadModal}>
          <div className="startup-unread-modal" onClick={(e) => e.stopPropagation()}>
            <div className="startup-unread-modal-header">
              <h3>Unread Notifications</h3>
              <button className="startup-unread-close-btn" onClick={closeStartupUnreadModal}>
                <X size={18} />
              </button>
            </div>

            <div className="startup-unread-modal-list">
              {startupUnreadNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className="startup-unread-item"
                  onClick={() => {
                    markAsRead(notif.id);
                    navigate('/orders');
                    closeStartupUnreadModal();
                  }}
                >
                  <div className={`notif-circular-icon ${notif.type.toLowerCase().split('_')[0]}`}>
                    {getNotifIcon(notif.type)}
                  </div>
                  <div className="startup-unread-item-content">
                    <div className="startup-unread-item-title">{notif.title}</div>
                    <div className="startup-unread-item-message">{notif.message}</div>
                    <div className="startup-unread-item-time">{formatTime(notif.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="startup-unread-modal-footer">
              <button
                className="startup-unread-mark-btn"
                onClick={() => {
                  markAllAsRead();
                  closeStartupUnreadModal();
                }}
              >
                Mark all as read
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="header-actions">
        <div className="notifications-dropdown-container" ref={notifRef}>
          <button className="icon-badge-btn" onClick={() => setIsNotifOpen(!isNotifOpen)}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          <AnimatePresence>
            {isNotifOpen && (
              <>
                <motion.div
                  className="notifications-panel-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setIsNotifOpen(false)}
                />
                <motion.div
                  className="notifications-panel-standard"
                  variants={panelMotion}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                >
                  <motion.div variants={notificationItemMotion} className="panel-header-standard">
                    <h3>Notifications</h3>
                    <div className="header-actions-group">
                      <button className="see-all-btn" onClick={() => setIsNotifOpen(false)}>See All</button>
                      <button className="clear-all-btn-icon" onClick={(e) => { e.stopPropagation(); clearAllNotifications(); }}>Clear</button>
                    </div>
                  </motion.div>

                  <motion.div variants={notificationItemMotion} className="notif-tabs-container">
                    {['Today', 'This Week', 'Earlier'].map(tab => (
                      <button
                        key={tab}
                        className={`notif-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                      >
                        {tab}
                        {activeTab === tab && notifications.length > 0 && <span className="tab-count">{filterNotifs(notifications, tab).length}</span>}
                      </button>
                    ))}
                  </motion.div>

                  <div className="notifications-list-standard">
                    <AnimatePresence initial={false}>
                      {filteredNotifs.length > 0 ? (
                        filteredNotifs.map((notif, index) => (
                          <motion.div
                            key={notif.id}
                            className={`notif-item-standard ${notif.is_read ? '' : 'unread'}`}
                            onClick={() => handleNotifClick(notif)}
                            variants={notificationItemMotion}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            transition={{ delay: Math.min(index * 0.03, 0.16) }}
                            layout
                          >
                            <div className={`notif-circular-icon ${notif.type.toLowerCase().split('_')[0]}`}>
                              {getNotifIcon(notif.type)}
                            </div>

                            <div className="notif-content-standard">
                              <div className="notif-title-row">
                                <div className="notif-title-group">
                                  {!notif.is_read && <span className="notif-status-dot" />}
                                  <span className="notif-title-text">{notif.title}</span>
                                </div>
                                <span className="notif-time-standard">{formatTime(notif.created_at)}</span>
                              </div>
                              <p className="notif-message-standard">{notif.message}</p>
                              {notif.actor_name && (
                                <div className="notif-actor-standard">By {notif.actor_name}</div>
                              )}
                            </div>
                          </motion.div>
                        ))
                      ) : (
                        <motion.div
                          className="empty-notifications-standard"
                          variants={notificationItemMotion}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                        >
                          <Bell size={24} />
                          <p>All caught up in {activeTab}!</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <motion.div variants={notificationItemMotion} className="panel-footer-standard">
                    <Link to="/settings" onClick={() => setIsNotifOpen(false)}>System Audit Logs</Link>
                  </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="profile-actions-row">
          <div className="user-dropdown-container" ref={dropdownRef}>
            <div className="user-profile-trigger-premium" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
              <div className="avatar-ring">
                <div className="avatar-premium">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile" />
                  ) : (
                    profile?.name?.substring(0, 2)?.toUpperCase() || 'U'
                  )}
                </div>
              </div>
            </div>

            {isDropdownOpen && (
              <div className="premium-dropdown">
                {/* User Info Header */}
                <div className="dropdown-user-header">
                  <div className="dropdown-user-name">{profile?.name || 'User'}</div>
                  <div className="dropdown-user-role">{primaryRole}</div>
                </div>
                {isOverviewPage && onMenuToggle && (
                  <button
                    className="dropdown-item mobile-overview-nav-trigger"
                    onClick={() => {
                      setIsDropdownOpen(false);
                      onMenuToggle();
                    }}
                  >
                    <Menu size={17} /> <span>Open Menu</span>
                  </button>
                )}
                <button className="dropdown-item" onClick={() => { navigate('/profile'); setIsDropdownOpen(false); }}>
                  <UserIcon size={17} /> <span>Profile</span>
                </button>
                <button className="dropdown-item" onClick={() => { navigate('/settings'); setIsDropdownOpen(false); }}>
                  <Settings size={17} /> <span>Settings</span>
                  <div className="dropdown-last-used">
                    <span className="dropdown-last-used-label">Last Used</span>
                    <span>Just now</span>
                  </div>
                </button>
                <div className="dropdown-divider-light" />
                <button className="dropdown-item" onClick={() => { setIsDropdownOpen(false); }}>
                  <Info size={17} /> <span>Help center</span>
                </button>
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
