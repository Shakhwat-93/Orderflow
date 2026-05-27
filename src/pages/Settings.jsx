import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { DateRangePicker } from '../components/DateRangePicker';
import './Settings.css';
import {
  Settings as SettingsIcon, Trash2, AlertTriangle, CheckCircle, Loader2,
  ShieldAlert, Database, Truck, Zap, Key, Save, Type, Bell, Package,
  Clock, Shield, Sliders, Eye, EyeOff, ChevronRight, Activity,
  ToggleLeft, ToggleRight, RefreshCw, Lock, Palette
} from 'lucide-react';

// ── Sidebar nav sections ──
const NAV = [
  { id: 'general',     label: 'General',         icon: Palette,    desc: 'Branding & appearance' },
  { id: 'automation',  label: 'Automation',       icon: Zap,        desc: 'Order lifecycle rules' },
  { id: 'fraud',       label: 'Fraud Detection',  icon: Shield,     desc: 'Duplicate & anomaly rules' },
  { id: 'inventory',   label: 'Inventory Alerts', icon: Package,    desc: 'Stock threshold controls' },
  { id: 'courier',     label: 'Courier',          icon: Truck,      desc: 'Steadfast integration' },
  { id: 'alerts',      label: 'Alert Timers',     icon: Bell,       desc: 'Response & notification timers' },
  { id: 'danger',      label: 'Danger Zone',      icon: AlertTriangle, desc: 'System reset', danger: true },
];

// ── Reusable toggle ──
const Toggle = ({ checked, onChange, disabled }) => (
  <button
    type="button"
    className={`st-toggle ${checked ? 'on' : 'off'}`}
    onClick={() => !disabled && onChange(!checked)}
    disabled={disabled}
    aria-label="toggle"
  >
    <span className="st-toggle-thumb" />
  </button>
);

// ── Reusable number slider row ──
const SliderRow = ({ label, desc, value, min, max, step = 1, unit = 'hrs', onChange }) => (
  <div className="st-slider-row">
    <div className="st-slider-info">
      <span className="st-slider-label">{label}</span>
      <span className="st-slider-desc">{desc}</span>
    </div>
    <div className="st-slider-control">
      <span className="st-slider-val">{value}{unit}</span>
      <input
        type="range" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="st-range"
      />
      <div className="st-range-labels"><span>{min}{unit}</span><span>{max}{unit}</span></div>
    </div>
  </div>
);

// ── Section header ──
const SectionHead = ({ icon: Icon, title, desc }) => (
  <div className="st-section-head">
    <div className="st-section-icon"><Icon size={20} /></div>
    <div>
      <h2 className="st-section-title">{title}</h2>
      <p className="st-section-desc">{desc}</p>
    </div>
  </div>
);

// ── Save button ──
const SaveBtn = ({ onClick, saving, saved, disabled, label = 'Save Changes' }) => (
  <button
    className={`st-save-btn ${saved ? 'saved' : ''}`}
    onClick={onClick}
    disabled={saving || disabled}
  >
    {saving ? <Loader2 size={16} className="spin" /> : saved ? <><CheckCircle size={16} /> Saved!</> : <><Save size={16} /> {label}</>}
  </button>
);

// ── localStorage helpers for runtime configs ──
const LS_AUTOMATION = 'of_automation_config';
const LS_FRAUD      = 'of_fraud_config';
const LS_ALERTS     = 'of_alerts_config';
const LS_INVENTORY  = 'of_inventory_alert_config';

