import { Bell, Search, User as UserIcon, LogOut, Settings, ChevronDown, Menu, Package, Info, AlertOctagon, Edit2, Truck, Trash2, Users, CreditCard, X } from 'lucide-react';
import './Header.css';
import './NotificationCenter.css';
import { Badge } from './Badge';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';

export const Header = ({ onMenuToggle, isSidebarOpen }) => {
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Today');

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      default: return <Bell size={16} />;
    }
  };

  const primaryRole = userRoles[0] || 'User';

  return (
    <header className="header">
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

      {/* Search — hidden on very small screens, always present on desktop */}
      <div className="header-search desktop-only-flex">
        <Search className="search-icon" size={18} />
        <input
          type="text"
          placeholder="Search orders, customers..."
          className="search-input"
        />
      </div>

      <div className="header-spacer" />

      {/* Floating Real-time Toasts */}
      <div className="notification-toasts-container">
        {toasts.map(toast => (
          <div key={toast.id} className="notif-toast" onClick={() => { navigate('/orders'); markAsRead(toast.id); }}>
            {getNotifIcon(toast.type)}
            <div className="toast-content">
              <span className="toast-title">{toast.title}</span>
              <span className="toast-message">{toast.message}</span>
            </div>
          </div>
        ))}
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
        {/* Search toggle for mobile */}
        <button className="icon-badge-btn mobile-only">
          <Search size={18} />
        </button>

        <div className="notifications-dropdown-container" ref={notifRef}>
          <button className="icon-badge-btn" onClick={() => setIsNotifOpen(!isNotifOpen)}>
            <Bell size={20} />
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>

          {isNotifOpen && (
            <div className="notifications-panel-standard">
              <div className="panel-header-standard">
                <h3>AI Notification Center</h3>
                <div className="header-actions-group">
                  <button className="see-all-btn" onClick={() => setIsNotifOpen(false)}>See All</button>
                  <button className="clear-all-btn-icon" onClick={(e) => { e.stopPropagation(); clearAllNotifications(); }}>Clear</button>
                </div>
              </div>

              <div className="notif-tabs-container">
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
              </div>

              <div className="notifications-list-standard">
                {filteredNotifs.length > 0 ? (
                  filteredNotifs.map(notif => (
                    <div
                      key={notif.id}
                      className={`notif-item-standard ${notif.is_read ? '' : 'unread'}`}
                      onClick={() => { markAsRead(notif.id); navigate(`/orders`); setIsNotifOpen(false); }}
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
                    </div>
                  ))
                ) : (
                  <div className="empty-notifications-standard">
                    <Bell size={24} />
                    <p>All caught up in {activeTab}!</p>
                  </div>
                )}
              </div>

              <div className="panel-footer-standard">
                <Link to="/settings" onClick={() => setIsNotifOpen(false)}>System Audit Logs</Link>
              </div>
            </div>
          )}
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
                <button className="dropdown-item" onClick={() => { navigate('/profile'); setIsDropdownOpen(false); }}>
                  <UserIcon size={18} /> <span>Profile</span>
                </button>
                <button className="dropdown-item" onClick={() => { navigate('/settings'); setIsDropdownOpen(false); }}>
                  <Settings size={18} /> <span>Settings</span>
                </button>
                <div className="dropdown-divider-light" />
                <button className="dropdown-item" onClick={() => { setIsDropdownOpen(false); }}>
                  <Info size={18} /> <span>Help center</span>
                </button>
                <button className="dropdown-item logout" onClick={() => signOut()}>
                  <LogOut size={18} /> <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
