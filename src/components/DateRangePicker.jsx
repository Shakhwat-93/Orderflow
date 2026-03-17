import React, { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import './DateRangePicker.css';

const PRESETS = [
  { label: 'Today', getValue: () => ({ start: new Date(), end: new Date() }) },
  {
    label: 'Yesterday', getValue: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { start: d, end: d };
    }
  },
  {
    label: 'Last 7 Days', getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { start, end };
    }
  },
  {
    label: 'Last 30 Days', getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { start, end };
    }
  },
  {
    label: 'Last 90 Days', getValue: () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 90);
      return { start, end };
    }
  },
  {
    label: 'This Month', getValue: () => {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { start, end };
    }
  },
  {
    label: 'Last Month', getValue: () => {
      const d = new Date();
      const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const end = new Date(d.getFullYear(), d.getMonth(), 0);
      return { start, end };
    }
  },
  { label: 'Custom Date Range', isCustom: true }
];

export const DateRangePicker = ({ onChange, value }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('Last 30 Days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
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

  const handlePresetClick = (preset) => {
    setSelectedPreset(preset.label);
    if (!preset.isCustom) {
      const range = preset.getValue();
      onChange(range);
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

      {isOpen && (
        <div className="date-picker-dropdown liquid-glass">
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
      )}
    </div>
  );
};
