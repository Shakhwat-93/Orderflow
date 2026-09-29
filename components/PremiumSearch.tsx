'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search as SearchIcon, Sparkles, Clock, Eye, ArrowRight } from 'lucide-react';

export interface SearchSuggestion {
  id: string | number;
  label: string;
  sub?: string;
  type?: string;
  [key: string]: any;
}

export interface PremiumSearchProps {
  value: string;
  onChange: (e: any) => void;
  placeholder?: string;
  suggestions?: SearchSuggestion[];
  onSuggestionClick?: (item: SearchSuggestion) => void;
  className?: string;
}

export const PremiumSearch: React.FC<PremiumSearchProps> = ({ 
  value, 
  onChange, 
  placeholder = "Search...", 
  suggestions = [], 
  onSuggestionClick,
  className = "" 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [recentViewed, setRecentViewed] = useState<SearchSuggestion[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const savedHistory = JSON.parse(localStorage.getItem('premium_search_history') || '[]');
      const savedViewed = JSON.parse(localStorage.getItem('premium_search_viewed') || '[]');
      setHistory(savedHistory.slice(0, 5));
      setRecentViewed(savedViewed.slice(0, 5));
    } catch {
      // Ignore parse errors
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
    if (e.target.value.trim()) {
      setIsOpen(true);
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  const saveToHistory = (term: string) => {
    if (!term.trim()) return;
    const newHistory = [term, ...history.filter(t => t !== term)].slice(0, 5);
    setHistory(newHistory);
    localStorage.setItem('premium_search_history', JSON.stringify(newHistory));
  };

  const clearHistory = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory([]);
    localStorage.removeItem('premium_search_history');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      saveToHistory(value);
      setIsOpen(false);
    }
  };

  return (
    <div className={`elite-search-wrapper ${className}`} ref={wrapperRef} style={{ position: 'relative' }}>
      <SearchIcon size={18} className="elite-search-icon" />
      <input
        type="text"
        className="elite-search-input"
        placeholder={placeholder}
        value={value}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      
      <div className="search-shortcut-hint">
        <span>⌘</span>
        <span>/</span>
      </div>
      
      <Sparkles 
        size={16} 
        className="premium-sparkle-icon" 
        onClick={() => setIsOpen(!isOpen)}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            className="premium-search-dropdown"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {value.trim() ? (
              <div className="search-dropdown-section">
                <div className="search-dropdown-title">Quick Results</div>
                {suggestions.length > 0 ? (
                  suggestions.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="search-dropdown-item"
                      onClick={() => {
                        onSuggestionClick?.(item);
                        setIsOpen(false);
                      }}
                    >
                      <div className="item-icon">
                        <SearchIcon size={14} />
                      </div>
                      <div className="item-content">
                        <div className="item-label">{item.label}</div>
                        {item.sub && <div className="item-sub">{item.sub}</div>}
                      </div>
                      <div className="item-action">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-sm text-tertiary">
                    No matching keywords identified...
                  </div>
                )}
              </div>
            ) : (
              <>
                {recentViewed.length > 0 && (
                  <div className="search-dropdown-section">
                    <div className="search-dropdown-title">Recently Viewed</div>
                    {recentViewed.map((item, idx) => (
                      <div 
                        key={idx} 
                        className="search-dropdown-item"
                        onClick={() => {
                          onSuggestionClick?.(item);
                          setIsOpen(false);
                        }}
                      >
                        <div className="item-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                          <Eye size={14} />
                        </div>
                        <div className="item-content">
                          <div className="item-label">{item.label}</div>
                          <div className="item-sub">Viewed recently</div>
                        </div>
                        <div className="item-action">
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {history.length > 0 && (
                  <div className="search-dropdown-section">
                    <div className="search-dropdown-title flex justify-between">
                      <span>Last Searches</span>
                      <button 
                        type="button"
                        onClick={clearHistory}
                        className="text-[9px] hover:text-red-500 transition-colors"
                      >
                        Clear All
                      </button>
                    </div>
                    {history.map((term, idx) => (
                      <div 
                        key={idx} 
                        className="search-dropdown-item"
                        onClick={() => {
                          onChange({ target: { value: term } });
                          setIsOpen(false);
                        }}
                      >
                        <div className="item-icon" style={{ background: 'rgba(148, 163, 184, 0.1)', color: '#94a3b8' }}>
                          <Clock size={14} />
                        </div>
                        <div className="item-content">
                          <div className="item-label">{term}</div>
                        </div>
                        <div className="item-action">
                          <ArrowRight size={14} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!recentViewed.length && !history.length && (
                  <div className="p-8 text-center">
                    <div className="mb-2 flex justify-center text-tertiary">
                      <SearchIcon size={32} strokeWidth={1.5} />
                    </div>
                    <div className="text-sm font-semibold text-primary">Start typing to search...</div>
                    <div className="text-xs text-tertiary">Real-time keyword matching active</div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
