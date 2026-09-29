'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';

export interface AuthLoaderProps {
  className?: string;
}

export const AuthLoader: React.FC<AuthLoaderProps> = ({ className = '' }) => {
  const { theme } = useTheme();
  const [isRegistered, setIsRegistered] = useState(false);
  const [pinwheelSize, setPinwheelSize] = useState(175);
  const [pinwheelStroke, setPinwheelStroke] = useState(7.5);

  useEffect(() => {
    let isMounted = true;
    import('ldrs')
      .then(({ pinwheel }) => {
        if (!isMounted) return;
        try {
          pinwheel.register();
        } catch {
          // Custom element already registered in window
        }
        setIsRegistered(true);
      })
      .catch((err) => {
        console.error('Failed to load pinwheel loader:', err);
      });

    const updateSize = () => {
      if (typeof window !== 'undefined') {
        if (window.innerWidth < 768) {
          setPinwheelSize(85);
          setPinwheelStroke(5);
        } else {
          // 5x size on desktop and laptop displays (35 * 5 = 175px)
          setPinwheelSize(175);
          setPinwheelStroke(7.5);
        }
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);

    return () => {
      isMounted = false;
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  const pinwheelColor = theme === 'dark' ? 'white' : 'black';

  return (
    <div
      className={`auth-loading-screen min-h-screen w-full flex flex-col items-center justify-center p-6 select-none ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Hold on , Be ready -"
    >
      <span className="sr-only">Hold on , Be ready -</span>

      <div className="flex flex-col items-center justify-center text-center">
        {/* UI Ball Pinwheel Loader — 5x enlarged on desktop/laptop */}
        <div
          className="auth-pinwheel-container flex items-center justify-center mb-8 sm:mb-10"
          style={{ minHeight: `${pinwheelSize}px`, minWidth: `${pinwheelSize}px` }}
          aria-hidden="true"
        >
          {isRegistered ? (
            <l-pinwheel
              size={pinwheelSize}
              stroke={pinwheelStroke}
              speed="0.9"
              color={pinwheelColor}
            ></l-pinwheel>
          ) : (
            <div style={{ width: `${pinwheelSize}px`, height: `${pinwheelSize}px` }} />
          )}
        </div>

        {/* Text: "Hold on , Be ready -" */}
        <h1 className="auth-loading-title text-[20px] sm:text-[25px] md:text-[28px] font-semibold tracking-tight text-center leading-snug">
          <span className="auth-text-lead text-slate-900 dark:text-slate-100">
            Hold on ,{' '}
          </span>
          <span className="auth-text-accent text-indigo-600 dark:text-indigo-400">
            Be ready -
          </span>
        </h1>
      </div>
    </div>
  );
};

export default AuthLoader;
