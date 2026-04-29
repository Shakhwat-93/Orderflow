import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Command, LayoutDashboard, ShoppingBag, 
  Users, Truck, Factory, Package, BarChart3, 
  Settings, User, PlusCircle, RefreshCw, X
} from 'lucide-react';
import { useOrders } from '../context/OrderContext';
import './CommandPalette.css';

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { orders } = useOrders();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const paletteRef = useRef(null);

  const STATIC_COMMANDS = [
    { id: 'dash', name: 'Dashboard', icon: <LayoutDashboard size={18} />, category: 'Navigation', action: () => navigate('/') },
    { id: 'orders', name: 'Orders Board', icon: <ShoppingBag size={18} />, category: 'Navigation', action: () => navigate('/orders') },
    { id: 'call', name: 'Call Team Panel', icon: <Users size={18} />, category: 'Navigation', action: () => navigate('/call-team') },
    { id: 'factory', name: 'Confirmed Panel', icon: <Factory size={18} />, category: 'Navigation', action: () => navigate('/factory') },
    { id: 'courier', name: 'Bulk Exported Panel', icon: <Truck size={18} />, category: 'Navigation', action: () => navigate('/courier') },
    { id: 'inventory', name: 'Inventory Management', icon: <Package size={18} />, category: 'Navigation', action: () => navigate('/inventory') },
    { id: 'reports', name: 'Reports & Analytics', icon: <BarChart3 size={18} />, category: 'Navigation', action: () => navigate('/reports') },
    { id: 'profile', name: 'My Profile', icon: <User size={18} />, category: 'Navigation', action: () => navigate('/profile') },
    { id: 'settings', name: 'System Settings', icon: <Settings size={18} />, category: 'Navigation', action: () => navigate('/settings') },
    { id: 'new-order', name: 'Create New Order', icon: <PlusCircle size={18} />, category: 'Actions', action: () => window.dispatchEvent(new CustomEvent('open-new-order-modal')) },
    { id: 'sync', name: 'Sync Data', icon: <RefreshCw size={18} />, category: 'Actions', action: () => window.location.reload() },
  ];

  // Search Logic
  const filteredCommands = STATIC_COMMANDS.filter(cmd => 
    cmd.name.toLowerCase().includes(search.toLowerCase())
  );

  const dynamicOrders = search.length > 2 
    ? orders.filter(o => 
        o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
        o.phone?.includes(search) ||
        String(o.id).includes(search)
      ).slice(0, 5).map(o => ({
        id: `order-${o.id}`,
        name: o.customer_name,
        meta: `Order #${o.id} • ${o.status}`,
        icon: <ShoppingBag size={18} />,
        category: 'Orders',
        action: () => navigate(`/orders?id=${o.id}`) // Assuming the board can auto-open this
      }))
    : [];

  const allResults = [...filteredCommands, ...dynamicOrders];

  // Event Listeners
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Toggle Palette: Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }

      // Close: Escape
      if (e.key === 'Escape') {
        setIsOpen(false);
      }

      if (!isOpen) return;

      // Navigate Results: Arrows
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % allResults.length);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + allResults.length) % allResults.length);
      }

      // Execute: Enter
      if (e.key === 'Enter') {
        e.preventDefault();
        if (allResults[selectedIndex]) {
          allResults[selectedIndex].action();
          setIsOpen(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, allResults, selectedIndex]);

  // Focus Input on Open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Grouping logic for rendering
  const categories = [...new Set(allResults.map(r => r.category))];

  return (
    <div className="command-palette-overlay" onClick={() => setIsOpen(false)}>
      <div className="command-palette" onClick={e => e.stopPropagation()} ref={paletteRef}>
        <div className="palette-search-wrapper">
          <Search size={20} className="palette-search-icon" />
          <input 
            ref={inputRef}
            type="text" 
            className="palette-input" 
            placeholder="Search commands, orders, or customers..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="palette-kbd-hint">ESC</div>
        </div>

        <div className="palette-results">
          {categories.length === 0 && (
            <div className="empty-logs" style={{ padding: '40px' }}>No results found for "{search}"</div>
          )}
          
          {categories.map(cat => (
            <div key={cat} className="palette-section">
              <div className="palette-section-label">{cat}</div>
              {allResults
                .filter(r => r.category === cat)
                .map((result) => {
                  const globalIndex = allResults.indexOf(result);
                  return (
                    <div 
                      key={result.id} 
                      className={`palette-item ${selectedIndex === globalIndex ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      onClick={() => {
                        result.action();
                        setIsOpen(false);
                      }}
                    >
                      <div className="palette-item-icon">
                        {result.icon}
                      </div>
                      <div className="palette-item-content">
                        <span className="palette-item-name">{result.name}</span>
                        {result.meta && <span className="palette-item-meta">{result.meta}</span>}
                      </div>
                      {selectedIndex === globalIndex && <Command size={14} style={{ opacity: 0.5 }} />}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>

        <div className="palette-footer">
          <div className="footer-hint">
            <kbd>↑↓</kbd> to navigate
          </div>
          <div className="footer-hint">
            <kbd>↵</kbd> to select
          </div>
          <div className="footer-hint">
            <kbd>ESC</kbd> to close
          </div>
        </div>
      </div>
    </div>
  );
};
