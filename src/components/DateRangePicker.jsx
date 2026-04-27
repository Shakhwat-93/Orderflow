import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import './DateRangePicker.css';

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

const sameCalendarDay = (left, right) => (
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()
);

const sameMonth = (left, right) => (
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth()
);

const inferPresetLabel = (range) => {
  if (!range?.start || !range?.end) {
    return 'All Time';
  }

  const start = new Date(range.start);
  const end = new Date(range.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Custom Date Range';
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStart = startOfDay(yesterday);
  const yesterdayEnd = endOfDay(yesterday);
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = startOfMonth(lastMonthDate);
  const lastMonthEnd = endOfMonth(lastMonthDate);

  if (start.getTime() === todayStart.getTime() && end.getTime() === todayEnd.getTime()) {
    return 'Today';
  }

  if (start.getTime() === yesterdayStart.getTime() && end.getTime() === yesterdayEnd.getTime()) {
    return 'Yesterday';
  }

  if (start.getTime() === thisMonthStart.getTime() && end.getTime() === thisMonthEnd.getTime()) {
    return 'This Month';
  }

  if (start.getTime() === lastMonthStart.getTime() && end.getTime() === lastMonthEnd.getTime()) {
    return 'Last Month';
  }

  const diffDays = Math.round((todayEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (sameCalendarDay(end, todayEnd) && diffDays === 6) {
    return 'Last 7 Days';
  }

  if (sameCalendarDay(end, todayEnd) && diffDays === 29) {
    return 'Last 30 Days';
  }

  if (sameCalendarDay(end, todayEnd) && diffDays === 89) {
    return 'Last 90 Days';
  }

  if (sameCalendarDay(start, end)) {
    if (sameCalendarDay(start, now)) return 'Today';
    if (sameCalendarDay(start, yesterday)) return 'Yesterday';
  }

  if (sameMonth(start, end) && sameMonth(start, now)) {
    return 'This Month';
  }

  return 'Custom Date Range';
};

const PRESETS = [
  { label: 'All Time', getValue: () => ({ start: null, end: null }) },
  { label: 'Today', getValue: () => {
    const now = new Date();
    return { start: startOfDay(now), end: endOfDay(now) };
  } },
  {
    label: 'Yesterday', getValue: () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    }
  },
  {
    label: 'Last 7 Days', getValue: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
  },
  {
    label: 'Last 30 Days', getValue: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
  },
  {
    label: 'Last 90 Days', getValue: () => {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 89);
      return { start: startOfDay(start), end: endOfDay(today) };
    }
  },
  {
    label: 'This Month', getValue: () => {
      const now = new Date();
      return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  },
  {
    label: 'Last Month', getValue: () => {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
  },
  { label: 'Custom Date Range', isCustom: true }
];

export const DateRangePicker = ({ onChange, value }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(() => inferPresetLabel(value));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isMobileSheet, setIsMobileSheet] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 767 : false
  ));
  const containerRef = useRef(null);

  const toInputDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  };

  const toStartOfDay = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const toEndOfDay = (dateStr) => {
    const d = new Date(dateStr);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsMobileSheet(window.innerWidth <= 767);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const inferred = inferPresetLabel(value);
    setSelectedPreset(inferred);

    if (inferred === 'Custom Date Range') {
      setCustomStart(toInputDate(value?.start));
      setCustomEnd(toInputDate(value?.end));
    }
  }, [value]);

  const handlePresetClick = (preset) => {
    setSelectedPreset(preset.label);
    if (!preset.isCustom) {
      const range = preset.getValue();
      onChange(range);
      if (preset.label === 'All Time') {
        setCustomStart('');
        setCustomEnd('');
      }
      setIsOpen(false);
    } else {
      setCustomStart(toInputDate(value?.start));
      setCustomEnd(toInputDate(value?.end));
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getDisplayLabel = () => {
    if (value?.start && value?.end && selectedPreset === 'Custom Date Range') {
      return `${formatDate(value.start)} - ${formatDate(value.end)}`;
    }
    return selectedPreset || 'Select Date Range';
  };

  const handleApplyCustomRange = () => {
    if (!customStart || !customEnd) return;

    const start = toStartOfDay(customStart);
    const end = toEndOfDay(customEnd);

    if (start > end) return;

    onChange({ start, end });
    setSelectedPreset('Custom Date Range');
    setIsOpen(false);
  };

  const dropdownContent = (
    <div className={`date-picker-dropdown liquid-glass ${isMobileSheet ? 'mobile-sheet' : ''}`}>
      <div className="date-picker-layout">
        <div className="presets-sidebar">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className={`preset-item ${selectedPreset === preset.label ? 'active' : ''}`}
              onClick={() => handlePresetClick(preset)}
            >
              {preset.label}
              {selectedPreset === preset.label && <Check size={14} className="check-icon" />}
            </button>
          ))}
        </div>

        <div className="calendar-panel">
          <div className="calendar-header">
            <span className="current-month">
              {selectedPreset === 'Custom Date Range' ? 'Custom Date Range' : selectedPreset}
            </span>
          </div>

          <div className="custom-date-inputs">
            <label>
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label>
              <span>End Date</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </div>

          <div className="calendar-footer">
            <button className="btn-cancel" onClick={() => setIsOpen(false)}>Cancel</button>
            <button
              className="btn-apply"
              onClick={handleApplyCustomRange}
              disabled={!customStart || !customEnd || new Date(customStart) > new Date(customEnd)}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="date-range-picker-container" ref={containerRef}>
      <button
        className={`date-picker-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <div className="trigger-content">
          <Calendar size={18} className="trigger-icon" />
          <span className="trigger-label">{getDisplayLabel()}</span>
        </div>
        <ChevronDown size={16} className={`chevron ${isOpen ? 'rotate' : ''}`} />
      </button>

      {isOpen && !isMobileSheet && dropdownContent}
      {isOpen && isMobileSheet && typeof document !== 'undefined' && createPortal(
        <div className="date-picker-mobile-overlay" onClick={() => setIsOpen(false)}>
          <div className="date-picker-mobile-sheet" onClick={(event) => event.stopPropagation()}>
            <div className="date-picker-mobile-handle" />
            {dropdownContent}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
