import { useState, useEffect, useCallback, useRef } from 'react';
import {
  DatabaseBackup, Download, RefreshCw, CheckCircle2,
  XCircle, Clock, CloudUpload, Settings2, History,
  Shield, Zap, HardDrive, ChevronLeft, ChevronRight,
  ExternalLink, AlertCircle, Play, Loader2
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './BackupPanel.css';

// ── Google Drive OAuth helper ───────────────────────────────
// Uses Google Identity Services (browser popup — no redirect, no page reload)
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts) { resolve(); return; }
    if (document.getElementById('gsi-script')) { resolve(); return; }
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });

// Format bytes to human-readable
const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// Format date relative
const timeAgo = (iso) => {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

// Countdown to next backup
const countdownTo = (iso) => {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
};

const StatusBadge = ({ status }) => {
  const icons = {
    completed: <CheckCircle2 size={12} />,
    running:   <Loader2 size={12} className="spin" />,
    failed:    <XCircle size={12} />,
    pending:   <Clock size={12} />,
  };
  return (
    <span className={`backup-status-badge ${status}`}>
      {icons[status] || null}
      {status}
    </span>
  );
};

const ITEMS_PER_PAGE = 8;

// ════════════════════════════════════════════════════════════
export const BackupPanel = () => {
  const { profile, userRoles } = useAuth();
  const isAdmin = userRoles?.includes('Admin');

  // Settings state
  const [settings, setSettings]         = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Backup execution state
  const [isRunning, setIsRunning]       = useState(false);
  const [progress, setProgress]         = useState(0);
  const [progressMsg, setProgressMsg]   = useState('');
  const [lastResult, setLastResult]     = useState(null);
  const [backupError, setBackupError]   = useState(null);

  // History state
  const [logs, setLogs]                 = useState([]);
  const [logsCount, setLogsCount]       = useState(0);
  const [logsPage, setLogsPage]         = useState(1);
  const [logsLoading, setLogsLoading]   = useState(true);

  // Google Drive state
  const [driveToken, setDriveToken]     = useState(null);
  const [driveEmail, setDriveEmail]     = useState(null);
  const [clientId, setClientId]         = useState('');
  const [driveUploading, setDriveUploading] = useState(false);

  // Auto backup settings (local editable state)
  const [autoEnabled, setAutoEnabled]   = useState(false);
  const [intervalHours, setIntervalHours] = useState(12);
  const [savingSettings, setSavingSettings] = useState(false);
  const [countdown, setCountdown]       = useState(null);

  // Holds the last backup JSON blob for Drive upload
  const lastBackupDataRef = useRef(null);

  // ── Load Settings ─────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await api.getBackupSettings();
      if (data) {
        setSettings(data);
        setAutoEnabled(data.auto_backup_enabled ?? false);
        setIntervalHours(data.backup_interval_hours ?? 12);
        setClientId(data.google_drive_client_id || '');
        setCountdown(countdownTo(data.next_backup_at));
      }
    } catch (err) {
      console.error('[BackupPanel] Failed to load settings:', err);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // ── Load History ───────────────────────────────────────
  const loadLogs = useCallback(async (page = 1) => {
    setLogsLoading(true);
    try {
      const { data, count } = await api.getBackupLogs(page, ITEMS_PER_PAGE);
      setLogs(data);
      setLogsCount(count);
    } catch (err) {
      console.error('[BackupPanel] Failed to load logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { loadLogs(logsPage); }, [loadLogs, logsPage]);

  // Live countdown ticker
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown(countdownTo(settings?.next_backup_at));
    }, 60000);
    return () => clearInterval(tick);
  }, [settings?.next_backup_at]);

  // ── Run Backup ─────────────────────────────────────────
  const handleBackupNow = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setBackupError(null);
    setLastResult(null);
    lastBackupDataRef.current = null;

    // Simulate granular progress (Edge Function runs server-side so we animate)
    const steps = [
      { pct: 10, msg: 'Connecting to database...' },
      { pct: 25, msg: 'Exporting orders & activity logs...' },
      { pct: 45, msg: 'Exporting users, inventory & campaigns...' },
      { pct: 65, msg: 'Exporting remaining tables...' },
      { pct: 80, msg: 'Packaging backup file...' },
      { pct: 90, msg: 'Uploading to Supabase Storage...' },
    ];

    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < steps.length) {
        setProgress(steps[stepIndex].pct);
        setProgressMsg(steps[stepIndex].msg);
        stepIndex++;
      }
    }, 1200);

    try {
      // Create pending log entry
      let logId = null;
      try {
        const log = await api.createBackupLog({
          type: 'manual',
          triggered_by_user_id: profile?.id,
          triggered_by_user_name: profile?.name || 'Admin',
        });
        logId = log?.id;
      } catch { /* non-fatal */ }

      // Call Edge Function
      const result = await api.triggerBackup({
        type: 'manual',
        logId,
        triggeredByName: profile?.name || 'Admin',
      });

      clearInterval(progressInterval);
      setProgress(100);
      setProgressMsg('Backup complete! ✓');

      setLastResult(result);
      lastBackupDataRef.current = result.backupData || null;

      // Refresh data
      await loadSettings();
      await loadLogs(1);
      setLogsPage(1);

      // Auto-download
      if (result.backupData) {
        triggerDownload(result.backupData, result.fileName);
      }

      // If Drive is connected, auto-upload
      if (driveToken && result.backupData) {
        await uploadToDrive(result.backupData, result.fileName);
      }

    } catch (err) {
      clearInterval(progressInterval);
      setBackupError(err?.message || 'Backup failed. Please try again.');
      setProgress(0);
      setProgressMsg('');
    } finally {
      setTimeout(() => {
        setIsRunning(false);
        setProgress(0);
        setProgressMsg('');
      }, 2000);
    }
  }, [isRunning, profile, driveToken, loadSettings, loadLogs]);

  // ── Download helper ────────────────────────────────────
  const triggerDownload = (data, fileName) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `orderflow_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Download from Storage ──────────────────────────────
  const handleDownloadFromStorage = async (log) => {
    if (log.supabase_storage_path) {
      const url = await api.getBackupDownloadUrl(log.supabase_storage_path);
      if (url) { window.open(url, '_blank'); return; }
    }
    alert('Download link expired or not available. Please run a new backup.');
  };

  // ── Google Drive OAuth ─────────────────────────────────
  const handleConnectDrive = async () => {
    const resolvedClientId = clientId.trim() || settings?.google_drive_client_id;
    if (!resolvedClientId) {
      alert('Please enter your Google OAuth Client ID first.');
      return;
    }
    try {
      await loadGoogleScript();
      // Save client ID to settings
      if (clientId.trim()) {
        await api.updateBackupSettings({ google_drive_client_id: clientId.trim() });
      }
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: resolvedClientId,
        scope: GOOGLE_DRIVE_SCOPE,
        callback: async (response) => {
          if (response.error) {
            setBackupError(`Google Drive: ${response.error}`);
            return;
          }
          setDriveToken(response.access_token);
          // Get the user's email from the token info
          try {
            const r = await fetch(
              `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${response.access_token}`
            );
            const info = await r.json();
            setDriveEmail(info.email || 'Connected');
          } catch { setDriveEmail('Connected'); }
          await api.updateBackupSettings({ google_drive_connected: true });
          await loadSettings();
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      setBackupError(`Google Drive connection failed: ${err.message}`);
    }
  };

  const handleDisconnectDrive = async () => {
    if (driveToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(driveToken, () => {});
    }
    setDriveToken(null);
    setDriveEmail(null);
    await api.updateBackupSettings({ google_drive_connected: false });
    await loadSettings();
  };

  // ── Upload to Google Drive ─────────────────────────────
  const uploadToDrive = async (data, fileName) => {
    if (!driveToken) return;
    setDriveUploading(true);
    try {
      const jsonBlob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const metadata = {
        name: fileName || `orderflow_backup_${Date.now()}.json`,
        parents: ['root'], // Upload to root Drive folder
        description: `OrderFlow automated backup — ${new Date().toLocaleString()}`,
      };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', jsonBlob);

      const response = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${driveToken}` },
          body: form,
        }
      );
      if (!response.ok) throw new Error(`Drive upload failed: ${response.status}`);
      const driveFile = await response.json();

      // Update the most recent log entry with Drive link
      const { data: recentLogs } = await api.getBackupLogs(1, 1);
      if (recentLogs[0]?.id) {
        await api.updateBackupLog(recentLogs[0].id, {
          google_drive_file_id: driveFile.id,
          google_drive_link: driveFile.webViewLink,
        });
      }
      await loadLogs(1);
    } catch (err) {
      console.error('[BackupPanel] Drive upload failed:', err);
    } finally {
      setDriveUploading(false);
    }
  };

  // ── Save Auto Backup Settings ──────────────────────────
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const nextAt = autoEnabled
        ? new Date(Date.now() + intervalHours * 3600000).toISOString()
        : null;
      await api.updateBackupSettings({
        auto_backup_enabled: autoEnabled,
        backup_interval_hours: intervalHours,
        next_backup_at: nextAt,
      });
      await loadSettings();
    } catch (err) {
      setBackupError('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const totalPages = Math.ceil(logsCount / ITEMS_PER_PAGE);

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="backup-panel">

      {/* Header */}
      <div className="backup-header">
        <div className="backup-header-text">
          <h1>
            <span className="backup-title-icon"><DatabaseBackup size={18} /></span>
            Backup System
          </h1>
          <p>Enterprise data protection — all backups are read-only and isolated from live orders.</p>
        </div>
        <button
          id="backup-now-btn"
          className={`backup-now-btn ${isRunning ? 'running' : ''}`}
          onClick={handleBackupNow}
          disabled={isRunning || !isAdmin}
        >
          {isRunning
            ? <><Loader2 size={16} className="spin" /> Backing Up...</>
            : <><Play size={16} /> Backup Now</>
          }
        </button>
      </div>

      {/* Success Banner */}
      {lastResult && !isRunning && (
        <div className="backup-success-banner">
          <CheckCircle2 size={20} />
          <div className="backup-success-banner-text">
            <strong>Backup Complete!</strong> &nbsp;
            {lastResult.totalRecords?.toLocaleString()} records across {lastResult.successfulTables} tables —&nbsp;
            {formatBytes(lastResult.fileSizeBytes)} &nbsp;·&nbsp;
            {lastResult.durationMs}ms
            {driveToken && driveUploading && ' · Uploading to Drive...'}
            {driveToken && !driveUploading && ' · Saved to Google Drive ✓'}
          </div>
          {lastResult.backupData && (
            <button
              className="backup-action-btn download"
              onClick={() => triggerDownload(lastResult.backupData, lastResult.fileName)}
            >
              <Download size={13} /> Download
            </button>
          )}
        </div>
      )}

      {/* Error Banner */}
      {backupError && (
        <div className="backup-error-banner">
          <AlertCircle size={18} />
          {backupError}
        </div>
      )}

      {/* Progress Bar */}
      {isRunning && (
        <div className="backup-progress-wrap">
          <div className="backup-progress-header">
            <span className="backup-progress-label">
              <Loader2 size={14} className="spin" /> Running backup...
            </span>
            <span className="backup-progress-pct">{progress}%</span>
          </div>
          <div className="backup-progress-bar-track">
            <div className="backup-progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="backup-progress-msg">{progressMsg}</div>
        </div>
      )}

      {/* Stats Row */}
      <div className="backup-stats-grid">
        <div className="backup-stat-card">
          <div className="backup-stat-icon purple"><Clock size={20} /></div>
          <div className="backup-stat-content">
            <div className="backup-stat-label">Last Backup</div>
            <div className="backup-stat-value">
              {settingsLoading ? '...' : timeAgo(settings?.last_backup_at)}
            </div>
            <div className="backup-stat-sub">
              {settings?.last_backup_status === 'completed' ? '✓ Successful' : settings?.last_backup_status || 'Never'}
            </div>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-icon green"><History size={20} /></div>
          <div className="backup-stat-content">
            <div className="backup-stat-label">Total Backups</div>
            <div className="backup-stat-value">{logsCount.toLocaleString()}</div>
            <div className="backup-stat-sub">stored in history</div>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-icon blue"><HardDrive size={20} /></div>
          <div className="backup-stat-content">
            <div className="backup-stat-label">Last Size</div>
            <div className="backup-stat-value">
              {formatBytes(settings?.last_backup_size_bytes || 0)}
            </div>
            <div className="backup-stat-sub">compressed JSON</div>
          </div>
        </div>

        <div className="backup-stat-card">
          <div className="backup-stat-icon orange"><Zap size={20} /></div>
          <div className="backup-stat-content">
            <div className="backup-stat-label">Auto Backup</div>
            <div className="backup-stat-value">
              {settings?.auto_backup_enabled ? 'ON' : 'OFF'}
            </div>
            <div className="backup-stat-sub">
              {settings?.auto_backup_enabled
                ? `Every ${settings.backup_interval_hours}h · ${countdown || '—'}`
                : 'Manual only'}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column: Google Drive + Auto Backup Settings */}
      <div className="backup-grid-2col">

        {/* Google Drive */}
        <div className="backup-section-card">
          <div className="backup-section-title">
            <CloudUpload size={16} /> Google Drive
          </div>
          <div className="drive-connect-area">
            {driveToken ? (
              <>
                <div className="drive-connected-badge">
                  <div className="drive-connected-dot" />
                  <div className="drive-connected-info">
                    <div className="drive-connected-label">Connected</div>
                    <div className="drive-connected-account">{driveEmail || 'Google Drive'}</div>
                  </div>
                  {driveUploading && <Loader2 size={14} className="spin" style={{ color: '#0ea5e9' }} />}
                </div>
                <button className="drive-btn disconnect" onClick={handleDisconnectDrive}>
                  Disconnect Drive
                </button>
              </>
            ) : (
              <>
                <input
                  className="drive-client-id-input"
                  type="text"
                  placeholder="Paste your Google OAuth Client ID..."
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
                <div className="drive-help-text">
                  Get a Client ID from&nbsp;
                  <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
                    Google Cloud Console
                  </a>
                  &nbsp;→ Enable Drive API → OAuth 2.0 Credentials.
                </div>
                <button className="drive-btn connect" onClick={handleConnectDrive}>
                  <CloudUpload size={15} /> Connect Google Drive
                </button>
              </>
            )}
          </div>
        </div>

        {/* Auto Backup Settings */}
        <div className="backup-section-card">
          <div className="backup-section-title">
            <Settings2 size={16} /> Auto Backup
          </div>

          <div className="auto-backup-toggle-row">
            <div>
              <div className="auto-backup-toggle-label">Enable auto backup</div>
              <div className="auto-backup-toggle-sub">Runs silently in the background</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>

          <div className="interval-select-row">
            <label>Every</label>
            <select
              className="interval-select"
              value={intervalHours}
              onChange={(e) => setIntervalHours(Number(e.target.value))}
              disabled={!autoEnabled}
            >
              <option value={6}>6 hours</option>
              <option value={12}>12 hours</option>
              <option value={24}>24 hours</option>
              <option value={48}>48 hours</option>
              <option value={168}>7 days</option>
            </select>
          </div>

          {autoEnabled && settings?.next_backup_at && (
            <div className="next-backup-row">
              <Clock size={14} style={{ color: '#6366f1' }} />
              Next backup&nbsp;
              <span className="next-backup-countdown">{countdown || '—'}</span>
            </div>
          )}

          <button
            className="backup-now-btn"
            style={{ marginTop: 12, padding: '9px 18px', fontSize: '0.85rem' }}
            onClick={handleSaveSettings}
            disabled={savingSettings}
          >
            {savingSettings ? <Loader2 size={14} className="spin" /> : <Shield size={14} />}
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Backup History */}
      <div className="backup-history-card">
        <div className="backup-history-header">
          <div className="backup-history-title">
            <History size={16} /> Backup History
            <span className="backup-history-count">{logsCount}</span>
          </div>
          <button
            className="backup-action-btn download"
            onClick={() => loadLogs(logsPage)}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="backup-table-wrap">
          {logsLoading ? (
            <div className="backup-empty-state">
              <Loader2 size={32} className="spin" />
              <p>Loading backup history...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="backup-empty-state">
              <DatabaseBackup size={40} />
              <p>No backups yet. Click <strong>Backup Now</strong> to create your first backup.</p>
            </div>
          ) : (
            <table className="backup-table">
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Records</th>
                  <th>Size</th>
                  <th>By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {new Date(log.created_at).toLocaleDateString('en-BD', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #64748b)' }}>
                        {new Date(log.created_at).toLocaleTimeString('en-BD', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                        &nbsp;·&nbsp;{timeAgo(log.created_at)}
                      </div>
                    </td>
                    <td>
                      <span className={`backup-type-badge ${log.type}`}>{log.type}</span>
                    </td>
                    <td><StatusBadge status={log.status} /></td>
                    <td>{log.total_records?.toLocaleString() || '—'}</td>
                    <td>{formatBytes(log.file_size_bytes)}</td>
                    <td style={{ fontSize: '0.8rem' }}>{log.triggered_by_user_name || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {log.supabase_storage_path && (
                          <button
                            className="backup-action-btn download"
                            onClick={() => handleDownloadFromStorage(log)}
                            title="Download backup"
                          >
                            <Download size={12} /> JSON
                          </button>
                        )}
                        {log.google_drive_link && (
                          <a
                            className="backup-action-btn drive"
                            href={log.google_drive_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Google Drive"
                          >
                            <ExternalLink size={12} /> Drive
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="backup-pagination">
            <button
              className="backup-page-btn"
              onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
              disabled={logsPage === 1}
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = logsPage <= 3 ? i + 1 : logsPage - 2 + i;
              if (pg < 1 || pg > totalPages) return null;
              return (
                <button
                  key={pg}
                  className={`backup-page-btn ${logsPage === pg ? 'active' : ''}`}
                  onClick={() => setLogsPage(pg)}
                >
                  {pg}
                </button>
              );
            })}
            <button
              className="backup-page-btn"
              onClick={() => setLogsPage((p) => Math.min(totalPages, p + 1))}
              disabled={logsPage === totalPages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Spin animation */}
      <style>{`
        .spin { animation: backup-spin 1s linear infinite; }
        @keyframes backup-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
