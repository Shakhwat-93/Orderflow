import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Package, Users as UsersIcon, ChevronRight, X, Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import CurrencyIcon from './CurrencyIcon';
import './GlobalSearchModal.css';

export const GlobalSearchModal = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState({ orders: [], users: [] });
  const [isSearching, setIsSearching] = useState(false);
  const { userRoles } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      setQuery('');
      setResults({ orders: [], users: [] });
      document.body.style.overflow = 'auto';
    }
    return () => { document.body.style.overflow = 'auto'; };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim()) {
      setResults({ orders: [], users: [] });
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const searchTerm = `%${query}%`;
        
        // Search Orders
        const { data: orders } = await supabase
          .from('orders')
          .select('id, customer_name, phone, amount, status, product_name')
          .or(`id.ilike.%${query}%,customer_name.ilike.%${query}%,phone.ilike.%${query}%,product_name.ilike.%${query}%`)
          .order('created_at', { ascending: false })
          .limit(5);

        // Search Users (if admin)
        let users = [];
        if (userRoles.includes('Admin')) {
          const { data: userData } = await supabase
            .from('users')
            .select('id, name, email')
            .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
            .limit(3);
          users = userData || [];
        }

        setResults({ orders: orders || [], users });
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const delay = setTimeout(performSearch, 300);
    return () => clearTimeout(delay);
  }, [query, userRoles]);

  if (!isOpen) return null;

  const navigateToOrder = (order) => {
    navigate(`/orders?viewOrder=${order.id}`);
    onClose();
  };

  const navigateToUser = (user) => {
    navigate(`/users?viewUser=${user.id}`);
    onClose();
  };

  return (
    <div className="global-search-overlay" onClick={onClose}>
      <div className="global-search-modal" onClick={e => e.stopPropagation()}>
        
        <div className="global-search-header">
          <Search className="search-icon-active" size={22} />
          <input
            ref={inputRef}
            type="text"
            className="global-search-input"
            placeholder="Search orders, customers, or hit Esc to close..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {isSearching && <Loader2 className="search-spinner" size={20} />}
          <button className="close-search-btn" onClick={onClose}>ESC</button>
        </div>

        <div className="global-search-content">
          {!query ? (
            <div className="search-empty-state">
              <Command size={48} strokeWidth={1} />
              <p>Type to search across the platform</p>
              <div className="search-hints">
                <span>Try searching for:</span>
                <div className="hint-tags">
                  <span>#order_id</span>
                  <span>Customer Name</span>
                  <span>Phone Number</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="search-results-container">
              
              {results.orders.length > 0 && (
                <div className="search-result-group">
                  <div className="group-title">
                    <Package size={14} /> Orders
                  </div>
                  <div className="group-items">
                    {results.orders.map(order => (
                      <div key={order.id} className="search-result-item" onClick={() => navigateToOrder(order)}>
                        <div className="item-icon-box bg-blue">
                          <Package size={16} />
                        </div>
                        <div className="item-details">
                          <div className="item-primary">{order.customer_name} <span>• {order.id}</span></div>
                          <div className="item-secondary">{order.product_name} — <CurrencyIcon size={10} className="currency-icon-elite" />{order.amount} — {order.status}</div>
                        </div>
                        <ChevronRight className="item-arrow" size={16} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.users.length > 0 && (
                <div className="search-result-group">
                  <div className="group-title">
                    <UsersIcon size={14} /> Staff & Users
                  </div>
                  <div className="group-items">
                    {results.users.map(user => (
                      <div key={user.id} className="search-result-item" onClick={() => navigateToUser(user)}>
                        <div className="item-icon-box bg-purple">
                          <UsersIcon size={16} />
                        </div>
                        <div className="item-details">
                          <div className="item-primary">{user.name}</div>
                          <div className="item-secondary">{user.email}</div>
                        </div>
                        <ChevronRight className="item-arrow" size={16} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {query && !isSearching && results.orders.length === 0 && results.users.length === 0 && (
                <div className="search-no-results">
                  <Search size={32} strokeWidth={1} />
                  <p>No results found for "{query}"</p>
                </div>
              )}

            </div>
          )}
        </div>
        
      </div>
    </div>
  );
};
