import { useState, useEffect } from 'react';
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
  ArrowRight,
  Truck,
  Zap,
  Key,
  Save
} from 'lucide-react';

export const Settings = () => {
  const { isAdmin } = useAuth();
  const [isResetLoading, setIsResetLoading] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [resetScope, setResetScope] = useState('all');
  const [resetDateRange, setResetDateRange] = useState({ start: null, end: null });

  // Courier Settings State
  const [isCourierLoading, setIsCourierLoading] = useState(true);
  const [isSavingCourier, setIsSavingCourier] = useState(false);
  const [courierSuccess, setCourierSuccess] = useState(false);
  const [courierConfig, setCourierConfig] = useState({
    api_key: '',
    secret_key: '',
    is_enabled: false,
    auto_dispatch: false
  });

  useEffect(() => {
    loadCourierConfig();
  }, []);

  const loadCourierConfig = async () => {
    setIsCourierLoading(true);
    try {
      const config = await api.getSystemConfig('courier_steadfast');
      if (config) {
        setCourierConfig(config);
      }
    } catch (err) {
      console.error('Failed to load courier config:', err);
    } finally {
      setIsCourierLoading(false);
    }
  };

  const handleSaveCourier = async () => {
    setIsSavingCourier(true);
    setError(null);
    try {
      await api.updateSystemConfig('courier_steadfast', courierConfig);
      setCourierSuccess(true);
      setTimeout(() => setCourierSuccess(false), 3000);
    } catch (err) {
      setError('Failed to save courier configuration.');
    } finally {
      setIsSavingCourier(false);
    }
  };

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
        {/* Courier Integration Card */}
        <section className="settings-card courier-card">
          <div className="card-header">
            <Truck size={20} />
            <h2>Courier Integration (Steadfast)</h2>
          </div>
          <div className="card-body">
            {isCourierLoading ? (
              <div className="card-loader">
                <Loader2 className="animate-spin" size={24} />
                <p>Loading integration settings...</p>
              </div>
            ) : (
              <div className="courier-settings-form">
                <div className="form-group">
                  <label><Key size={14} /> API Key</label>
                  <input 
                    type="password" 
                    value={courierConfig.api_key}
                    onChange={(e) => setCourierConfig({...courierConfig, api_key: e.target.value})}
                    placeholder="Enter Steadfast API Key"
                    className="premium-input"
                  />
                </div>
                
                <div className="form-group">
                  <label><ShieldAlert size={14} /> Secret Key</label>
                  <input 
                    type="password" 
                    value={courierConfig.secret_key}
                    onChange={(e) => setCourierConfig({...courierConfig, secret_key: e.target.value})}
                    placeholder="Enter Steadfast Secret Key"
                    className="premium-input"
                  />
                </div>

                <div className="toggles-group">
                  <div className="setting-toggle">
                    <div className="toggle-info">
                      <h3>Enable Integration</h3>
                      <p>Allow system to talk to Steadfast API.</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={courierConfig.is_enabled}
                        onChange={(e) => setCourierConfig({...courierConfig, is_enabled: e.target.checked})}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>

                  <div className="setting-toggle">
                    <div className="toggle-info">
                      <h3>Auto-Dispatch</h3>
                      <p>Submit to courier as soon as stock matches.</p>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={courierConfig.auto_dispatch}
                        onChange={(e) => setCourierConfig({...courierConfig, auto_dispatch: e.target.checked})}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                </div>

                <div className="form-actions">
                  <button 
                    className={`save-btn ${courierSuccess ? 'success' : ''}`}
                    onClick={handleSaveCourier}
                    disabled={isSavingCourier}
                  >
                    {isSavingCourier ? (
                      <Loader2 className="animate-spin" size={18} />
                    ) : courierSuccess ? (
                      <><CheckCircle size={18} /> Saved!</>
                    ) : (
                      <><Save size={18} /> Save Settings</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

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
