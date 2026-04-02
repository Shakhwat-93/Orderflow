import { Link, useLocation } from 'react-router-dom';
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
  X,
  Sun,
  Moon
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { useTheme } from '../context/ThemeContext';
import './Sidebar.css';

const menuItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard, group: 'Main Console' },
  { path: '/orders', label: 'Orders', icon: ShoppingCart, group: 'Main Console' },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['Admin', 'Moderator'], group: 'Main Console' },
  { path: '/factory', label: 'Factory', icon: Factory, roles: ['Admin', 'Factory Team'], group: 'Logistics' },
  { path: '/courier', label: 'Courier', icon: Truck, roles: ['Admin', 'Courier Team'], group: 'Logistics' },
  { path: '/steadfast', label: 'Steadfast Hub', icon: Truck, roles: ['Admin', 'Courier Team', 'Moderator'], group: 'Logistics' },
  { path: '/moderator', label: 'Moderator', icon: ShieldCheck, roles: ['Admin', 'Moderator'], group: 'Intelligence' },
  { path: '/call-team', label: 'Call Team', icon: Headphones, roles: ['Admin', 'Call Team'], group: 'Intelligence' },
  { path: '/users', label: 'Users', icon: Users, roles: ['Admin'], group: 'Intelligence' },
  { path: '/reports', label: 'Analytics', icon: BarChart3, roles: ['Admin'], group: 'System' },
  { path: '/digital-marketer', label: 'Marketing', icon: Megaphone, roles: ['Admin', 'Digital Marketer'], group: 'System' },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList, group: 'System' },
];

const GROUP_ORDER = ['Main Console', 'Logistics', 'Intelligence', 'System'];

export const Sidebar = ({ isOpen, onClose }) => {

  const location = useLocation();
  const { hasAnyRole, signOut, profile, user, userRoles } = useAuth();
  const { appName } = useBranding();
  const { theme, toggleTheme } = useTheme();
  const primaryRole = userRoles?.[0] || 'Team Member';
  const displayName = profile?.name || user?.user_metadata?.full_name || user?.email || 'User';

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
      <div className="sidebar-header">
        <div className="sidebar-logo-container">
          <div className="logo-icon">{appName.charAt(0).toUpperCase() || 'O'}</div>
          <span className="logo-text">{appName}</span>
        </div>
        
        <div className="sidebar-header-actions">
          <button
            className={`theme-toggle ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            <span className={`theme-toggle-thumb ${theme === 'dark' ? 'dark' : ''}`}>
              {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
            </span>
            <span className="theme-toggle-icon">
              <Sun size={12} />
            </span>
            <span className="theme-toggle-icon">
              <Moon size={12} />
            </span>
          </button>

          {onClose && (
            <button className="sidebar-close" onClick={onClose}>
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      
      <nav className="sidebar-nav">
        {groupedItems.map(({ group, items }) => (
          <div key={group} className="nav-group">
            <p className="nav-section-label">{group}</p>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <Icon className="nav-icon" size={20} />
                  <span className="nav-label">{item.label}</span>
                  {isActive && <span className="nav-active-dot" />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      
      <div className="sidebar-footer">
        <Link to="/profile" className="sidebar-profile-card sidebar-profile-card-footer" onClick={onClose}>
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
        <button className="nav-item logout-btn" onClick={signOut}>
          <LogOut className="nav-icon" size={20} />
          <span className="nav-label">Sign out</span>
        </button>
      </div>
    </aside>
  );
};
