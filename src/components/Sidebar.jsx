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
  X
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const menuItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/orders', label: 'Orders', icon: ShoppingCart },
  { path: '/moderator', label: 'Moderator Panel', icon: ShieldCheck, roles: ['Admin', 'Moderator'] },
  { path: '/call-team', label: 'Call Team Panel', icon: Headphones, roles: ['Admin', 'Call Team'] },
  { path: '/factory', label: 'Factory Panel', icon: Factory, roles: ['Admin', 'Factory Team'] },
  { path: '/courier', label: 'Courier Panel', icon: Truck, roles: ['Admin', 'Courier Team'] },
  { path: '/users', label: 'User Management', icon: Users, roles: ['Admin'] },
  { path: '/inventory', label: 'Inventory', icon: Package, roles: ['Admin', 'Moderator'] },
  { path: '/reports', label: 'Reports', icon: BarChart3, roles: ['Admin'] },
  { path: '/tasks', label: 'Tasks', icon: ClipboardList },
];

export const Sidebar = ({ isOpen, onClose }) => {

  const location = useLocation();
  const { hasAnyRole, signOut } = useAuth();

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
        {onClose && (
          <button className="sidebar-close mobile-only" onClick={onClose}>
            <X size={24} />
          </button>
        )}
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
