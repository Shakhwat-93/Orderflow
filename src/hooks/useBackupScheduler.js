import { useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';

// How often the scheduler polls (every 5 minutes)
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * useBackupScheduler
 * 
 * Mounts in App.jsx once after auth is ready.
 * Checks backup_settings.next_backup_at every 5 minutes.
 * If auto backup is enabled and next_backup_at is overdue,
 * silently triggers a backup in the background.
 * 
 * This is 100% safe — runs in background, no UI impact,
 * no writes to production order tables.
 */
export const useBackupScheduler = ({ isAuthReady, profile, userRoles }) => {
  const isRunningRef = useRef(false);

  const isAdmin = Array.isArray(userRoles) && userRoles.includes('Admin');

  const runScheduledBackup = useCallback(async () => {
    // Only admins trigger auto backup
    if (!isAuthReady || !profile?.id || !isAdmin) return;
    // Prevent concurrent backup runs
    if (isRunningRef.current) return;

    try {
      const settings = await api.getBackupSettings();
      if (!settings?.auto_backup_enabled) return;

      const nextBackupAt = settings.next_backup_at ? new Date(settings.next_backup_at) : null;
      const now = new Date();

      // If no next_backup_at set, or it's in the future — skip
      if (!nextBackupAt || nextBackupAt > now) return;

      isRunningRef.current = true;

      // Create a log entry first
      let logId = null;
      try {
        const logEntry = await api.createBackupLog({
          type: 'auto',
          triggered_by_user_id: profile.id,
          triggered_by_user_name: profile.name || profile.email || 'System',
        });
        logId = logEntry?.id || null;
      } catch {
        // Log creation failure is non-fatal
      }

      // Calculate next backup time
      const intervalHours = settings.backup_interval_hours || 12;
      const nextAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

      // Update next_backup_at immediately so parallel instances don't re-trigger
      await api.updateBackupSettings({ next_backup_at: nextAt.toISOString() });

      // Run the backup via Edge Function (fire-and-forget from scheduler perspective)
      await api.triggerBackup({
        type: 'auto',
        logId,
        triggeredByName: profile.name || 'System Auto Backup',
      });

    } catch (err) {
      // Silent failure — scheduler must never crash the app
      console.warn('[BackupScheduler] Auto backup failed silently:', err?.message);
    } finally {
      isRunningRef.current = false;
    }
  }, [isAuthReady, profile, isAdmin]);

  useEffect(() => {
    if (!isAuthReady || !isAdmin) return;

    // Run once on mount (handles case where app was closed during scheduled window)
    const mountDelay = setTimeout(runScheduledBackup, 10000); // 10s delay after mount

    // Then check every 5 minutes
    const interval = setInterval(runScheduledBackup, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(mountDelay);
      clearInterval(interval);
    };
  }, [isAuthReady, isAdmin, runScheduledBackup]);
};
