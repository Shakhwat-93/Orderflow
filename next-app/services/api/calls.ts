import { supabase, schemaState, normalizeIpAddress, formatApiError } from './client';
import { ordersApi } from './orders';
import type { UserRole, BlockedIpEntry, OrderIpIntelligence } from '@/types/api';

export const callsApi = {
  /**
   * Log a call attempt (No Answer, Busy, etc.)
   * Roles: Admin, Call Team
   */
  async logCallAttempt(
    orderId: string | number,
    status: string,
    userId?: string,
    userName = 'System',
    userRoles: UserRole[] = [],
    noteText = ''
  ) {
    const hasPermission = userRoles.length === 0 || userRoles.some((r) => ['Admin', 'Call Team'].includes(r));
    if (!hasPermission) {
      throw new Error('Unauthorized: Only Admin or Call Team can log call attempts.');
    }

    try {
      const { data: oldData, error: fetchErr } = await supabase
        .from('orders')
        .select('call_attempts, first_call_time, status, notes')
        .eq('id', orderId)
        .single();

      if (fetchErr) throw fetchErr;

      const newAttempts = (oldData?.call_attempts || 0) + 1;
      const newFirstCallTime = oldData?.first_call_time || new Date().toISOString();
      const failedCallStatuses = ['busy', 'not pick', 'on hold', 'hold'];
      const isFailedCallStatus = failedCallStatuses.some((value) =>
        String(status || '').toLowerCase().includes(value)
      );
      const resolvedStatuses = [
        'Confirmed',
        'Cancelled',
        'Fake Order',
        'Bulk Exported',
        'Courier Ready',
        'Courier Submitted',
        'Factory Processing',
        'Completed'
      ];
      const nextStatus = resolvedStatuses.includes(oldData?.status)
        ? oldData.status
        : (isFailedCallStatus && newAttempts >= 6 ? 'Final Call Pending' : 'Pending Call');

      const updatePayload: Record<string, any> = {
        status: nextStatus,
        call_attempts: newAttempts,
        last_call_status: status,
        first_call_time: newFirstCallTime,
        last_call_at: new Date().toISOString()
      };

      const cleanNote = String(noteText || '').trim();
      if (cleanNote) {
        const noteEntry = ordersApi.formatOrderNoteEntry(cleanNote, status, userName);
        if (noteEntry) {
          updatePayload.notes = ordersApi.mergeOrderNotes(oldData?.notes, noteEntry);
        }
      }

      const { data, error } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId)
        .select()
        .single();

      if (error) throw error;

      ordersApi.logActivity({
        order_id: orderId,
        action_type: 'UPDATE',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} logged call attempt: ${status} (Attempt #${newAttempts})${nextStatus === 'Final Call Pending' ? ' and moved order to Final Call Pending' : ''}${cleanNote ? ` - Note: ${cleanNote}` : ''}`,
        new_status: nextStatus
      }).catch((logErr) => console.warn('Call attempt log activity non-fatal error:', logErr));

      return data;
    } catch (err) {
      throw formatApiError(err, `Failed to log call attempt for #${orderId}`);
    }
  },

  /**
   * Fraud Controls / IP Blocking
   */
  async getIpBlocklist(): Promise<{ configured: boolean; blocks: BlockedIpEntry[] }> {
    try {
      const { data, error } = await supabase
        .from('blocked_ip_addresses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (schemaState.isMissingTableError(error, 'blocked_ip_addresses')) {
          return { configured: false, blocks: [] };
        }
        throw error;
      }

      return { configured: true, blocks: (data as BlockedIpEntry[]) || [] };
    } catch (err) {
      throw formatApiError(err, 'Failed to retrieve IP blocklist');
    }
  },

  async blockIpAddress(ipAddress: string, reason = '', userId?: string, userName = 'System') {
    const normalizedIp = normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    const payload = {
      ip_address: normalizedIp,
      reason: String(reason || '').trim() || 'Blocked from fraud control',
      is_active: true,
      blocked_by: userId || null,
      blocked_by_name: userName || 'System',
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase
        .from('blocked_ip_addresses')
        .upsert(payload, { onConflict: 'ip_address' })
        .select()
        .single();

      if (error) {
        if (schemaState.isMissingTableError(error, 'blocked_ip_addresses')) {
          throw new Error('IP blocklist database table is not installed.');
        }
        throw error;
      }

      return data;
    } catch (err) {
      throw formatApiError(err, `Failed to block IP ${normalizedIp}`);
    }
  },

  async blockIpAddressForFakeOrder({
    ipAddress,
    orderId,
    customerName,
    phone,
    noteText,
    userId,
    userName
  }: {
    ipAddress: string;
    orderId: string | number;
    customerName?: string;
    phone?: string;
    noteText?: string;
    userId?: string;
    userName?: string;
  }) {
    const normalizedIp = normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    const cleanNote = String(noteText || '').trim();
    const reason = [
      `Auto-blocked from Fake Order #${orderId}`,
      customerName ? `Customer: ${customerName}` : '',
      phone ? `Phone: ${phone}` : '',
      cleanNote ? `Note: ${cleanNote}` : ''
    ].filter(Boolean).join(' | ');

    try {
      const { data, error } = await supabase.functions.invoke('fraud-actions', {
        body: {
          action: 'block-ip',
          ipAddress: normalizedIp,
          reason,
          orderId
        }
      });

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to block fake order IP address.');
      }

      await ordersApi.logActivity({
        order_id: orderId,
        action_type: 'UPDATE',
        changed_by_user_id: userId,
        changed_by_user_name: userName,
        action_description: `${userName} marked order #${orderId} as Fake Order and blocked IP ${normalizedIp}.`
      });

      return data.block;
    } catch (err) {
      // If edge function fails, fallback to direct table upsert
      console.warn('fraud-actions edge function fallback to direct table write:', err);
      return this.blockIpAddress(normalizedIp, reason, userId, userName);
    }
  },

  async unblockIpAddress(ipAddress: string) {
    const normalizedIp = normalizeIpAddress(ipAddress);
    if (!normalizedIp) throw new Error('IP address is required.');

    try {
      const { data, error } = await supabase
        .from('blocked_ip_addresses')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('ip_address', normalizedIp)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      throw formatApiError(err, `Failed to unblock IP ${normalizedIp}`);
    }
  },

  async getOrderIpIntelligence(limit = 1000) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id,ip_address,created_at,customer_name,phone,status')
        .not('ip_address', 'is', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        if (schemaState.isMissingColumnError(error, 'ip_address')) return [];
        throw error;
      }

      const rowsByIp = new Map<string, any>();

      (data || []).forEach((order: any) => {
        const ip = normalizeIpAddress(order.ip_address);
        if (!ip) return;

        const current = rowsByIp.get(ip) || {
          ip_address: ip,
          total_orders: 0,
          latest_order_at: null,
          latest_order: null,
          statuses: {} as Record<string, number>
        };

        current.total_orders += 1;
        current.statuses[order.status || 'Unknown'] = (current.statuses[order.status || 'Unknown'] || 0) + 1;

        if (!current.latest_order_at || new Date(order.created_at) > new Date(current.latest_order_at)) {
          current.latest_order_at = order.created_at;
          current.latest_order = {
            id: order.id,
            customer_name: order.customer_name,
            phone: order.phone,
            status: order.status
          };
        }

        rowsByIp.set(ip, current);
      });

      return Array.from(rowsByIp.values()).sort((a, b) => {
        if (b.total_orders !== a.total_orders) return b.total_orders - a.total_orders;
        return new Date(b.latest_order_at || 0).getTime() - new Date(a.latest_order_at || 0).getTime();
      });
    } catch (err) {
      throw formatApiError(err, 'Failed to compile IP intelligence report');
    }
  }
};
