/**
 * ProductionPaymentModal.jsx
 * ──────────────────────────────────────────────────────────────────
 * Enterprise-grade Payment Modal for Factory Production Ledger.
 *
 * Features:
 *  - Pay full due amount or partial amount
 *  - Select payment method (Cash / Bank Transfer / bKash / Nagad / Other)
 *  - Set payment date & add a note
 *  - View full payment history / transaction log
 *  - Auto-updates payment_status in factory_production_logs
 *  - Saves transaction to production_payments table
 * ──────────────────────────────────────────────────────────────────
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Clock, CreditCard, Plus, Loader2,
  Calendar, DollarSign, AlertCircle, Trash2, X,
  Receipt, ArrowDownLeft, Wallet
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CurrencyIcon from '../components/CurrencyIcon';

/* ─── Payment Method Options ─── */
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'bKash', 'Nagad', 'Rocket', 'Other'];

/* ─── Helpers ─── */
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

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════ */
export const ProductionPaymentModal = ({ log, onClose, onRefresh }) => {
  /* ── State ── */
  const [payments, setPayments]         = useState([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting]     = useState(null); // id of row being deleted
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');

  const totalCost   = Number(log.total_cost) || 0;
  const paidSoFar   = Number(log.paid_amount || 0);
  const dueAmount   = Math.max(0, totalCost - paidSoFar);
  const isFullyPaid = dueAmount <= 0;

  /* ── Payment form ── */
  const [form, setForm] = useState({
    amount: isFullyPaid ? '' : String(Math.round(dueAmount)),
    payment_method: 'Cash',
    payment_date: getTodayStr(),
    note: '',
    paid_by: ''
  });

  /* ── Load payment history ── */
  const fetchPayments = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('production_payments')
        .select('*')
        .eq('production_log_id', log.id)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      setPayments(data || []);
    } catch (e) {
      console.error('Failed to fetch payments:', e);
    } finally {
      setIsLoading(false);
    }
  }, [log.id]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  /* ── Handle payment submission ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    const amt = parseFloat(form.amount);
    if (isNaN(amt) || amt <= 0) {
      setError('Payment amount must be greater than 0.');
      return;
    }
    if (amt > dueAmount + 0.01) {
      setError(`Amount ৳${fmt(amt)} exceeds due amount ৳${fmt(dueAmount)}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      /* 1. Insert payment transaction */
      const { error: insertErr } = await supabase
        .from('production_payments')
        .insert([{
          production_log_id: log.id,
          amount: amt,
          payment_method: form.payment_method,
          payment_date: form.payment_date,
          note: form.note.trim() || null,
          paid_by: form.paid_by.trim() || null
        }]);
      if (insertErr) throw insertErr;

      /* 2. Update paid_amount and payment_status on production log */
      const newPaidAmount = paidSoFar + amt;
      const newStatus = newPaidAmount >= totalCost - 0.01 ? 'Paid' : 'Partial';

      const { error: updateErr } = await supabase
        .from('factory_production_logs')
        .update({
          paid_amount: newPaidAmount,
          payment_status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', log.id);
      if (updateErr) throw updateErr;

      setSuccessMsg(`✅ ৳${fmt(amt)} payment recorded successfully!`);
      setForm(prev => ({
        ...prev,
        amount: '',
        note: '',
        paid_by: ''
      }));

      await fetchPayments();
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('Payment error:', e);
      setError(e.message || 'Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Delete a payment ── */
  const handleDeletePayment = async (payment) => {
    if (!window.confirm(`Delete payment of ৳${fmt(payment.amount)}? This will reduce paid amount.`)) return;
    setIsDeleting(payment.id);
    try {
      const { error: delErr } = await supabase
        .from('production_payments')
        .delete()
        .eq('id', payment.id);
      if (delErr) throw delErr;

      /* Recalculate paid_amount from remaining payments */
      const remaining = payments.filter(p => p.id !== payment.id);
      const newPaidAmount = remaining.reduce((sum, p) => sum + Number(p.amount), 0);
      const newStatus = newPaidAmount >= totalCost - 0.01 ? 'Paid' : newPaidAmount > 0 ? 'Partial' : 'Due';

      await supabase
        .from('factory_production_logs')
        .update({ paid_amount: newPaidAmount, payment_status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', log.id);

      await fetchPayments();
      if (onRefresh) onRefresh();
    } catch (e) {
      alert('Failed to delete payment: ' + e.message);
    } finally {
      setIsDeleting(null);
    }
  };

  /* ── Derived display values ── */
  const progressPct = totalCost > 0 ? Math.min(100, (paidSoFar / totalCost) * 100) : 0;
  const statusLabel = isFullyPaid ? 'Paid' : paidSoFar > 0 ? 'Partial' : 'Due';
  const statusColor = isFullyPaid ? '#10b981' : paidSoFar > 0 ? '#f59e0b' : '#ef4444';

  return (
    /* ── Backdrop ── */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 99998,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-surface, #fff)',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '92vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 32px 80px rgba(0,0,0,0.28)',
          border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '20px 24px 16px',
          borderBottom: '1px solid var(--border-color, #e5e7eb)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.06), transparent)',
          flexShrink: 0
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Wallet size={18} color="#fff" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Production Payment
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {log.product_name}{log.color ? ` · ${log.color}` : ''}{log.variant ? ` · ${log.variant}` : ''}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px', height: '32px', borderRadius: '8px', border: '1px solid var(--border-color)',
              background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-secondary)', flexShrink: 0
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
          padding: '16px 24px',
          background: 'var(--bg-elevated, #f8fafc)',
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0
        }}>
          {[
            { label: 'Total Cost', value: totalCost, color: '#6366f1' },
            { label: 'Paid', value: paidSoFar, color: '#10b981' },
            { label: 'Remaining Due', value: dueAmount, color: dueAmount > 0 ? '#ef4444' : '#10b981' }
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'var(--bg-surface)',
              borderRadius: '12px',
              padding: '12px 14px',
              border: `1px solid ${color}22`,
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color }}>৳{fmt(value)}</div>
            </div>
          ))}
        </div>

        {/* ── Progress Bar ── */}
        <div style={{ padding: '0 24px 12px', background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Payment Progress</span>
            <span style={{ fontSize: '11px', fontWeight: 800, color: statusColor }}>
              {statusLabel} — {Math.round(progressPct)}%
            </span>
          </div>
          <div style={{ height: '8px', borderRadius: '99px', background: 'var(--border-color)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progressPct}%`,
              background: isFullyPaid
                ? 'linear-gradient(90deg, #10b981, #34d399)'
                : paidSoFar > 0
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)',
              transition: 'width 0.5s ease', borderRadius: '99px'
            }} />
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 24px' }}>

          {/* ── Add Payment Form ── */}
          {!isFullyPaid && (
            <div style={{
              marginTop: '20px',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.04))',
              border: '1px solid rgba(99,102,241,0.2)',
              borderRadius: '16px',
              padding: '18px'
            }}>
              <h3 style={{ margin: '0 0 14px', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Plus size={14} style={{ color: '#6366f1' }} /> Record New Payment
              </h3>

              <form onSubmit={handleSubmit}>
                {/* Row 1: Amount + Method */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Amount (৳) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={dueAmount}
                      step="0.01"
                      value={form.amount}
                      onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder={`Max ৳${fmt(dueAmount)}`}
                      required
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                        border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', fontSize: '14px', fontWeight: 700, outline: 'none'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Method
                    </label>
                    <select
                      value={form.payment_method}
                      onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px',
                        border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, outline: 'none', cursor: 'pointer'
                      }}
                    >
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 2: Date + Paid By */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Paid By (optional)
                    </label>
                    <input
                      type="text"
                      value={form.paid_by}
                      onChange={e => setForm(p => ({ ...p, paid_by: e.target.value }))}
                      placeholder="e.g. Factory Manager"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                        border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                        color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                      }}
                    />
                  </div>
                </div>

                {/* Note */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Note (optional)
                  </label>
                  <input
                    type="text"
                    value={form.note}
                    onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                    placeholder="e.g. Advance payment, installment #1..."
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: '10px', boxSizing: 'border-box',
                      border: '1px solid var(--border-color)', background: 'var(--bg-surface)',
                      color: 'var(--text-primary)', fontSize: '13px', outline: 'none'
                    }}
                  />
                </div>

                {/* Quick amount buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {[25, 50, 75, 100].map(pct => {
                    const amt = Math.round(dueAmount * pct / 100);
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setForm(p => ({ ...p, amount: String(amt) }))}
                        style={{
                          padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                          border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)',
                          color: '#6366f1', cursor: 'pointer', transition: 'all 0.15s'
                        }}
                      >
                        {pct}% (৳{fmt(amt)})
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, amount: String(Math.round(dueAmount)) }))}
                    style={{
                      padding: '5px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 700,
                      border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)',
                      color: '#10b981', cursor: 'pointer'
                    }}
                  >
                    Full Due (৳{fmt(dueAmount)})
                  </button>
                </div>

                {/* Error / Success */}
                {error && (
                  <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={14} />{error}
                  </div>
                )}
                {successMsg && (
                  <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: '13px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={14} />{successMsg}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    width: '100%', padding: '11px', borderRadius: '12px', border: 'none',
                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                    color: '#fff', fontSize: '14px', fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
                    opacity: isSubmitting ? 0.7 : 1,
                    transition: 'all 0.2s'
                  }}
                >
                  {isSubmitting ? <Loader2 size={16} className="spin" style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={16} />}
                  {isSubmitting ? 'Processing...' : `Record Payment`}
                </button>
              </form>
            </div>
          )}

          {/* Fully paid badge */}
          {isFullyPaid && (
            <div style={{
              marginTop: '20px',
              padding: '16px 20px',
              borderRadius: '14px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.25)',
              display: 'flex', alignItems: 'center', gap: '12px'
            }}>
              <CheckCircle2 size={28} color="#10b981" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>Fully Paid ✓</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Total ৳{fmt(totalCost)} has been paid in {payments.length} transaction{payments.length !== 1 ? 's' : ''}.
                </div>
              </div>
            </div>
          )}

          {/* ── Transaction History ── */}
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Receipt size={14} style={{ color: '#6366f1' }} />
              Payment History ({payments.length})
            </h3>

            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : payments.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '28px 20px', borderRadius: '12px',
                border: '1px dashed var(--border-color)', color: 'var(--text-tertiary)',
                fontSize: '13px'
              }}>
                <ArrowDownLeft size={24} style={{ opacity: 0.4, marginBottom: '8px' }} />
                <p style={{ margin: 0 }}>No payment transactions yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {payments.map((p, idx) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px',
                      background: 'var(--bg-elevated, #f8fafc)',
                      borderRadius: '12px',
                      border: '1px solid var(--border-color)',
                      transition: 'all 0.15s'
                    }}
                  >
                    {/* Index */}
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.1))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '11px', fontWeight: 800, color: '#6366f1', flexShrink: 0
                    }}>
                      #{idx + 1}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#10b981' }}>
                          ৳{fmt(p.amount)}
                        </span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                          background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                          border: '1px solid rgba(99,102,241,0.2)'
                        }}>
                          {p.payment_method}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          {fmtDate(p.payment_date)}
                        </span>
                        {p.paid_by && (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            · {p.paid_by}
                          </span>
                        )}
                      </div>
                      {p.note && (
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.note}
                        </div>
                      )}
                    </div>

                    {/* Delete btn */}
                    <button
                      onClick={() => handleDeletePayment(p)}
                      disabled={isDeleting === p.id}
                      title="Delete this payment"
                      style={{
                        width: '28px', height: '28px', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)',
                        background: 'rgba(239,68,68,0.06)', color: '#ef4444', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        opacity: isDeleting === p.id ? 0.5 : 1
                      }}
                    >
                      {isDeleting === p.id
                        ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        : <Trash2 size={12} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
