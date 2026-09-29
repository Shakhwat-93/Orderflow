import { supabase, schemaState, formatApiError } from './client';
import { env } from '@/config/env';
import type { SystemConfig, BackupSettings, BackupLog } from '@/types/api';

export const settingsApi = {
  /**
   * Fetch system configuration by key
   */
  async getSystemConfig<T = any>(key: string): Promise<T | null> {
    try {
      const { data, error } = await supabase
        .from('system_configs')
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return (data?.value as T) || null;
    } catch (err) {
      throw formatApiError(err, `Failed to fetch system config for "${key}"`);
    }
  },

  /**
   * Upsert system configuration by key
   */
  async updateSystemConfig(key: string, value: any): Promise<SystemConfig> {
    try {
      const { data, error } = await supabase
        .from('system_configs')
        .upsert({ key, value, updated_at: new Date().toISOString() })
        .select()
        .single();

      if (error) throw error;
      return data as SystemConfig;
    } catch (err) {
      throw formatApiError(err, `Failed to update system config for "${key}"`);
    }
  },

  /**
   * Backup Settings singleton
   */
  async getBackupSettings(): Promise<BackupSettings | null> {
    try {
      const { data, error } = await supabase
        .from('backup_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        if (schemaState.isMissingTableError(error, 'backup_settings')) return null;
        throw error;
      }
      return (data as BackupSettings) || null;
    } catch {
      return null;
    }
  },

  async updateBackupSettings(updates: Partial<BackupSettings> = {}): Promise<BackupSettings | null> {
    try {
      const { data, error } = await supabase
        .from('backup_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', 1)
        .select()
        .maybeSingle();

      if (error) throw error;
      return (data as BackupSettings) || null;
    } catch (err) {
      throw formatApiError(err, 'Failed to update backup settings');
    }
  },

  /**
   * Paginated backup logs
   */
  async getBackupLogs(page = 1, limit = 10): Promise<{ data: BackupLog[]; count: number }> {
    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error, count } = await supabase
        .from('backup_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        if (schemaState.isMissingTableError(error, 'backup_logs')) return { data: [], count: 0 };
        throw error;
      }
      return { data: (data as BackupLog[]) || [], count: count || 0 };
    } catch (err) {
      throw formatApiError(err, 'Failed to retrieve backup history');
    }
  },

  async createBackupLog(payload: Partial<BackupLog> = {}): Promise<BackupLog> {
    try {
      const { data, error } = await supabase
        .from('backup_logs')
        .insert({
          status: 'pending',
          type: 'manual',
          ...payload,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return data as BackupLog;
    } catch (err) {
      throw formatApiError(err, 'Failed to create backup log');
    }
  },

  async updateBackupLog(id: string | number, updates: Partial<BackupLog> = {}): Promise<void> {
    try {
      const { error } = await supabase
        .from('backup_logs')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to update backup log #${id}`);
    }
  },

  /**
   * Execute backup through Edge Function
   */
  async triggerBackup({
    type = 'manual',
    logId = null,
    triggeredByName = 'Admin',
    tables = null
  }: {
    type?: string;
    logId?: string | number | null;
    triggeredByName?: string;
    tables?: string[] | null;
  } = {}) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Authentication session required for backup.');

      const body = {
        type,
        triggered_by_name: triggeredByName,
        ...(logId ? { log_id: logId } : {}),
        ...(tables ? { tables } : {})
      };

      const response = await fetch(`${env.supabase.url}/functions/v1/backup-data`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backup failed (${response.status}): ${errText}`);
      }

      return response.json();
    } catch (err) {
      throw formatApiError(err, 'Backup execution failed');
    }
  },

  async pruneOldBackups(retentionDays = 30): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from('backup_logs')
        .delete()
        .lt('created_at', cutoff)
        .eq('status', 'completed');

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, 'Failed to prune old backups');
    }
  },

  async getBackupDownloadUrl(storagePath: string): Promise<string | null> {
    if (!storagePath) return null;
    try {
      const { data, error } = await supabase.storage
        .from('backups')
        .createSignedUrl(storagePath, 3600);

      if (error) return null;
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  }
};
