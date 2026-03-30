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
import { useTheme } from '../context/ThemeContext';
import './Sidebar.css';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orders', label: 'Orders', icon: ShoppingCart },
  { path: '/moderator', label: 'Moderator Panel', icon: ShieldCheck, roles: ['Admin', 'Moderator'] },
  { path: '/call-team', label: 'Call Team Panel', icon: Headphones, roles: ['Admin', 'Call Team'] },
  { path: '/factory', label: 'Factory Panel', icon: Factory, roles: ['Admin', 'Factory Team'] },
  { path: '/courier', label: 'Courier Panel', icon: Truck, roles: ['Admin', 'Courier Team'] },
  { path: '/steadfast', label: 'Steadfast Hub', icon: Truck, roles: ['Admin', 'Courier Team', 'Moderator'] },
  { path: '/users', label: 'User Management', icon: Users, roles: ['Admin'] },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['Admin', 'Moderator'] },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: ['Admin'] },
  { path: '/digital-marketer', label: 'Digital Marketer', icon: Megaphone, roles: ['Admin', 'Digital Marketer'] },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList },
];

export const Sidebar = ({ isOpen, onClose }) => {

  const location = useLocation();
  const { hasAnyRole, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const filteredItems = menuItems.filter(item => 
    !item.roles || hasAnyRole(item.roles)
  );

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">O</div>
          <span className="logo-text">OrderFlow</span>
        </div>
        
        <div className="header-actions">
          <button 
            className="theme-toggle" 
            onClick={toggleTheme}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          {onClose && (
            <button className="sidebar-close" onClick={onClose}>
              <X size={24} />
            </button>
          )}
        </div>
      </div>

      
      <nav className="sidebar-nav">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <Link 
              key={item.path} 
              to={item.path} 
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-icon" size={20} />
              <span className="nav-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="sidebar-footer">
        <button className="nav-item logout-btn" onClick={signOut}>
          <LogOut className="nav-icon" size={20} />
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </aside>
  );
};
