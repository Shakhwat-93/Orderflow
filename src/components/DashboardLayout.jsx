import { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { getSessionStorage } from '../platform/storage';
import './DashboardLayout.css';


export const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const scrollRef = useRef(null);
  const scrollKey = `route_scroll:${location.pathname}${location.search}`;
  const storage = getSessionStorage();

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const saved = storage.getItem(scrollKey);
    node.scrollTop = saved ? Number(saved) || 0 : 0;

    const handleScroll = () => {
      storage.setItem(scrollKey, String(node.scrollTop));
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      handleScroll();
      node.removeEventListener('scroll', handleScroll);
    };
  }, [scrollKey, storage]);

  useEffect(() => {
    const handleBackButton = (event) => {
      if (isSidebarOpen) {
        event.preventDefault();
        setIsSidebarOpen(false);
      }
    };

    window.addEventListener('app:backbutton', handleBackButton);
    return () => window.removeEventListener('app:backbutton', handleBackButton);
  }, [isSidebarOpen]);

  return (
    <div className="app-container">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      
      {isSidebarOpen && (
        <div 
          className="sidebar-overlay mobile-only" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="main-content">
        {/* Single unified header — handles both mobile and desktop */}
        <Header 
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
          isSidebarOpen={isSidebarOpen} 
        />
        <main className="content-scrollable" ref={scrollRef}>
          <Outlet />
        </main>
      </div>

      {/* Fixed bottom nav — mobile only, all routes */}
      <MobileBottomNav />
    </div>
  );
};