const loadLS = (key, defaults) => {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') }; }
  catch { return defaults; }
};
const saveLS = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// ──────────────────────────────────────────────────────────────────
export const Settings = () => {
  const { isAdmin } = useAuth();
  const { appName, isSaving: isSavingBranding, saveBranding } = useBranding();

  const [activeSection, setActiveSection] = useState('general');

  // ── Branding ──
  const [brandingName, setBrandingName] = useState(appName);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSaved, setBrandingSaved] = useState(false);
  useEffect(() => setBrandingName(appName), [appName]);

  // ── Automation Rules ──
  const [automation, setAutomation] = useState(() => loadLS(LS_AUTOMATION, {
    stale_new: 48, stale_pending: 72, stale_confirmed: 96, enabled: true
  }));
  const [autoSaving, setAutoSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  // ── Fraud Detection ──
  const [fraud, setFraud] = useState(() => loadLS(LS_FRAUD, {
    enabled: true, phone_check: true, address_check: true, similarity_threshold: 85
  }));
  const [fraudSaving, setFraudSaving] = useState(false);
  const [fraudSaved, setFraudSaved] = useState(false);

  // ── Inventory Alerts ──
  const [invAlert, setInvAlert] = useState(() => loadLS(LS_INVENTORY, {
    global_min_stock: 5, alert_enabled: true
  }));
  const [invSaving, setInvSaving] = useState(false);
  const [invSaved, setInvSaved] = useState(false);

  // ── Alert Timers ──
  const [alerts, setAlerts] = useState(() => loadLS(LS_ALERTS, {
    no_call_alert_mins: 20, no_call_alert_enabled: true,
    response_warn_mins: 15, sound_enabled: true
  }));
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertSaved, setAlertSaved] = useState(false);

  // ── Courier ──
  const [courierConfig, setCourierConfig] = useState({ api_key: '', secret_key: '', is_enabled: false, auto_dispatch: false });
  const [courierLoading, setCourierLoading] = useState(true);
  const [courierSaving, setCourierSaving] = useState(false);
  const [courierSaved, setCourierSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // ── Danger Zone ──
  const [showReset, setShowReset] = useState(false);
  const [resetScope, setResetScope] = useState('all');
  const [resetDateRange, setResetDateRange] = useState({ start: null, end: null });
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      setCourierLoading(true);
      try {
        const { data } = await supabase.from('system_config').select('value').eq('key', 'courier_steadfast').maybeSingle();
        if (data?.value) setCourierConfig(data.value);
      } catch (e) { console.warn(e); }
      finally { setCourierLoading(false); }
    })();
  }, []);

  // ── Save handlers ──
  const saveBrandingHandler = async () => {
    setBrandingSaving(true);
    try { await saveBranding({ app_name: brandingName }); setBrandingSaved(true); setTimeout(() => setBrandingSaved(false), 3000); }
    catch { setError('Branding save failed.'); } finally { setBrandingSaving(false); }
  };

  const saveAutomation = () => {
    setAutoSaving(true);
    saveLS(LS_AUTOMATION, automation);
    setTimeout(() => { setAutoSaving(false); setAutoSaved(true); setTimeout(() => setAutoSaved(false), 2500); }, 400);
  };

  const saveFraud = () => {
    setFraudSaving(true);
    saveLS(LS_FRAUD, fraud);
    setTimeout(() => { setFraudSaving(false); setFraudSaved(true); setTimeout(() => setFraudSaved(false), 2500); }, 400);
  };

  const saveInv = () => {
    setInvSaving(true);
    saveLS(LS_INVENTORY, invAlert);
    setTimeout(() => { setInvSaving(false); setInvSaved(true); setTimeout(() => setInvSaved(false), 2500); }, 400);
  };

  const saveAlerts = () => {
    setAlertSaving(true);
    saveLS(LS_ALERTS, alerts);
    setTimeout(() => { setAlertSaving(false); setAlertSaved(true); setTimeout(() => setAlertSaved(false), 2500); }, 400);
  };

  const saveCourier = async () => {
    setCourierSaving(true);
    try {
      await supabase.from('system_config').upsert({ key: 'courier_steadfast', value: courierConfig }, { onConflict: 'key' });
      setCourierSaved(true); setTimeout(() => setCourierSaved(false), 3000);
    } catch { setError('Courier save failed.'); } finally { setCourierSaving(false); }
  };

  const handleReset = async () => {
    if (resetPassword !== 'Rasel123@#') { setError('Incorrect password.'); return; }
    setResetLoading(true); setError(null);
    try {
      if (resetScope === 'date-range' && (!resetDateRange.start || !resetDateRange.end))
        throw new Error('Select a valid date range.');
      await api.resetSystem(isAdmin, { scope: resetScope, dateRange: resetDateRange });
      localStorage.setItem('activity_cleared_at', new Date().toISOString());
      setResetSuccess(true); setShowReset(false); setResetPassword('');
      setTimeout(() => setResetSuccess(false), 5000);
    } catch (err) { setError(err.message || 'Reset failed.'); }
    finally { setResetLoading(false); }
  };

  // ── Render section content ──
  const renderSection = () => {
    switch (activeSection) {
      // ── GENERAL ──
      case 'general': return (
        <div className="st-section-body">
          <SectionHead icon={Palette} title="App Branding" desc="Customize how your app appears across all panels and the login screen." />
          <div className="st-field-group">
            <label className="st-label">Application Name</label>
            <input
              className="st-input"
              value={brandingName}
              onChange={e => setBrandingName(e.target.value)}
              placeholder="e.g. OrderFlow Pro"
              maxLength={40}
            />
            <p className="st-hint">Shown in sidebar, browser tab, and login screen.</p>
          </div>
          <div className="st-preview-row">
            <span className="st-preview-label">Live Preview</span>
            <span className="st-preview-badge">{brandingName.trim() || 'OrderFlow'}</span>
          </div>
          <div className="st-actions">
            <SaveBtn onClick={saveBrandingHandler} saving={brandingSaving} saved={brandingSaved}
              disabled={!brandingName.trim() || brandingName.trim() === appName} />
          </div>
        </div>
      );

      // ── AUTOMATION ──
      case 'automation': return (
        <div className="st-section-body">
          <SectionHead icon={Zap} title="Automation Rules" desc="Control when orders get flagged as stale. These thresholds trigger warnings in OrdersBoard." />
          <div className="st-toggle-row">
            <div>
              <span className="st-toggle-label">Enable Automation Engine</span>
              <span className="st-toggle-desc">Scan orders and flag stale ones automatically.</span>
            </div>
            <Toggle checked={automation.enabled} onChange={v => setAutomation(a => ({ ...a, enabled: v }))} />
          </div>
          <div className={`st-sliders-block ${!automation.enabled ? 'disabled' : ''}`}>
            <SliderRow label="New Order Stale After" desc="Flag NEW orders that haven't been actioned." value={automation.stale_new} min={12} max={120} onChange={v => setAutomation(a => ({ ...a, stale_new: v }))} />
            <SliderRow label="Pending Call Stale After" desc="Flag Pending Call orders with no update." value={automation.stale_pending} min={24} max={168} onChange={v => setAutomation(a => ({ ...a, stale_pending: v }))} />
            <SliderRow label="Confirmed Stale After" desc="Flag Confirmed orders not reaching Factory." value={automation.stale_confirmed} min={24} max={240} onChange={v => setAutomation(a => ({ ...a, stale_confirmed: v }))} />
          </div>
          <div className="st-actions">
            <SaveBtn onClick={saveAutomation} saving={autoSaving} saved={autoSaved} />
          </div>
        </div>
      );

      // ── FRAUD ──
      case 'fraud': return (
        <div className="st-section-body">
          <SectionHead icon={Shield} title="Fraud Detection" desc="Configure duplicate detection and address similarity rules for incoming orders." />
          <div className="st-toggle-row">
            <div>
              <span className="st-toggle-label">Enable Fraud Detection</span>
              <span className="st-toggle-desc">Scan all orders for duplicates on creation.</span>
            </div>
            <Toggle checked={fraud.enabled} onChange={v => setFraud(f => ({ ...f, enabled: v }))} />
          </div>
          <div className={`st-sliders-block ${!fraud.enabled ? 'disabled' : ''}`}>
            <div className="st-toggle-row sub">
              <div>
                <span className="st-toggle-label">Phone Duplicate Check</span>
                <span className="st-toggle-desc">Flag exact phone matches across orders.</span>
              </div>
              <Toggle checked={fraud.phone_check} onChange={v => setFraud(f => ({ ...f, phone_check: v }))} />
            </div>
            <div className="st-toggle-row sub">
              <div>
                <span className="st-toggle-label">Address Similarity Check</span>
                <span className="st-toggle-desc">Flag orders with very similar delivery addresses.</span>
              </div>
              <Toggle checked={fraud.address_check} onChange={v => setFraud(f => ({ ...f, address_check: v }))} />
            </div>
            <SliderRow
              label="Address Similarity Threshold"
              desc="Orders above this % similarity will be flagged."
              value={fraud.similarity_threshold}
              min={60} max={99} unit="%"
              onChange={v => setFraud(f => ({ ...f, similarity_threshold: v }))}
            />
          </div>
          <div className="st-actions">
            <SaveBtn onClick={saveFraud} saving={fraudSaving} saved={fraudSaved} />
          </div>
        </div>
      );

      // ── INVENTORY ALERTS ──
      case 'inventory': return (
        <div className="st-section-body">
          <SectionHead icon={Package} title="Inventory Alerts" desc="Set global minimum stock alert level for all products in your inventory." />
          <div className="st-toggle-row">
            <div>
              <span className="st-toggle-label">Enable Low Stock Alerts</span>
              <span className="st-toggle-desc">Show warnings when products fall below threshold.</span>
            </div>
            <Toggle checked={invAlert.alert_enabled} onChange={v => setInvAlert(i => ({ ...i, alert_enabled: v }))} />
          </div>
          <div className={`st-sliders-block ${!invAlert.alert_enabled ? 'disabled' : ''}`}>
            <SliderRow
              label="Global Minimum Stock Level"
              desc="Products below this level will show 'Low Stock' badge."
              value={invAlert.global_min_stock}
              min={1} max={100} unit=" units"
              onChange={v => setInvAlert(i => ({ ...i, global_min_stock: v }))}
            />
          </div>
          <div className="st-info-card">
            <Activity size={15} />
            <span>Individual product thresholds override this global setting.</span>
          </div>
          <div className="st-actions">
            <SaveBtn onClick={saveInv} saving={invSaving} saved={invSaved} />
          </div>
        </div>
      );

      // ── COURIER ──
      case 'courier': return (
        <div className="st-section-body">
          <SectionHead icon={Truck} title="Courier Integration" desc="Connect Steadfast courier API for automatic order dispatch and tracking." />
          {courierLoading ? (
            <div className="st-loading-row"><Loader2 size={20} className="spin" /><span>Loading configuration...</span></div>
          ) : (
            <>
              <div className="st-field-group">
                <label className="st-label"><Key size={13} /> API Key</label>
                <div className="st-input-eye">
                  <input className="st-input" type={showApiKey ? 'text' : 'password'} value={courierConfig.api_key} onChange={e => setCourierConfig(c => ({ ...c, api_key: e.target.value }))} placeholder="Enter Steadfast API Key" />
                  <button className="st-eye-btn" onClick={() => setShowApiKey(v => !v)} type="button">{showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
              <div className="st-field-group">
                <label className="st-label"><Lock size={13} /> Secret Key</label>
                <div className="st-input-eye">
                  <input className="st-input" type={showSecretKey ? 'text' : 'password'} value={courierConfig.secret_key} onChange={e => setCourierConfig(c => ({ ...c, secret_key: e.target.value }))} placeholder="Enter Steadfast Secret Key" />
                  <button className="st-eye-btn" onClick={() => setShowSecretKey(v => !v)} type="button">{showSecretKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
              <div className="st-toggle-row">
                <div><span className="st-toggle-label">Enable Integration</span><span className="st-toggle-desc">Allow system to communicate with Steadfast API.</span></div>
                <Toggle checked={courierConfig.is_enabled} onChange={v => setCourierConfig(c => ({ ...c, is_enabled: v }))} />
              </div>
              <div className="st-toggle-row">
                <div><span className="st-toggle-label">Auto-Dispatch</span><span className="st-toggle-desc">Submit orders to courier when stock is matched.</span></div>
                <Toggle checked={courierConfig.auto_dispatch} onChange={v => setCourierConfig(c => ({ ...c, auto_dispatch: v }))} />
              </div>
              <div className="st-actions">
                <SaveBtn onClick={saveCourier} saving={courierSaving} saved={courierSaved} />
              </div>
            </>
          )}
        </div>
      );

      // ── ALERTS ──
      case 'alerts': return (
        <div className="st-section-body">
          <SectionHead icon={Bell} title="Alert Timers" desc="Configure timing rules for admin alerts, response warnings, and notification sounds." />
          <div className="st-toggle-row">
            <div><span className="st-toggle-label">No-Call Admin Alert</span><span className="st-toggle-desc">Alert admin when no agent calls an order within the set time.</span></div>
            <Toggle checked={alerts.no_call_alert_enabled} onChange={v => setAlerts(a => ({ ...a, no_call_alert_enabled: v }))} />
          </div>
          <div className={`st-sliders-block ${!alerts.no_call_alert_enabled ? 'disabled' : ''}`}>
            <SliderRow
              label="No-Call Alert Threshold"
              desc="Alert fires when order is uncalled for this long."
              value={alerts.no_call_alert_mins}
              min={5} max={120} unit=" min"
              onChange={v => setAlerts(a => ({ ...a, no_call_alert_mins: v }))}
            />
          </div>
          <div className="st-toggle-row">
            <div><span className="st-toggle-label">Notification Sounds</span><span className="st-toggle-desc">Play audio when new orders or alerts arrive.</span></div>
            <Toggle checked={alerts.sound_enabled} onChange={v => setAlerts(a => ({ ...a, sound_enabled: v }))} />
          </div>
          <SliderRow
            label="Response Time Warning"
            desc="Warn agents when order response time exceeds this."
            value={alerts.response_warn_mins}
            min={5} max={60} unit=" min"
            onChange={v => setAlerts(a => ({ ...a, response_warn_mins: v }))}
          />
          <div className="st-actions">
            <SaveBtn onClick={saveAlerts} saving={alertSaving} saved={alertSaved} />
          </div>
        </div>
      );

      // ── DANGER ──
      case 'danger': return (
        <div className="st-section-body">
          <SectionHead icon={AlertTriangle} title="Danger Zone" desc="Permanently delete system data. These actions cannot be undone." />
          {resetSuccess && (
            <div className="st-status success"><CheckCircle size={15} /> System reset initiated successfully.</div>
          )}
          {error && (
            <div className="st-status error"><ShieldAlert size={15} /> {error}</div>
          )}
          <div className="st-danger-card">
            <div className="st-danger-info">
              <h3>Reset System Data</h3>
              <p>Permanently delete orders, logs, and notifications — either all-time or within a selected date range.</p>
            </div>
            {isAdmin ? (
              <button className="st-danger-btn" onClick={() => { setShowReset(true); setResetPassword(''); setError(null); }}>
                <Trash2 size={16} /> Reset System
              </button>
            ) : (
              <div className="st-restricted-badge"><Lock size={13} /> Admin Only</div>
            )}
          </div>

          {showReset && (
            <div className="st-modal-overlay" onClick={() => setShowReset(false)}>
              <div className="st-modal" onClick={e => e.stopPropagation()}>
                <div className="st-modal-icon"><AlertTriangle size={36} /></div>
                <h2>Are you absolutely sure?</h2>
                <p>This cannot be undone. Choose your reset scope:</p>
                <div className="st-scope-options">
                  {[['all', 'Full Reset — All data & stock'], ['date-range', 'Date Range Reset — Orders & logs']].map(([val, lab]) => (
                    <label key={val} className={`st-scope-opt ${resetScope === val ? 'active' : ''}`}>
                      <input type="radio" name="scope" value={val} checked={resetScope === val} onChange={() => setResetScope(val)} />
                      <span>{lab}</span>
                    </label>
                  ))}
                </div>
                {resetScope === 'date-range' && (
                  <div className="st-datepicker-wrap">
                    <DateRangePicker value={resetDateRange} onChange={setResetDateRange} />
                  </div>
                )}
                <div className="st-field-group" style={{ marginTop: 16 }}>
                  <label className="st-label">Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="st-input"
                    type="password"
                    value={resetPassword}
                    onChange={e => { setResetPassword(e.target.value); setError(null); }}
                    placeholder="Enter admin password"
                    style={{ borderColor: error ? '#ef4444' : undefined }}
                  />
                  {error && <p className="st-hint error">{error}</p>}
                </div>
                <div className="st-modal-actions">
                  <button className="st-cancel-btn" onClick={() => setShowReset(false)}>Cancel</button>
                  <button className="st-confirm-danger-btn" onClick={handleReset} disabled={resetLoading}>
                    {resetLoading ? <Loader2 size={16} className="spin" /> : 'Yes, Reset System'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );

      default: return null;
    }
  };

  return (
    <div className="st-root">
      {/* ── Sidebar ── */}
      <aside className="st-sidebar">
        <div className="st-sidebar-head">
          <div className="st-sidebar-icon"><SettingsIcon size={18} /></div>
          <div>
            <h1 className="st-sidebar-title">Settings</h1>
            <p className="st-sidebar-sub">System Configuration</p>
          </div>
        </div>
        <nav className="st-nav">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                className={`st-nav-item ${active ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
                onClick={() => { setActiveSection(item.id); setError(null); }}
              >
                <div className="st-nav-icon"><Icon size={16} /></div>
                <div className="st-nav-text">
                  <span className="st-nav-label">{item.label}</span>
                  <span className="st-nav-desc">{item.desc}</span>
                </div>
                <ChevronRight size={14} className="st-nav-arrow" />
              </button>
            );
          })}
        </nav>
        <div className="st-sidebar-footer">
          <div className="st-version-badge">
            <Activity size={11} />
            <span>OrderFlow v2.0 Elite</span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="st-main">
        <div className="st-main-inner">
          {renderSection()}
        </div>
      </main>
    </div>
  );
};
