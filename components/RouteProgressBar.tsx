'use client';

import React, { useEffect, useState, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * RouteProgressBar
 * Software-style 2.5px top progress indicator.
 * Provides instant tactile feedback on navigation clicks without blocking the UI.
 */
export function RouteProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const finishTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Complete and hide progress bar whenever route completes changing
  useEffect(() => {
    if (loading) {
      setProgress(100);
      finishTimerRef.current = setTimeout(() => {
        setLoading(false);
        setProgress(0);
      }, 250);
    }
    return () => {
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, [pathname, searchParams]);

  // Listen to clicks on navigation links to start progress bar instantly
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      // Only trigger for internal route links that differ from current location
      if (
        href &&
        href.startsWith('/') &&
        !href.startsWith('//') &&
        !target.hasAttribute('download') &&
        target.getAttribute('target') !== '_blank'
      ) {
        const url = new URL(href, window.location.origin);
        if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
          if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
          if (timerRef.current) clearInterval(timerRef.current);

          // Schedule progress bar start asynchronously so Link navigation dispatch is never blocked
          requestAnimationFrame(() => {
            setLoading(true);
            setProgress(25);

            // Simulated smooth progress trickle
            timerRef.current = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 85) {
                  if (timerRef.current) clearInterval(timerRef.current);
                  return 85;
                }
                return prev + Math.floor(Math.random() * 15 + 5);
              });
            }, 150);
          });
        }
      }
    };

    document.addEventListener('click', handleClick);
    return () => {
      document.removeEventListener('click', handleClick);
      if (timerRef.current) clearInterval(timerRef.current);
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
    };
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2.5px',
        zIndex: 999999,
        pointerEvents: 'none',
        background: 'transparent',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #06b6d4 100%)',
          boxShadow: '0 0 10px rgba(99, 102, 241, 0.7), 0 0 5px rgba(6, 182, 212, 0.5)',
          transition: progress === 100 ? 'width 200ms ease-out, opacity 250ms ease-out' : 'width 200ms ease-out',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}

export default RouteProgressBar;
