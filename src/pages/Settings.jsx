import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { DateRangePicker } from '../components/DateRangePicker';
import './Settings.css';
import {
  Settings as SettingsIcon,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ShieldAlert,
  Database,
  ArrowRight
} from 'lucide-react';

export const Settings = () => {
  const { isAdmin } = useAuth();
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [resetScope, setResetScope] = useState('all');
  const [resetDateRange, setResetDateRange] = useState({ start: null, end: null });

  const handleResetSystem = async () => {
    setIsResetLoading(true);
    setError(null);
    try {
      if (resetScope === 'date-range' && (!resetDateRange.start || !resetDateRange.end)) {
        throw new Error('Please select a valid date range for scoped reset.');
      }

      await api.resetSystem(isAdmin, {
        scope: resetScope,
        dateRange: resetDateRange
      });

      // Local reset marker so activity/notification UI clears immediately
      localStorage.setItem('activity_cleared_at', new Date().toISOString());
      setResetSuccess(true);
      setShowConfirmModal(false);
      setTimeout(() => setResetSuccess(false), 5000);
    } catch (err) {
      setError(err.message || 'System reset failed. Please check permissions.');
    } finally {
      setIsResetLoading(false);
    }
  };


  return (
    <div className="settings-container">
      <header className="settings-header">
        <div className="header-icon">
          <SettingsIcon size={24} />
        </div>
        <div className="header-text">
          <h1>System Settings</h1>
          <p>Manage core system configuration and maintenance.</p>
        </div>
      </header>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="card-header">
            <Database size={20} />
            <h2>System Maintenance</h2>
          </div>
          <div className="card-body">
            <div className="settings-item">
              <div className="item-info">
                <h3>Activity Logs</h3>
                <p>View and audit all system activities.</p>
              </div>
              <button className="secondary-btn">
                View Logs <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </section>

        {isAdmin && (
          <section className="settings-card danger-zone">
            <div className="card-header">
              <AlertTriangle size={20} />
              <h2>Danger Zone</h2>
            </div>
            <div className="card-body">
              <div className="settings-item">
                <div className="item-info">
                  <p>
                    Permanently delete orders, logs, and notifications (all-time or by selected date range).
                    <span className="warning-text">This action is irreversible.</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowConfirmModal(true)}
                  className="danger-btn"
                >
                  <Trash2 size={18} />
                  Reset System
                </button>
              </div>

              {error && (
                <div className="status-message error">
                  <ShieldAlert size={16} /> {error}
                </div>
              )}

              {resetSuccess && (
                <div className="status-message success">
                  <CheckCircle size={16} /> System reset initiated successfully.
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-icon warning">
              <AlertTriangle size={40} />
            </div>
            <h2>Are you absolutely sure?</h2>
            <p>
              This reset action is irreversible. Choose full reset or date-range reset.
            </p>

            <div className="reset-scope-options">
              <label className={`scope-option ${resetScope === 'all' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="resetScope"
                  value="all"
                  checked={resetScope === 'all'}
                  onChange={() => setResetScope('all')}
                />
                <span>Full Reset (All Data + Stock)</span>
              </label>

              <label className={`scope-option ${resetScope === 'date-range' ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="resetScope"
                  value="date-range"
                  checked={resetScope === 'date-range'}
                  onChange={() => setResetScope('date-range')}
                />
                <span>Date Range Reset (Orders, Logs, Notifications)</span>
              </label>
            </div>

            {resetScope === 'date-range' && (
              <div className="reset-date-picker-wrap">
                <DateRangePicker value={resetDateRange} onChange={setResetDateRange} />
              </div>
            )}

            <div className="modal-actions">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="cancel-btn"
              >
                No, Keep Data
              </button>
              <button
                onClick={handleResetSystem}
                disabled={isResetLoading}
                className="confirm-btn-danger"
              >
                {isResetLoading ? <Loader2 className="animate-spin" /> : 'Yes, Reset System'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
