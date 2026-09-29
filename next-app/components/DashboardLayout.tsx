'use client';

import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { RouteProgressBar } from '@/components/RouteProgressBar';

export const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const pathname = usePathname();
  const scrollRef = useRef<HTMLElement>(null);
  const scrollKey = `route_scroll:${pathname}`;

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    try {
      const saved = sessionStorage.getItem(scrollKey);
      node.scrollTop = saved ? Number(saved) || 0 : 0;
    } catch {
      // Storage access blocked or SSR
    }

    const handleScroll = () => {
      try {
        sessionStorage.setItem(scrollKey, String(node.scrollTop));
      } catch {
        // Storage access blocked
      }
    };

    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      handleScroll();
      node.removeEventListener('scroll', handleScroll);
    };
  }, [scrollKey]);

  useEffect(() => {
    // Close sidebar upon route change
    setIsSidebarOpen(false);
  }, [pathname]);

  // Visibility-Aware background revalidation (Section 34)
  useEffect(() => {
    let lastHiddenTime = 0;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        lastHiddenTime = Date.now();
      } else {
        // Only trigger resume if hidden for at least 25 seconds
        if (lastHiddenTime && Date.now() - lastHiddenTime > 25000) {
          window.dispatchEvent(new CustomEvent('app:resume'));
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return (
    <div className="app-container">
      <RouteProgressBar />
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {isSidebarOpen && (
        <div
          className="sidebar-overlay mobile-only"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="main-content">
        <Header
          onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />
        <main className="content-scrollable" ref={scrollRef}>
          {children}
        </main>
      </div>
    </div>
  );
};
