'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import '../styles/DashboardTimeLeftBadge.css';

/**
 * ELITE DASHBOARD COUNTDOWN STADIUM TIMER
 * Inspired by Taskplus Masterpiece & Linear Standard.
 * Renders a stadium pill with a glowing curved progress track and remaining operational time.
 * Supports both Light Mode and Dark Mode with zero layout shift or hydration flicker.
 */
export const DashboardTimeLeftBadge: React.FC = React.memo(() => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [mounted, setMounted] = useState(false);
  const [showSeconds, setShowSeconds] = useState(false);
  const [state, setState] = useState({
    hours: 0,
    mins: 0,
    secs: 0,
    progress: 90,
    isCompleted: false,
  });

  const calculateTime = useCallback(() => {
    const now = new Date();
    const target = new Date();
    target.setHours(23, 59, 59, 999);
    const diff = target.getTime() - now.getTime();

    if (diff <= 0) {
      setState({
        hours: 0,
        mins: 0,
        secs: 0,
        progress: 100,
        isCompleted: true,
      });
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    // Operational Day cycle: 24h elapsed progress (from 00:00 to 23:59)
    const totalDayMs = 24 * 60 * 60 * 1000;
    const elapsedMs = totalDayMs - diff;
    const rawProgress = (elapsedMs / totalDayMs) * 100;
    // Keep progress between 6% and 96% for clean rounded cap visibility
    const progress = Math.max(6, Math.min(96, Math.round(rawProgress)));

    setState({
      hours,
      mins,
      secs,
      progress,
      isCompleted: false,
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    calculateTime();

    // 1-second interval for smooth live countdown
    const timer = setInterval(calculateTime, 1000);
    return () => clearInterval(timer);
  }, [calculateTime]);

  const toggleFormat = () => {
    setShowSeconds(prev => !prev);
  };

  // Color & Theme definitions (guaranteed to render regardless of external CSS loading)
  const trackStroke = isDark ? '#21262d' : '#e2e8f0';
  const progressStroke = isDark ? '#ff3b5c' : '#e11d48';
  const progressFilter = isDark
    ? 'drop-shadow(0 0 5px rgba(255, 59, 92, 0.65)) drop-shadow(0 0 12px rgba(255, 59, 92, 0.3))'
    : 'drop-shadow(0 1px 3px rgba(225, 29, 72, 0.3))';
  const bgColor = isDark ? '#0d1117' : '#ffffff';
  const valColor = isDark ? '#ffffff' : '#0f172a';
  const labelColor = isDark ? '#8b949e' : '#64748b';
  const iconColor = progressStroke;

  // Pre-hydration placeholder to avoid SSR mismatch
  if (!mounted) {
    return (
      <div
        className="stadium-timer-badge system-time-card"
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '172px',
          height: '40px',
          padding: '0 16px',
          borderRadius: '9999px',
          backgroundColor: bgColor,
          boxShadow: isDark
            ? '0 2px 10px rgba(0,0,0,0.6)'
            : '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
        aria-hidden="true"
      >
        <div
          className="stadium-timer-content"
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
          }}
        >
          <Clock size={12} color={iconColor} className="stadium-timer-icon" />
          <div className="stadium-timer-skeleton" />
        </div>
      </div>
    );
  }

  // Format time display
  let timeVal = '';
  let timeLabel = 'remaining';

  if (state.isCompleted) {
    timeVal = '0h 00m';
    timeLabel = 'cycle done';
  } else if (showSeconds) {
    if (state.hours > 0) {
      timeVal = `${state.hours}h ${String(state.mins).padStart(2, '0')}m ${String(state.secs).padStart(2, '0')}s`;
    } else {
      timeVal = `${state.mins}m ${String(state.secs).padStart(2, '0')}s`;
    }
  } else {
    timeVal = `${state.hours}h ${state.mins}m`;
  }

  const tooltipText = `Operational Day: ${state.hours}h ${state.mins}m ${state.secs}s remaining until 11:59 PM BD Time (Click to toggle live seconds)`;

  return (
    <div
      className="stadium-timer-badge system-time-card"
      onClick={toggleFormat}
      title={tooltipText}
      role="button"
      tabIndex={0}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '172px',
        height: '40px',
        padding: '0 16px',
        borderRadius: '9999px',
        backgroundColor: bgColor,
        boxShadow: isDark
          ? '0 2px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)'
          : '0 1px 3px rgba(0,0,0,0.05), 0 2px 8px rgba(0,0,0,0.03)',
        cursor: 'pointer',
        userSelect: 'none',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleFormat();
        }
      }}
      aria-label={tooltipText}
    >
      <svg
        className="stadium-timer-svg"
        viewBox="0 0 172 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          overflow: 'visible',
        }}
      >
        {/* Background Track */}
        <path
          d="M 86 2.5 L 152 2.5 A 17.5 17.5 0 0 1 152 37.5 L 20 37.5 A 17.5 17.5 0 0 1 20 2.5 L 86 2.5 Z"
          className="stadium-timer-track"
          stroke={trackStroke}
          strokeWidth={3.2}
          fill="none"
        />
        {/* Active Animated Progress Arc */}
        <path
          d="M 86 2.5 L 152 2.5 A 17.5 17.5 0 0 1 152 37.5 L 20 37.5 A 17.5 17.5 0 0 1 20 2.5 L 86 2.5 Z"
          className="stadium-timer-progress"
          stroke={progressStroke}
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - state.progress}
          style={{
            filter: progressFilter,
            transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </svg>

      <div
        className="stadium-timer-content"
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          width: '100%',
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        <Clock size={12} color={iconColor} className="stadium-timer-icon" />
        <span
          className="stadium-timer-val"
          style={{
            fontSize: '0.86rem',
            fontWeight: 750,
            color: valColor,
            letterSpacing: '-0.02em',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {timeVal}
        </span>
        <span
          className="stadium-timer-label"
          style={{
            fontSize: '0.68rem',
            fontWeight: 550,
            color: labelColor,
            textTransform: 'capitalize',
            letterSpacing: '0.01em',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {timeLabel}
        </span>
      </div>
    </div>
  );
});

DashboardTimeLeftBadge.displayName = 'DashboardTimeLeftBadge';
