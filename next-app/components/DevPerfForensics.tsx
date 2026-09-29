'use client';

/**
 * TEMPORARY PERFORMANCE FORENSICS INSTRUMENTATION - PHASE 9.7 ONLY
 * This component runs ONLY in development mode and gathers precise measurements
 * for route navigation latency, API calls, duplicate requests, and long main-thread tasks.
 * It will be completely removed after Phase 9.7 diagnosis.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export function DevPerfForensics() {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const pathname = usePathname();
  const navClickRef = useRef<{ url: string; time: number } | null>(null);
  const activeRequestsRef = useRef<Map<string, { start: number; count: number }>>(new Map());
  const completedRequestsRef = useRef<Array<{ url: string; duration: number; time: number }>>([]);
  const longTasksRef = useRef<Array<{ duration: number; startTime: number }>>([]);
  const lastPathnameRef = useRef(pathname);

  // Monitor Fetch for API latency & duplicate request detection
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    const interceptedFetch: typeof window.fetch = async (input, init) => {
      const urlStr = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const startTime = performance.now();

      // Track duplicate concurrent requests
      const existing = activeRequestsRef.current.get(urlStr);
      if (existing) {
        existing.count += 1;
      } else {
        activeRequestsRef.current.set(urlStr, { start: startTime, count: 1 });
      }

      try {
        const response = await originalFetch(input, init);
        const duration = performance.now() - startTime;
        completedRequestsRef.current.push({ url: urlStr, duration, time: startTime });
        return response;
      } catch (err) {
        const duration = performance.now() - startTime;
        completedRequestsRef.current.push({ url: urlStr, duration, time: startTime });
        throw err;
      } finally {
        activeRequestsRef.current.delete(urlStr);
      }
    };

    window.fetch = interceptedFetch;

    // Observe Long Tasks (>50ms main thread blocks)
    let observer: PerformanceObserver | null = null;
    try {
      if ('PerformanceObserver' in window && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasksRef.current.push({
              duration: entry.duration,
              startTime: entry.startTime,
            });
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      }
    } catch {
      // PerformanceObserver unsupported
    }

    // Capture user click navigation start
    const handleGlobalClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith('//') && !anchor.hasAttribute('download')) {
        navClickRef.current = {
          url: href,
          time: performance.now(),
        };
      }
    };

    document.addEventListener('click', handleGlobalClick, { capture: true });

    return () => {
      window.fetch = originalFetch;
      observer?.disconnect();
      document.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, []);

  // Track route transition completion
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return;
    const prevPath = lastPathnameRef.current;
    lastPathnameRef.current = pathname;

    const renderEndTime = performance.now();
    const clickData = navClickRef.current;
    navClickRef.current = null;

    // Schedule measurement report on next frame when DOM has committed and painted
    requestAnimationFrame(() => {
      const paintTime = performance.now();
      const clickTime = clickData ? clickData.time : renderEndTime;
      const totalMs = Math.round(paintTime - clickTime);
      const navMs = clickData ? Math.round(renderEndTime - clickTime) : 0;
      const renderMs = Math.round(paintTime - renderEndTime);

      // Analyze requests that occurred during this navigation window
      const recentWindow = clickTime - 50;
      const navRequests = completedRequestsRef.current.filter((r) => r.time >= recentWindow);
      const apiDuration = navRequests.length > 0 ? Math.max(...navRequests.map((r) => r.duration)) : 0;

      // Duplicate request check
      const urlCounts: Record<string, number> = {};
      navRequests.forEach((r) => {
        const cleanUrl = r.url.split('?')[0];
        urlCounts[cleanUrl] = (urlCounts[cleanUrl] || 0) + 1;
      });
      const duplicateCount = Object.values(urlCounts).filter((c) => c > 1).reduce((acc, c) => acc + (c - 1), 0);

      // Long tasks during navigation
      const navLongTasks = longTasksRef.current.filter((t) => t.startTime >= recentWindow);

      const routeName =
        pathname === '/'
          ? 'Dashboard'
          : pathname.replace('/', '').charAt(0).toUpperCase() + pathname.slice(2);

      console.group(`%c[PERF] Route: ${routeName}`, 'color: #3b82f6; font-weight: bold; font-size: 13px;');
      console.log(`Route: ${routeName} (from ${prevPath})`);
      console.log(`Navigation: ${navMs} ms`);
      console.log(`API: ${Math.round(apiDuration)} ms`);
      console.log(`Render: ${renderMs} ms`);
      console.log(`Total: ${totalMs} ms`);
      console.log(`Requests: ${navRequests.length}`);
      console.log(`Duplicate requests: ${duplicateCount}`);
      if (navLongTasks.length > 0) {
        console.warn(`Long Tasks Detected (>50ms): ${navLongTasks.length}`, navLongTasks);
      }
      console.groupEnd();
    });
  }, [pathname]);

  return null;
}
