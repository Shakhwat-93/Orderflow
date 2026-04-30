import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ShieldCheck, 
  Headphones, 
  Truck, 
  Factory, 
  BarChart3,
  Settings,
  LogOut,
  Users,
  Package,
  ClipboardList,
  Megaphone,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Sun,
  Moon,
  DatabaseBackup
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { useTheme } from '../context/ThemeContext';
import './Sidebar.css';

const menuItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, group: 'Main Console' },
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
      { path: '/orders?status=Fake%20Order', label: 'Fake Order', status: 'Fake Order', tone: 'fake' }
    ]
  },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['Admin', 'Moderator'], group: 'Main Console' },
  { path: '/factory', label: 'Confirmed', icon: Factory, roles: ['Admin', 'Factory Team'], group: 'Logistics' },
  { path: '/courier', label: 'Bulk Exported', icon: Truck, roles: ['Admin', 'Courier Team', 'Factory Team'], group: 'Logistics' },
  { path: '/steadfast', label: 'Steadfast Hub', icon: Truck, roles: ['Admin', 'Courier Team', 'Moderator'], group: 'Logistics' },
  { path: '/moderator', label: 'Moderator', icon: ShieldCheck, roles: ['Admin', 'Moderator'], group: 'Intelligence' },
  { path: '/call-team', label: 'Call Team', icon: Headphones, roles: ['Admin', 'Call Team'], group: 'Intelligence' },
  { path: '/users', label: 'Users', icon: Users, roles: ['Admin'], group: 'Intelligence' },
  { path: '/fraud', label: 'Fraud', icon: ShieldAlert, roles: ['Admin'], group: 'Intelligence' },
  { path: '/reports', label: 'Analytics', icon: BarChart3, roles: ['Admin'], group: 'System' },
  { path: '/digital-marketer', label: 'Marketing', icon: Megaphone, roles: ['Admin', 'Digital Marketer'], group: 'System' },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList, group: 'System' },
  { path: '/backup', label: 'Backup', icon: DatabaseBackup, roles: ['Admin'], group: 'System' },
];

const GROUP_ORDER = ['Main Console', 'Logistics', 'Intelligence', 'System'];

export const Sidebar = ({ isOpen, onClose }) => {

  const location = useLocation();
  const navigate = useNavigate();
  const { hasAnyRole, signOut, profile, user, userRoles } = useAuth();
  const { appName } = useBranding();
  const { theme, toggleTheme } = useTheme();
  const [openMenus, setOpenMenus] = useState(() => ({ orders: location.pathname === '/orders' }));
  const primaryRole = userRoles?.[0] || 'Team Member';
  const displayName = profile?.name || user?.user_metadata?.full_name || user?.email || 'User';
  const currentStatus = new URLSearchParams(location.search).get('status') || '';

  const filteredItems = menuItems.filter(item => 
    !item.roles || hasAnyRole(item.roles)
  );
  const groupedItems = GROUP_ORDER
    .map((group) => ({
      group,
      items: filteredItems.filter((item) => item.group === group)
    }))
    .filter((entry) => entry.items.length > 0);

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>

      {/* ── Header ── */}
      <div className="sidebar-header">
        <div className="sidebar-logo-container">
          <div className="logo-icon">{appName.charAt(0).toUpperCase() || 'O'}</div>
          <span className="logo-text">{appName}</span>
        </div>

        <div className="sidebar-header-actions">
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {onClose && (
            <button className="sidebar-close" onClick={onClose}>
              <X size={22} />
            </button>
          )}
        </div>
      </div>



      {/* ── Nav ── */}
      <nav className="sidebar-nav">
        {groupedItems.map(({ group, items }) => (
          <div key={group} className="nav-group">

            {/* Section header */}
            <div className="nav-section-header">
              <p className="nav-section-label">{group}</p>
            </div>

            {/* Nav items */}
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const hasChildren = Array.isArray(item.children) && item.children.length > 0;
              const isMenuOpen = hasChildren && openMenus[item.label.toLowerCase()];
              return (
                <div key={item.path} className={`nav-item-shell ${hasChildren ? 'has-submenu' : ''}`}>
                  <Link
                    to={item.path}
                    className={`nav-item ${isActive ? 'active' : ''}`}
                    onClick={(event) => {
                      if (hasChildren) {
                        event.preventDefault();
                        setOpenMenus(prev => ({
                          ...prev,
                          [item.label.toLowerCase()]: true
                        }));
                        navigate(item.path);
                      } else {
                        onClose?.();
                      }
                    }}
                  >
                    <Icon className="nav-icon" size={18} />
                    <span className="nav-label">{item.label}</span>
                    {hasChildren ? (
                      <ChevronDown className={`nav-submenu-chevron ${isMenuOpen ? 'open' : ''}`} size={15} />
                    ) : (
                      isActive && <ChevronRight className="nav-active-chevron" size={16} />
                    )}
                  </Link>

                  {hasChildren && isMenuOpen && (
                    <div className="nav-submenu">
                      {item.children.map((child) => {
                        const isChildActive = isActive && currentStatus === child.status;
                        return (
                          <Link
                            key={child.status}
                            to={child.path}
                            className={`nav-subitem ${isChildActive ? 'active' : ''} tone-${child.tone}`}
                            onClick={onClose}
                          >
                            <span className="nav-subitem-dot" />
                            <span>{child.label}</span>
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

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <Link to="/profile" className="sidebar-profile-card" onClick={onClose}>
          <div className="sidebar-profile-avatar">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt={displayName} />
            ) : (
              displayName.substring(0, 2).toUpperCase()
            )}
          </div>
          <div className="sidebar-profile-meta">
            <strong>{displayName}</strong>
            <span className="sidebar-profile-role-text">{primaryRole}</span>
          </div>
        </Link>

        <button className="logout-btn" onClick={signOut}>
          <LogOut className="nav-icon" size={16} />
          <span className="nav-label">Sign out</span>
        </button>
      </div>

    </aside>
  );
};
