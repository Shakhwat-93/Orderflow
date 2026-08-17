/**
 * GlobalProductionPaymentModal.jsx
 * ──────────────────────────────────────────────────────────────────
 * Global Payment & Ledger Settlement Modal for Factory Production Dues.
 *
 * Features:
 *  1. Global Payment Distribution (FIFO):
 *     - Enter any global payment amount (e.g. ৳50,000)
 *     - Automatically distributes payment across oldest due production log entries
 *     - Saves individual transaction records linked to respective logs
 *     - Auto-updates payment_status & paid_amount for all affected logs
 *  2. Global Transaction Audit Log / History:
 *     - Browse ALL production payment transactions across the system
 *     - Filter/Search by product, payment method, date, note, paid_by
 *     - Delete transactions with auto-recalculation of affected production log
 * ──────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Clock, CreditCard, Plus, Loader2,
  Calendar, DollarSign, AlertCircle, Trash2, X,
  Receipt, ArrowDownLeft, Wallet, Layers, Filter, CheckCheck
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'bKash', 'Nagad', 'Rocket', 'Other'];

const fmt = (n) => Number(n || 0).toLocaleString('en-BD', { minimumFractionDigits: 0 });
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const parts = String(d).split('T')[0].split('-');
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  } catch { return d; }
};

const getTodayStr = () => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

export const GlobalProductionPaymentModal = ({ onClose, onRefresh }) => {
  const [activeTab, setActiveTab]       = useState('pay'); // 'pay' | 'history'
  const [stats, setStats]               = useState({ totalCost: 0, totalPaid: 0, totalDue: 0, countDueLogs: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const [distributionResult, setDistributionResult] = useState(null);

  /* All payments history state */
  const [allPayments, setAllPayments]   = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyMethodFilter, setHistoryMethodFilter] = useState('All');
  const [isDeletingId, setIsDeletingId] = useState(null);

  /* Payment Form State */
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'Cash',
    payment_date: getTodayStr(),
    note: '',
    paid_by: ''
  });

  /* Sync row-level paid_amount and payment_status on factory_production_logs */
  const syncProductionLogsPaymentStatuses = async () => {
    try {
      const { data: payData } = await supabase.from('production_payments').select('amount');
      let totalAvailablePaid = (payData || []).reduce((s, p) => s + Number(p.amount || 0), 0);

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

        const newStatus = (allocatedPaid >= cost - 0.01) ? 'Paid' : (allocatedPaid > 0 ? 'Partial' : 'Due');

        if (Number(log.paid_amount) !== allocatedPaid || log.payment_status !== newStatus) {
          await supabase
            .from('factory_production_logs')
            .update({
              paid_amount: allocatedPaid,
              payment_status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('id', log.id);
        }
      }
    } catch (err) {
      console.error('Error syncing production logs payment statuses:', err);
    }
  };

  /* Load stats of all due production logs */
  const fetchGlobalStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const { data: logsData, error: logsErr } = await supabase
        .from('factory_production_logs')
        .select('id, total_cost, paid_amount, payment_status');
      if (logsErr) throw logsErr;

      let totalCost = 0;
      let countDue  = 0;

      (logsData || []).forEach(log => {
        const cost = Number(log.total_cost) || 0;
        const paid = Number(log.paid_amount) || 0;
        const due  = Math.max(0, cost - paid);

        totalCost += cost;
        if (due > 0.01) countDue++;
      });

      // Sum all payment transactions from production_payments directly
      const { data: paymentsData, error: payErr } = await supabase
        .from('production_payments')
        .select('amount');
      if (payErr) throw payErr;

      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalDue = Math.max(0, totalCost - totalPaid);

      setStats({ totalCost, totalPaid, totalDue, countDueLogs: countDue });
      setForm(prev => ({
        ...prev,
        amount: prev.amount || (totalDue > 0 ? String(Math.round(totalDue)) : '')
      }));
    } catch (e) {
      console.error('Failed to load global stats:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  /* Load all payment transactions history */
  const fetchAllPaymentsHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error: err } = await supabase
        .from('production_payments')
        .select(`
          *,
          factory_production_logs (
            product_name,
            color,
            variant,
            production_date,
            total_cost
          )
        `)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      setAllPayments(data || []);
    } catch (e) {
      console.error('Failed to fetch transaction history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalStats();
    fetchAllPaymentsHistory();
  }, [fetchGlobalStats, fetchAllPaymentsHistory]);

  /* Handle Direct Global Payment Submission */
  const handleGlobalPaymentSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setDistributionResult(null);

    const paymentAmount = parseFloat(form.amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setError('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (stats.totalDue <= 0) {
      setError('There are currently no outstanding production dues to pay.');
      return;
    }

    setIsSubmitting(true);
    try {
      const customNote = form.note.trim() || 'Global Ledger Payment';

      // Insert 1 SINGLE transaction record into production_payments with production_log_id = null
      const { error: insErr } = await supabase
        .from('production_payments')
        .insert([{
          production_log_id: null,
          amount: paymentAmount,
          payment_method: form.payment_method,
          payment_date: form.payment_date,
          note: customNote,
          paid_by: form.paid_by.trim() || null
        }]);
      if (insErr) throw insErr;

      // Sync row-level paid_amount and payment_status on factory_production_logs
      await syncProductionLogsPaymentStatuses();

      setSuccessMsg(`✅ ৳${fmt(paymentAmount)} direct global payment recorded successfully!`);
      setForm(prev => ({ ...prev, amount: '', note: '', paid_by: '' }));
      await fetchGlobalStats();
      await fetchAllPaymentsHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Global payment failed:', e);
      setError(e.message || 'Failed to process global payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* Delete transaction from audit history */
  const handleDeleteTransaction = async (payment) => {
    const label = payment.factory_production_logs?.product_name
      ? `"${payment.factory_production_logs.product_name}"`
      : 'Global Ledger Payment';

    if (!window.confirm(`Delete payment transaction of ৳${fmt(payment.amount)} for ${label}?`)) return;

    setIsDeletingId(payment.id);
    try {
      const { error: delErr } = await supabase
        .from('production_payments')
        .delete()
        .eq('id', payment.id);
      if (delErr) throw delErr;

      // Resync logs status after deletion
      await syncProductionLogsPaymentStatuses();

      await fetchGlobalStats();
      await fetchAllPaymentsHistory();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Failed to delete transaction: ' + e.message);
    } finally {
      setIsDeletingId(null);
    }
  };

  /* Filtered history transactions */
  const filteredHistory = allPayments.filter(p => {
    const term = historySearch.toLowerCase().trim();
    const prodName = String(p.factory_production_logs?.product_name || '').toLowerCase();
    const color = String(p.factory_production_logs?.color || '').toLowerCase();
    const variant = String(p.factory_production_logs?.variant || '').toLowerCase();
    const note = String(p.note || '').toLowerCase();
    const paidBy = String(p.paid_by || '').toLowerCase();
    const method = String(p.payment_method || '');

    const matchesSearch = !term || prodName.includes(term) || color.includes(term) || variant.includes(term) || note.includes(term) || paidBy.includes(term) || term.includes('global');
    const matchesMethod = historyMethodFilter === 'All' || method === historyMethodFilter;

    return matchesSearch && matchesMethod;
  });

  const overallProgress = stats.totalCost > 0 ? Math.min(100, (stats.totalPaid / stats.totalCost) * 100) : 0;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface, #fff)',
          borderRadius: '22px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '94vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 36px 90px rgba(0,0,0,0.32)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.12))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(99,102,241,0.35)'
            }}>
              <Wallet size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Global Production Payment & Ledger
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                Pay dues globally or audit all transaction logs
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '34px', height: '34px', borderRadius: '10px', border: '1px solid var(--border-color)',
              background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', flexShrink: 0
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Overall Ledger Summary Row ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
          padding: '16px 24px 12px',
          background: 'var(--bg-elevated, #f8fafc)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0
        }}>
          <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', padding: '12px 14px', border: '1px solid rgba(99,102,241,0.2)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Ledger Cost</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#6366f1' }}>৳{fmt(stats.totalCost)}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', padding: '12px 14px', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Total Paid</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981' }}>৳{fmt(stats.totalPaid)}</div>
          </div>
          <div style={{ background: 'var(--bg-surface)', borderRadius: '12px', padding: '12px 14px', border: `1px solid ${stats.totalDue > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'}` }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Outstanding Dues</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: stats.totalDue > 0 ? '#ef4444' : '#10b981' }}>
              ৳{fmt(stats.totalDue)}
            </div>
          </div>
        </div>

        {/* ── Progress Bar ── */}
        <div style={{ padding: '0 24px 12px', background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Overall Ledger Payment Progress ({stats.countDueLogs} entries with due)
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: stats.totalDue <= 0 ? '#10b981' : '#f59e0b' }}>
              {Math.round(overallProgress)}% Settled
            </span>
          </div>
          <div style={{ height: '7px', borderRadius: '99px', background: 'var(--border-color)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${overallProgress}%`,
              background: stats.totalDue <= 0 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #10b981)',
              transition: 'width 0.5s ease', borderRadius: '99px'
            }} />
          </div>
        </div>

        {/* ── Tab Switcher ── */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-surface)', padding: '0 24px', flexShrink: 0
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('pay')}
            style={{
              padding: '12px 18px', fontSize: '13px', fontWeight: 800,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: activeTab === 'pay' ? '#6366f1' : 'var(--text-secondary)',
              borderBottom: activeTab === 'pay' ? '3px solid #6366f1' : '3px solid transparent',
              display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s'
            }}
          >
            <CreditCard size={15} /> Make Global Payment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              padding: '12px 18px', fontSize: '13px', fontWeight: 800,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: activeTab === 'history' ? '#6366f1' : 'var(--text-secondary)',
              borderBottom: activeTab === 'history' ? '3px solid #6366f1' : '3px solid transparent',
              display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s'
            }}
          >
            <Receipt size={15} /> Transaction History ({allPayments.length})
          </button>
        </div>

        {/* ── Tab 1: Global Payment Form ── */}
        {activeTab === 'pay' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
            {stats.totalDue <= 0 ? (
              <div style={{
                textAlign: 'center', padding: '32px 20px', borderRadius: '16px',
                background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                color: '#10b981'
              }}>
                <CheckCheck size={36} style={{ marginBottom: '8px' }} />
                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800 }}>All Production Dues Cleared!</h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                  There are no pending dues across your production log entries.
                </p>
              </div>
            ) : (
              <div style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.05), rgba(139,92,246,0.03))',
                border: '1px solid rgba(99,102,241,0.2)', borderRadius: '16px', padding: '20px'
              }}>
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <DollarSign size={16} style={{ color: '#6366f1' }} /> Global Payment Distribution
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      Payments are auto-allocated to oldest due entries (FIFO).
                    </p>
                  </div>
                </div>

                <form onSubmit={handleGlobalPaymentSubmit}>
                  {/* Amount + Method */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Payment Amount (৳) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={stats.totalDue}
                        step="0.01"
                        value={form.amount}
                        onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                        placeholder={`Max ৳${fmt(stats.totalDue)}`}
                        required
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: '10px', boxSizing: 'border-box',
                          border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                          color: 'var(--text-primary)', fontSize: '15px', fontWeight: 800, outline: 'none'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Payment Method
                      </label>
                      <select
                        value={form.payment_method}
                        onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: '10px', boxSizing: 'border-box',
                          border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                          color: 'var(--text-primary)', fontSize: '13px', fontWeight: 700, outline: 'none', cursor: 'pointer'
                        }}
                      >
                        {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Quick percentage shortcuts */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {[25, 50, 75].map(pct => {
                      const amt = Math.round(stats.totalDue * pct / 100);
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setForm(p => ({ ...p, amount: String(amt) }))}
                          style={{
                            padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                            border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)',
                            color: '#6366f1', cursor: 'pointer'
                          }}
                        >
                          {pct}% (৳{fmt(amt)})
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, amount: String(Math.round(stats.totalDue)) }))}
                      style={{
                        padding: '6px 14px', borderRadius: '8px', fontSize: '11px', fontWeight: 800,
                        border: '1px solid rgba(16,185,129,0.35)', background: 'rgba(16,185,129,0.12)',
                        color: '#10b981', cursor: 'pointer'
                      }}
                    >
                      Pay All Dues (৳{fmt(stats.totalDue)})
                    </button>
                  </div>

                  {/* Date + Paid By */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Payment Date
                      </label>
                      <input
                        type="date"
                        value={form.payment_date}
                        onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                          border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                          color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Paid By (optional)
                      </label>
                      <input
                        type="text"
                        value={form.paid_by}
                        onChange={e => setForm(p => ({ ...p, paid_by: e.target.value }))}
                        placeholder="e.g. Accounts / Manager"
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                          border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                          color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  {/* Note */}
                  <div style={{ marginBottom: '18px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Payment Note / Reference (optional)
                    </label>
                    <input
                      type="text"
                      value={form.note}
                      onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                      placeholder="e.g. Weekly factory bill clearance batch..."
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                        border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                      }}
                    />
                  </div>

                  {/* Error & Success Messages */}
                  {error && (
                    <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} />{error}
                    </div>
                  )}

                  {successMsg && (
                    <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: '#10b981', fontSize: '13px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={16} />{successMsg}
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    style={{
                      width: '100%', padding: '12px', borderRadius: '12px', border: 'none',
                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', fontSize: '15px', fontWeight: 800, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      boxShadow: '0 8px 24px rgba(99,102,241,0.32)',
                      opacity: isSubmitting ? 0.7 : 1, transition: 'all 0.2s'
                    }}
                  >
                    {isSubmitting ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={18} />}
                    {isSubmitting ? 'Distributing Payment...' : 'Submit & Auto-Distribute Payment'}
                  </button>
                </form>

                {/* Distribution Summary breakdown */}
                {distributionResult && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(99,102,241,0.2)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Settlement Details:
                    </div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                      <span>✅ <b>{distributionResult.fullySettledCount}</b> fully paid</span>
                      <span>🟡 <b>{distributionResult.partialCount}</b> partial</span>
                    </div>
                    <div style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {distributionResult.details.map((item, idx) => (
                        <div key={idx} style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', fontSize: '11px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{item.product_name}</span>
                          <span style={{ fontWeight: 700, color: item.newStatus === 'Paid' ? '#10b981' : '#f59e0b' }}>
                            +৳{fmt(item.allocatedAmt)} ({item.newStatus})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: Transaction Audit History ── */}
        {activeTab === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
            {/* Search & Filter Header */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <input
                type="text"
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Search payments by product, note, paid by..."
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                }}
              />

              <select
                value={historyMethodFilter}
                onChange={e => setHistoryMethodFilter(e.target.value)}
                style={{
                  padding: '9px 12px', borderRadius: '10px',
                  border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontSize: '13px', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value="All">All Methods</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Transaction List */}
            {isLoadingHistory ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-color)', borderRadius: '14px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                <Receipt size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>No matching payment transactions found.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredHistory.map((p, idx) => {
                  const logItem = p.factory_production_logs;
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: '14px 16px', borderRadius: '14px',
                        background: 'var(--bg-elevated, #f8fafc)',
                        border: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: '#10b981' }}>
                            ৳{fmt(p.amount)}
                          </span>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                            background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)'
                          }}>
                            {p.payment_method}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                            📅 {fmtDate(p.payment_date)}
                          </span>
                          {p.paid_by && (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                              👤 {p.paid_by}
                            </span>
                          )}
                        </div>

                        {!p.production_log_id || !logItem ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontSize: '11px', fontWeight: 800, marginTop: '2px', border: '1px solid rgba(139,92,246,0.2)' }}>
                            🌐 Global Ledger Direct Payment
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Product: {logItem.product_name}
                            {logItem.color ? ` (${logItem.color})` : ''}
                            {logItem.variant ? ` · ${logItem.variant}` : ''}
                          </div>
                        )}

                        {p.note && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Note: {p.note}
                          </div>
                        )}
                      </div>

                      {/* Delete Action */}
                      <button
                        type="button"
                        onClick={() => handleDeleteTransaction(p)}
                        disabled={isDeletingId === p.id}
                        title="Delete payment record"
                        style={{
                          width: '32px', height: '34px', borderRadius: '10px',
                          border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.06)',
                          color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {isDeletingId === p.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
