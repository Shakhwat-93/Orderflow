import { supabase, formatApiError } from './client';
import type { ProductionLog, ProductionPayment } from '@/types/api';

export const productionApi = {
  /**
   * Fetch factory production logs
   */
  async getProductionLogs(filters: { status?: string; searchTerm?: string } = {}): Promise<ProductionLog[]> {
    try {
      let query = supabase
        .from('factory_production_logs')
        .select('*')
        .order('production_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters.status && filters.status !== 'All') {
        query = query.eq('payment_status', filters.status);
      }

      if (filters.searchTerm) {
        query = query.or(
          `product_name.ilike.%${filters.searchTerm}%,color.ilike.%${filters.searchTerm}%,variant.ilike.%${filters.searchTerm}%`
        );
      }

      const { data, error } = await query;
      if (error) {
        // Table might not exist yet in certain test environments
        if (error.message?.includes('relation "public.factory_production_logs" does not exist')) {
          return [];
        }
        throw error;
      }

      return (data as ProductionLog[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch factory production logs');
    }
  },

  /**
   * Create a new production log entry
   */
  async createProductionLog(logData: Partial<ProductionLog>): Promise<ProductionLog> {
    try {
      const quantity = Math.max(0, Number(logData.quantity_produced || 0));
      const unitCost = Math.max(0, Number(logData.unit_cost || 0));
      const totalCost = Number(logData.total_cost) || quantity * unitCost;
      const paidAmount = Math.max(0, Number(logData.paid_amount || 0));
      const dueAmount = Math.max(0, totalCost - paidAmount);

      let status = 'Due';
      if (paidAmount >= totalCost - 0.01 && totalCost > 0) {
        status = 'Paid';
      } else if (paidAmount > 0) {
        status = 'Partial';
      }

      const payload = {
        product_name: String(logData.product_name || '').trim(),
        color: logData.color ? String(logData.color).trim() : null,
        variant: logData.variant ? String(logData.variant).trim() : null,
        quantity_produced: quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        payment_status: status,
        production_date: logData.production_date || new Date().toISOString().split('T')[0],
        notes: logData.notes || null,
        created_by: logData.created_by || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('factory_production_logs')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;
      return data as ProductionLog;
    } catch (err) {
      throw formatApiError(err, 'Failed to record factory production log');
    }
  },

  /**
   * Update existing production log
   */
  async updateProductionLog(id: string, updates: Partial<ProductionLog>): Promise<ProductionLog> {
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('factory_production_logs')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      const quantity = updates.quantity_produced !== undefined ? Number(updates.quantity_produced) : Number(existing.quantity_produced || 0);
      const unitCost = updates.unit_cost !== undefined ? Number(updates.unit_cost) : Number(existing.unit_cost || 0);
      const totalCost = updates.total_cost !== undefined ? Number(updates.total_cost) : (quantity * unitCost);
      const paidAmount = updates.paid_amount !== undefined ? Number(updates.paid_amount) : Number(existing.paid_amount || 0);
      const dueAmount = Math.max(0, totalCost - paidAmount);

      let status = 'Due';
      if (paidAmount >= totalCost - 0.01 && totalCost > 0) {
        status = 'Paid';
      } else if (paidAmount > 0) {
        status = 'Partial';
      }

      const payload = {
        ...updates,
        quantity_produced: quantity,
        unit_cost: unitCost,
        total_cost: totalCost,
        paid_amount: paidAmount,
        due_amount: dueAmount,
        payment_status: status,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('factory_production_logs')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as ProductionLog;
    } catch (err) {
      throw formatApiError(err, `Failed to update production log #${id}`);
    }
  },

  /**
   * Delete production log
   */
  async deleteProductionLog(id: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('factory_production_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to delete production log #${id}`);
    }
  },

  /**
   * Fetch production payment history
   */
  async getProductionPayments(): Promise<ProductionPayment[]> {
    try {
      const { data, error } = await supabase
        .from('production_payments')
        .select(`
          *,
          factory_production_logs (
            product_name,
            color,
            variant,
            total_cost,
            paid_amount,
            due_amount
          )
        `)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        if (error.message?.includes('relation "public.production_payments" does not exist')) {
          return [];
        }
        throw error;
      }

      return (data as ProductionPayment[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch production payments');
    }
  },

  /**
   * Record a production payment and sync statuses
   */
  async createProductionPayment(paymentData: {
    production_log_id?: string | null;
    amount: number;
    payment_method?: string;
    payment_date?: string;
    notes?: string;
    created_by?: string;
  }): Promise<ProductionPayment> {
    try {
      const payload = {
        production_log_id: paymentData.production_log_id || null,
        amount: Number(paymentData.amount) || 0,
        payment_method: paymentData.payment_method || 'cash',
        payment_date: paymentData.payment_date || new Date().toISOString().split('T')[0],
        notes: paymentData.notes || null,
        created_by: paymentData.created_by || null,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('production_payments')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // Synchronize overall payment status
      await this.syncProductionLogsPaymentStatuses();

      return data as ProductionPayment;
    } catch (err) {
      throw formatApiError(err, 'Failed to record production payment');
    }
  },

  /**
   * FIFO allocation sync across factory production logs based on payments
   */
  async syncProductionLogsPaymentStatuses(): Promise<void> {
    try {
      const { data: payData } = await supabase.from('production_payments').select('amount');
      let totalAvailablePaid = (payData || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

      const { data: logs } = await supabase
        .from('factory_production_logs')
        .select('id, total_cost, paid_amount, payment_status')
        .order('production_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (!logs) return;

      for (const log of logs) {
        const cost = Number(log.total_cost) || 0;
        const allocatedPaid = Math.min(totalAvailablePaid, cost);
        totalAvailablePaid -= allocatedPaid;

        const newStatus = allocatedPaid >= cost - 0.01 ? 'Paid' : (allocatedPaid > 0 ? 'Partial' : 'Due');

        if (Number(log.paid_amount) !== allocatedPaid || log.payment_status !== newStatus) {
          await supabase
            .from('factory_production_logs')
            .update({
              paid_amount: allocatedPaid,
              due_amount: Math.max(0, cost - allocatedPaid),
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', log.id);
        }
      }
    } catch (err) {
      console.error('Error syncing factory production payment statuses:', err);
    }
  }
};
