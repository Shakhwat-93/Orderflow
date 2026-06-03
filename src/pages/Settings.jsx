import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { DateRangePicker } from '../components/DateRangePicker';
import './Settings.css';
import {
  Settings as SettingsIcon, Trash2, AlertTriangle, CheckCircle, Loader2,
  ShieldAlert, Database, Truck, Zap, Key, Save, Type, Bell, Package,
  Clock, Shield, Sliders, Eye, EyeOff, ChevronRight, ChevronLeft, Activity,
  ToggleLeft, ToggleRight, RefreshCw, Lock, Palette, Download
} from 'lucide-react';

// ── Sidebar nav sections ──
const NAV = [
  { id: 'general',     label: 'General',         icon: Palette,    desc: 'Branding & appearance' },
  { id: 'automation',  label: 'Automation',       icon: Zap,        desc: 'Order lifecycle rules' },
  { id: 'fraud',       label: 'Fraud Detection',  icon: Shield,     desc: 'Duplicate & anomaly rules' },
  { id: 'inventory',   label: 'Inventory Alerts', icon: Package,    desc: 'Stock threshold controls' },
  { id: 'courier',     label: 'Courier',          icon: Truck,      desc: 'Steadfast integration' },
  { id: 'alerts',      label: 'Alert Timers',     icon: Bell,       desc: 'Response & notification timers' },
  { id: 'update',      label: 'App Updates',      icon: RefreshCw,  desc: 'OTA Updates & Version Center' },
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
  const { user, profile, isAdmin } = useAuth();
  const { appName, isSaving: isSavingBranding, saveBranding } = useBranding();

  const location = useLocation();

  const [activeSection, setActiveSection] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('section') || 'general';
  });

  const [currentMobileView, setCurrentMobileView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('section') ? 'detail' : 'master';
  });

  const [updatingState, setUpdatingState] = useState('idle');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sec = params.get('section');
    if (sec) {
      setActiveSection(sec);
      setCurrentMobileView('detail');
    }
  }, [location.search]);

  // ── App Updates OTA ──
  const CURRENT_VERSION_CODE = 2;
  const CURRENT_VERSION_NAME = "2.0.1";
  const [remoteVersion, setRemoteVersion] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [publishSaving, setPublishSaving] = useState(false);
  const [publishSaved, setPublishSaved] = useState(false);

  // Form states for releasing new updates (Admins only)
  const [formCode, setFormCode] = useState(CURRENT_VERSION_CODE + 1);
  const [formName, setFormName] = useState("2.1.0");
  const [formApkUrl, setFormApkUrl] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const fetchRemoteVersion = useCallback(async () => {
    setCheckingUpdate(true);
    setUpdateError(null);
    try {
      const config = await api.getSystemConfig('app_version');
      if (config) {
        setRemoteVersion(config);
        setFormCode((Number(config.versionCode) || CURRENT_VERSION_CODE) + 1);
        setFormName(config.versionName || "2.1.0");
        setFormApkUrl(config.apkUrl || "");
        setFormNotes(config.releaseNotes || "");
      } else {
        const initVal = {
          versionCode: CURRENT_VERSION_CODE,
          versionName: CURRENT_VERSION_NAME,
          apkUrl: "https://github.com/Shakhwat-93/Orderflow/actions",
          releaseNotes: "Initial elite production release of OrderFlow App."
        };
        setRemoteVersion(initVal);
      }
    } catch (err) {
      console.error('Error checking updates:', err);
      setUpdateError('Failed to retrieve server version. Check connection.');
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    fetchRemoteVersion();
  }, [fetchRemoteVersion]);

  const handlePublishRelease = async () => {
    const finalApkUrl = formApkUrl.trim() || "https://github.com/Shakhwat-93/Orderflow/actions";
    setPublishSaving(true);
    setPublishSaved(false);
    try {
      const payload = {
        versionCode: Number(formCode),
        versionName: formName.trim(),
        apkUrl: finalApkUrl,
        releaseNotes: formNotes.trim(),
        publishedAt: new Date().toISOString(),
        publishedBy: profile?.name || 'Admin'
      };

      await api.updateSystemConfig('app_version', payload);
      setRemoteVersion(payload);
      setPublishSaved(true);
      setTimeout(() => setPublishSaved(false), 3000);
    } catch (err) {
      console.error('Failed to publish release:', err);
      alert('Failed to publish release: ' + err.message);
    } finally {
      setPublishSaving(false);
    }
  };

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

  // ── Fraud Checker BD ──
  const [fraudCheckerConfig, setFraudCheckerConfig] = useState({ api_key: '', api_url: 'https://fraudchecker.link/api/check', is_enabled: false });
  const [fraudCheckerLoading, setFraudCheckerLoading] = useState(true);
  const [fraudCheckerSaving, setFraudCheckerSaving] = useState(false);
  const [fraudCheckerSaved, setFraudCheckerSaved] = useState(false);
  const [showFraudToken, setShowFraudToken] = useState(false);

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
      setFraudCheckerLoading(true);
      try {
        const { data } = await supabase.from('system_configs').select('value').eq('key', 'courier_steadfast').maybeSingle();
        if (data?.value) setCourierConfig(data.value);
      } catch (e) { console.warn(e); }
      finally { setCourierLoading(false); }

      try {
        const { data } = await supabase.from('system_configs').select('value').eq('key', 'fraud_checker_bd').maybeSingle();
        if (data?.value) setFraudCheckerConfig(data.value);
      } catch (e) { console.warn(e); }
      finally { setFraudCheckerLoading(false); }
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
      await supabase.from('system_configs').upsert({ key: 'courier_steadfast', value: courierConfig }, { onConflict: 'key' });
      setCourierSaved(true); setTimeout(() => setCourierSaved(false), 3000);
    } catch { setError('Courier save failed.'); } finally { setCourierSaving(false); }
  };

  const saveFraudChecker = async () => {
    setFraudCheckerSaving(true);
    try {
      await supabase.from('system_configs').upsert({ key: 'fraud_checker_bd', value: fraudCheckerConfig }, { onConflict: 'key' });
      setFraudCheckerSaved(true); setTimeout(() => setFraudCheckerSaved(false), 3000);
    } catch { setError('Fraud Checker BD save failed.'); } finally { setFraudCheckerSaving(false); }
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
          <SectionHead icon={Truck} title="Courier & Ratio Settings" desc="Connect Steadfast courier API and Fraud Checker BD for automated dispatch and return checks." />
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Steadfast Courier Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '750', color: 'var(--st-text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Truck size={15} style={{ color: 'var(--st-accent)' }} />
                <span>Steadfast Courier API</span>
              </h3>
              {courierLoading ? (
                <div className="st-loading-row"><Loader2 size={20} className="spin" /><span>Loading configuration...</span></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                  <div className="st-actions" style={{ justifyContent: 'flex-start', marginTop: '4px' }}>
                    <SaveBtn onClick={saveCourier} saving={courierSaving} saved={courierSaved} />
                  </div>
                </div>
              )}
            </div>

            {/* Fraud Checker BD Settings */}
            <div style={{ borderTop: '1px solid var(--st-border)', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: '750', color: 'var(--st-text)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Shield size={15} style={{ color: 'var(--st-accent)' }} />
                <span>Fraud Checker BD (Ratio Intelligence)</span>
              </h3>
              {fraudCheckerLoading ? (
                <div className="st-loading-row"><Loader2 size={20} className="spin" /><span>Loading configuration...</span></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="st-field-group">
                    <label className="st-label"><Key size={13} /> Bearer Token</label>
                    <div className="st-input-eye">
                      <input className="st-input" type={showFraudToken ? 'text' : 'password'} value={fraudCheckerConfig.api_key || ''} onChange={e => setFraudCheckerConfig(c => ({ ...c, api_key: e.target.value }))} placeholder="Enter Bearer Token for Fraud Checker BD" />
                      <button className="st-eye-btn" onClick={() => setShowFraudToken(v => !v)} type="button">{showFraudToken ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                    </div>
                  </div>
                  <div className="st-field-group">
                    <label className="st-label"><Sliders size={13} /> API Endpoint URL</label>
                    <input className="st-input" type="text" value={fraudCheckerConfig.api_url || ''} onChange={e => setFraudCheckerConfig(c => ({ ...c, api_url: e.target.value }))} placeholder="https://fraudchecker.link/api/check" />
                  </div>
                  <div className="st-toggle-row">
                    <div><span className="st-toggle-label">Enable Fraud Checker BD API</span><span className="st-toggle-desc">Check order success rates from Fraud Checker BD API first.</span></div>
                    <Toggle checked={fraudCheckerConfig.is_enabled || false} onChange={v => setFraudCheckerConfig(c => ({ ...c, is_enabled: v }))} />
                  </div>
                  <div className="st-actions" style={{ justifyContent: 'flex-start', marginTop: '4px' }}>
                    <SaveBtn onClick={saveFraudChecker} saving={fraudCheckerSaving} saved={fraudCheckerSaved} />
                  </div>
                </div>
              )}
            </div>
          </div>
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

      // ── APP UPDATES CENTER ──
      case 'update': {
        const hasNewUpdate = remoteVersion && Number(remoteVersion.versionCode) > CURRENT_VERSION_CODE;

        const handleDirectUpdate = () => {
          const targetUrl = remoteVersion?.apkUrl || "https://github.com/Shakhwat-93/Orderflow/actions";
          setUpdatingState('downloading');
          setTimeout(() => {
            // Check if native app or web
            if (typeof window !== 'undefined' && window.Capacitor) {
              window.open(targetUrl, '_system');
            } else {
              window.open(targetUrl, '_blank');
            }
            setUpdatingState('idle');
          }, 1500);
        };

        return (
          <div className="st-section-body">
            <SectionHead icon={RefreshCw} title="App Update Center" desc="Check system OTA updates and manage self-hosted APK deployments." />
            
            <div className="update-status-card">
              {checkingUpdate ? (
                <div className="checking-box" style={{ padding: '24px 0', justifyContent: 'center', width: '100%', gap: '10px' }}>
                  <Loader2 className="spin" size={24} style={{ color: 'var(--st-accent)' }} />
                  <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--st-text)' }}>Checking for updates...</span>
                </div>
              ) : hasNewUpdate && remoteVersion ? (
                <div className="new-update-banner-box" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                  <div className="badge-pulsing-wrap" style={{ marginBottom: 8 }}>
                    <span className="new-badge-pulse" style={{ background: '#22c55e' }}>NEW APP UPDATE</span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>Version {remoteVersion.versionName} is ready!</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--st-text-sub)', marginTop: 4, marginBottom: 12 }}>
                    Build {remoteVersion.versionCode} • Released {remoteVersion.publishedBy ? `by ${remoteVersion.publishedBy}` : ''}
                  </p>

                  {remoteVersion.releaseNotes && (
                    <div className="release-notes-preview" style={{ margin: '6px 0 16px' }}>
                      <strong>What's New:</strong>
                      <p>{remoteVersion.releaseNotes}</p>
                    </div>
                  )}

                  <button 
                    className="download-apk-button animate-pulse-btn"
                    disabled={updatingState !== 'idle'}
                    onClick={handleDirectUpdate}
                    style={{
                      height: 48,
                      fontSize: '0.92rem',
                      background: '#22c55e',
                      boxShadow: '0 4px 14px rgba(34, 197, 94, 0.25)',
                    }}
                  >
                    {updatingState === 'downloading' ? (
                      <>
                        <Loader2 size={18} className="spin" /> Executing Native Install...
                      </>
                    ) : (
                      <>
                        <Download size={18} /> Update Now (Install APK)
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="latest-status-success" style={{ border: 'none', background: 'rgba(34, 197, 94, 0.03)', padding: '24px 20px', borderRadius: '12px' }}>
                  <CheckCircle size={28} className="success-icon" style={{ color: '#22c55e', marginRight: '14px' }} />
                  <div className="latest-text-wrap">
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Your App is Up to Date</h3>
                    <p style={{ fontSize: '0.8rem', marginTop: 4 }}>
                      Running version <b>v{CURRENT_VERSION_NAME}</b> (Build {CURRENT_VERSION_CODE}). Everything is fresh and fully synced!
                    </p>
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="admin-release-portal">
                <div className="portal-head">
                  <Sliders size={16} />
                  <h3>Release New App Update (Admin Control)</h3>
                </div>
                <p className="portal-desc">Publish a new build below. All active APKs will immediately detect this update and display a one-click install button to agents.</p>
                
                <div className="release-form-grid">
                  <div className="st-field-group">
                    <label className="st-label">New Version Code (Build Number) <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      className="st-input"
                      type="number"
                      value={formCode}
                      onChange={e => setFormCode(Number(e.target.value))}
                      placeholder="e.g. 3"
                    />
                  </div>

                  <div className="st-field-group">
                    <label className="st-label">New Version Name <span style={{ color: '#ef4444' }}>*</span></label>
                    <input
                      className="st-input"
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="e.g. 2.1.0"
                    />
                  </div>
                </div>

                <div className="st-field-group">
                  <label className="st-label">APK Download Direct Link <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    className="st-input"
                    type="url"
                    value={formApkUrl}
                    onChange={e => setFormApkUrl(e.target.value)}
                    placeholder="https://github.com/Shakhwat-93/Orderflow/actions... or Supabase Storage URL"
                  />
                  <p className="st-hint">Specify the link to download the compiled .apk file.</p>
                </div>

                <div className="st-field-group">
                  <label className="st-label">Release Notes / Changes Log</label>
                  <textarea
                    className="st-input st-textarea"
                    rows={4}
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Describe the new updates (e.g. fixed order notifications, added 10 min alert snooze)..."
                  />
                </div>

                <div className="st-actions">
                  <button 
                    className={`st-save-btn ${publishSaved ? 'saved' : ''}`}
                    onClick={handlePublishRelease}
                    disabled={publishSaving}
                  >
                    {publishSaving ? (
                      <Loader2 size={16} className="spin" />
                    ) : publishSaved ? (
                      <><CheckCircle size={16} /> Update Published!</>
                    ) : (
                      <><RefreshCw size={16} /> Publish App Release</>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      }

      default: return null;
    }
  };

  return (
    <div className={`st-root mobile-view-${currentMobileView}`}>
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
                type="button"
                className={`st-nav-item ${active ? 'active' : ''} ${item.danger ? 'danger' : ''}`}
                onClick={() => {
                  setActiveSection(item.id);
                  setError(null);
                  setCurrentMobileView('detail');
                }}
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
          {currentMobileView === 'detail' && (
            <div className="st-mobile-back-header">
              <button 
                type="button"
                className="st-mobile-back-btn"
                onClick={() => setCurrentMobileView('master')}
              >
                <ChevronLeft size={18} />
                <span>Back to Settings</span>
              </button>
            </div>
          )}
          {renderSection()}
        </div>
      </main>
    </div>
  );
};
