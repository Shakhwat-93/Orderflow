import { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomNav } from './MobileBottomNav';
import { UnattendedOrdersAlertModal } from './UnattendedOrdersAlertModal';
import { getSessionStorage } from '../platform/storage';
import { Download, X } from 'lucide-react';
import api from '../lib/api';
import './DashboardLayout.css';


export const DashboardLayout = () => {
  const navigate = useNavigate();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const location = useLocation();
  const scrollRef = useRef(null);
  const scrollKey = `route_scroll:${location.pathname}${location.search}`;
  const storage = getSessionStorage();

  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const config = await api.getSystemConfig('app_version');
        if (config && Number(config.versionCode) > 2) {
          setUpdateAvailable(true);
          setUpdateVersion(config);
        }
      } catch (err) {
        console.warn('[DashboardLayout] Background update check failed:', err);
      }
    };
    checkUpdates();
    const interval = setInterval(checkUpdates, 600000);
    return () => clearInterval(interval);
  }, []);

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
        {updateAvailable && !dismissedUpdate && updateVersion && (
          <div className="ota-update-top-banner">
            <div className="ota-banner-content">
              <Download size={14} className="ota-bounce-icon" />
              <span>
                New update available! <b>v{updateVersion.versionName}</b> (Build {updateVersion.versionCode})
              </span>
              <button 
                className="ota-banner-action-btn"
                onClick={() => {
                  navigate('/settings?section=update');
                }}
              >
                Update Now
              </button>
            </div>
            <button className="ota-banner-close" onClick={() => setDismissedUpdate(true)}>
              <X size={14} />
            </button>
          </div>
        )}
        <main className="content-scrollable" ref={scrollRef}>
          <Outlet />
        </main>
      </div>

      {/* Fixed bottom nav — mobile only, all routes */}
      <MobileBottomNav />

      {/* Global premium real-time danger alert modal for uncalled orders > 20 mins */}
      <UnattendedOrdersAlertModal />
    </div>
  );
};
