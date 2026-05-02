import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X, Download, FileSpreadsheet, CheckCircle2, Loader2,
  History, AlertTriangle, Package, CheckSquare, Calendar,
  Zap, TrendingUp, Users
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './BulkExportModal.css';

// ── Constants ────────────────────────────────────────────────
const EXPORT_HISTORY_KEY = 'factory:bulk-export-history-v2';

const DATE_PRESETS = [
  { id: 'sinceLast', label: 'Since Last Export' },
  { id: 'all',       label: 'All Time'           },
  { id: 'today',     label: 'Today'              },
  { id: 'yesterday', label: 'Yesterday'          },
  { id: 'thisWeek',  label: 'This Week'          },
  { id: 'thisMonth', label: 'This Month'         },
];

// ── Date helpers ─────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-BD', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const fmtShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(-2)}`;
};

const matchesPreset = (iso, preset, lastExportedUntil, lastExportedIds = []) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();

  if (preset === 'sinceLast') {
    // Orders already successfully exported (by ID) are excluded
    // All other Confirmed orders since last export timestamp are included
    const since = lastExportedUntil ? new Date(lastExportedUntil) : null;
    return !since || d >= since;
  }
  if (preset === 'all') return true;
  if (preset === 'today') return d.toDateString() === now.toDateString();
  if (preset === 'yesterday') {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    return d.toDateString() === y.toDateString();
  }
  if (preset === 'thisWeek') {
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }
  if (preset === 'thisMonth') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  return true;
};

/**
 * Attempt to update a single order status up to maxRetries times.
 * Returns true on success, false on final failure.
 */
const updateWithRetry = async (onStatusChange, orderId, status, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await onStatusChange(orderId, status);
      return true;
    } catch (err) {
      if (attempt === maxRetries) return false;
      // Exponential backoff: 400ms, 800ms
      await new Promise(r => setTimeout(r, attempt * 400));
    }
  }
  return false;
};

const matchesDateRange = (iso, from, to) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (from && d < new Date(from)) return false;
  if (to)  { const t = new Date(to + 'T23:59:59'); if (d > t) return false; }
  return true;
};

const formatPhone = (v='') => String(v).replace(/\D/g,'').replace(/^88/,'').replace(/^0/,'');
const formatZone  = (v='') => {
  const t = String(v).toLowerCase();
  if (t.includes('inside') || t === 'dhaka') return 'Dhaka';
  if (t.includes('outside')) return 'Outside Dhaka';
  return String(v);
};
const formatSource = (v='') => {
  const s = String(v).trim();
  return s.toLowerCase() === 'website' ? 'NEW WEB' : s.toUpperCase();
};

// ── XLSX row builder (matches existing FactoryPanel format) ──
const EXPORT_COLS = [
  'DATE','NOTE','NAME','ADDRESS','inside and outside','Phone',
  'code','CODE','Source','QTY(TOY)','QTY(MPB)','ORG QTY','MMB',
  'STB BAG','OTHER','toy box am','MPB AM','ORG AM','MMB AM','BAG',
  'OTHER (AM)','DELIVERY CHARGE','Total amount'
];

const getCategory = (text='') => {
  const t = text.toLowerCase();
  if (t.includes('toy box') || t.includes('toybox')) return 'toy';
  if (t.includes('mpb') || t.includes('multipurpose'))  return 'mpb';
  if (t.includes('org') || t.includes('organizer'))     return 'org';
  if (t.includes('mmb') || t.includes('mini'))          return 'mmb';
  if (t.includes('stb') || t.includes('travel bag') || /\bbag\b/.test(t)) return 'stb';
  return 'other';
};

const QTY_COL = { toy:'QTY(TOY)', mpb:'QTY(MPB)', org:'ORG QTY', mmb:'MMB', stb:'STB BAG', other:'OTHER' };
const AMT_COL = { toy:'toy box am', mpb:'MPB AM', org:'ORG AM', mmb:'MMB AM', stb:'BAG', other:'OTHER (AM)' };
const CODE_MAP = { toy:'Toy Box', mpb:'MPB', org:'ORG', mmb:'MMB', stb:'Travel bag', other:'OTHER' };

// ── Delivery Charge Resolver ─────────────────────────────────
// Rule: Use EXACTLY what is stored in the DB — set from landing page or
// last edited in Order Modal. No guessing, no zone-based fallback.
// Priority:
//   1. order.delivery_charge        ← direct DB field (landing page / order modal)
//   2. pricing_summary.delivery_charge ← backup (older orders)
//   3. 0  ← never hardcode 60 / 130 / 80 / 150 as fallback
const resolveDeliveryCharge = (order) => {
  const direct = Number(order?.delivery_charge);
  if (Number.isFinite(direct) && direct >= 0) return direct;

  const summary = Number(order?.pricing_summary?.delivery_charge);
  if (Number.isFinite(summary) && summary >= 0) return summary;

  return 0; // unknown — blank cell is safer than a wrong number
};

const buildRow = (order) => {
  const row = Object.fromEntries(EXPORT_COLS.map(c => [c, '']));
  const items = Array.isArray(order?.ordered_items) ? order.ordered_items : [];
  // Use exact delivery charge stored on the order (from landing page / order modal)
  // resolveDeliveryCharge() mirrors OrderEditModal's getStoredDeliveryCharge exactly
  const deliveryCharge = resolveDeliveryCharge(order);
  const total = Number(order?.amount) || 0;
  const productText = [order?.product_name, order?.size, ...items.map(i => i?.name||'')].filter(Boolean).join(' ');
  const cat = getCategory(productText);
  const code = CODE_MAP[cat] || order?.product_name || 'OTHER';

  row.DATE = fmtShort(order.created_at);
  row.NOTE = order.notes || '';
  row.NAME = order.customer_name || '';
  row.ADDRESS = order.address || '';
  row['inside and outside'] = formatZone(order.shipping_zone);
  row.Phone = formatPhone(order.phone);
  row.code = code;
  row.CODE = code;
  row.Source = formatSource(order.source);
  row['DELIVERY CHARGE'] = deliveryCharge || '';
  row['Total amount'] = total || '';

  if (items.length === 0) {
    row[QTY_COL[cat]] = Number(order.quantity) || 1;
    row[AMT_COL[cat]] = Math.max(0, total - deliveryCharge) || '';
  } else {
    let allocated = 0;
    items.forEach(item => {
      const ic = getCategory([item?.name, item?.variant, item?.color].filter(Boolean).join(' ') || productText);
      const qty = Number(item?.quantity || item?.qty) || 1;
      const amt = Number(item?.line_total || item?.amount || 0);
      row[QTY_COL[ic]] = (Number(row[QTY_COL[ic]])||0) + qty;
      if (amt > 0) { row[AMT_COL[ic]] = (Number(row[AMT_COL[ic]])||0) + amt; allocated += amt; }
    });
    if (allocated === 0) row[AMT_COL[cat]] = Math.max(0, total - deliveryCharge) || '';
  }
  return row;
};

// ── Component ────────────────────────────────────────────────
/**
 * BulkExportModal — Enterprise Bulk Export System
 * Props:
 *   isOpen, onClose
 *   confirmedOrders: order[]  — all orders with status === 'Confirmed'
 *   selectedIds: string[]     — currently checked order IDs from parent table
 *   onStatusChange: (id, status) => Promise  — update order status
 *   exportedBy: string        — current user name
 */
export const BulkExportModal = ({
  isOpen, onClose,
  confirmedOrders = [],
  allOrders = [],
  selectedIds = [],
  onStatusChange,
  exportedBy = 'System'
}) => {
  // ── Filter state ───────────────────────────────────────────
  const [preset, setPreset]   = useState('sinceLast');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const hasCustomRange = Boolean(dateFrom || dateTo);

  // ── Scope: 'all' = date-filtered, 'selected' = checkbox-selected
  const [scope, setScope] = useState('all');

  // ── Export history (localStorage) ─────────────────────────
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY)) || []; }
    catch { return []; }
  });
  const lastExport = history[0] || null;

  // ── Progress state ─────────────────────────────────────────
  const [phase, setPhase] = useState('idle'); // idle | exporting | moving | done | error
  const [progress, setProgress] = useState(0);
  const [orderChips, setOrderChips] = useState({}); // id -> 'pending'|'processing'|'done'|'failed'
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setPhase('idle');
      setProgress(0);
      setOrderChips({});
      setErrorMsg('');
      setScope(selectedIds.length > 0 ? 'selected' : 'all');
      setPreset('sinceLast');
      setDateFrom('');
      setDateTo('');
      abortRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    try { localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 20))); }
    catch {}
  }, [history]);

  // ── Compute which orders will be exported ──────────────────
  // Guard: deduplicate by ID (safety net against React rendering double entries)
  const exportOrders = useMemo(() => {
    let base;
    if (scope === 'selected') {
      base = confirmedOrders.filter(o => selectedIds.includes(o.id));
    } else {
      // Also exclude IDs already in the last export's successful set
      const lastSuccessIds = new Set(lastExport?.succeeded_ids || []);
      base = confirmedOrders.filter(o => {
        if (lastSuccessIds.has(o.id)) return false; // already exported successfully
        if (hasCustomRange) return matchesDateRange(o.created_at, dateFrom, dateTo);
        return matchesPreset(o.created_at, preset, lastExport?.exported_until);
      });
    }
    // Deduplicate by order ID
    const seen = new Set();
    return base.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  }, [confirmedOrders, scope, selectedIds, preset, dateFrom, dateTo, hasCustomRange, lastExport]);

  const totalAmount = useMemo(
    () => exportOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0),
    [exportOrders]
  );

  const canExport = exportOrders.length > 0 && (phase === 'idle' || phase === 'done' || phase === 'error');
  // Double-click guard — prevents firing handleExport twice
  const isRunningRef = useRef(false);

  // ── Handle Re-download Last Export ────────────────────────
  const handleRedownload = () => {
    if (!lastExport || !lastExport.succeeded_ids || lastExport.succeeded_ids.length === 0) return;
    
    const idsToDownload = new Set(lastExport.succeeded_ids);
    const ordersToDownload = allOrders.filter(o => idsToDownload.has(o.id));
    
    if (ordersToDownload.length === 0) {
      alert('Orders not found. They might have been permanently deleted or not loaded yet.');
      return;
    }
    
    const sorted = [...ordersToDownload].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );
    
    const rows = sorted.map(buildRow);
    const ws   = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLS });
    const wb   = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Confirmed Orders');
    
    const dateLabel = new Date(lastExport.exported_at).toISOString().slice(0, 10);
    XLSX.writeFile(wb, `redownload-bulk-export-${dateLabel}.xlsx`);
  };

  // ── Handle export ──────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!canExport || isRunningRef.current) return; // double-click guard
    isRunningRef.current = true;
    abortRef.current = false;
    setPhase('exporting');
    setProgress(5);
    setErrorMsg('');

    // Snapshot orders NOW — freeze the list for this batch
    // Sort oldest→newest so "Since Last Export" boundary is correct
    const sorted = [...exportOrders].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    );

    // Init realtime chips
    const chips = {};
    sorted.forEach(o => { chips[o.id] = 'pending'; });
    setOrderChips({ ...chips });

    // exported_until = the OLDEST order's created_at in this batch.
    // This ensures next "Since Last Export" starts from the correct boundary
    // and any order that failed status update still appears next time.
    const oldestCreatedAt = sorted[0]?.created_at || new Date().toISOString();
    const newestCreatedAt = sorted[sorted.length - 1]?.created_at || new Date().toISOString();

    try {
      // ── STEP 1: Generate & Download XLSX ──────────────────
      await new Promise(r => setTimeout(r, 80));
      const rows = sorted.map(buildRow);
      const ws   = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLS });
      const wb   = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Confirmed Orders');
      const dateLabel = new Date().toISOString().slice(0, 10);
      const timeLabel = new Date().toTimeString().slice(0, 5).replace(':', 'h');
      XLSX.writeFile(wb, `bulk-export-confirmed-${dateLabel}-${timeLabel}.xlsx`);
      setProgress(20);

      // ── STEP 2: Move each order → "Bulk Exported" (with retry) ──
      setPhase('moving');
      const total = sorted.length;
      let doneCount = 0;
      const succeededIds = [];
      const failedIds    = [];

      for (const order of sorted) {
        if (abortRef.current) break;
        setOrderChips(prev => ({ ...prev, [order.id]: 'processing' }));

        const ok = await updateWithRetry(onStatusChange, order.id, 'Bulk Exported', 3);

        if (ok) {
          succeededIds.push(order.id);
          setOrderChips(prev => ({ ...prev, [order.id]: 'done' }));
        } else {
          failedIds.push(order.id);
          setOrderChips(prev => ({ ...prev, [order.id]: 'failed' }));
        }
        doneCount++;
        setProgress(20 + Math.round((doneCount / total) * 75));
      }

      setProgress(100);

      // ── STEP 3: Persist history ───────────────────────────
      // exported_until = oldest order's created_at so next sinceLast is correct
      // succeeded_ids  = IDs that were actually moved (for dedup on next run)
      const record = {
        id: `exp-${Date.now()}`,
        exported_at:    new Date().toISOString(),
        exported_until: oldestCreatedAt,   // ← KEY: boundary for next sinceLast
        newest_order_at: newestCreatedAt,
        exported_by:    exportedBy,
        order_count:    sorted.length,
        succeeded_ids:  succeededIds,      // ← dedup guard for next run
        failed_ids:     failedIds,
        order_ids:      sorted.map(o => o.id),
        preset:         scope === 'selected' ? 'manual-selection' : preset,
        total_amount:   totalAmount,
        failed_count:   failedIds.length,
      };
      setHistory(prev => [record, ...prev].slice(0, 20));
      setPhase('done');

    } catch (err) {
      console.error('[BulkExportModal]', err);
      setErrorMsg(err.message || 'Export failed. Please try again.');
      setPhase('error');
    } finally {
      isRunningRef.current = false;
    }
  }, [canExport, exportOrders, onStatusChange, exportedBy, scope, preset, totalAmount]);

  if (!isOpen) return null;

  const pct = Math.round(progress);
  const phaseLabel = phase === 'exporting' ? 'Generating XLSX file...'
    : phase === 'moving' ? 'Moving orders → Bulk Exported...'
    : phase === 'done'   ? 'Export complete!'
    : phase === 'error'  ? `Error: ${errorMsg}`
    : '';

  return (
    <div className="bem-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bem-modal" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="bem-header">
          <div className="bem-header-left">
            <div className="bem-header-icon">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <p className="bem-header-title">Bulk Export System</p>
              <p className="bem-header-subtitle">Export confirmed orders → XLSX + auto-move to Bulk Exported</p>
            </div>
          </div>
          <button className="bem-header-close" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Stats bar */}
        <div className="bem-stats-bar">
          <div className="bem-stat">
            <span className="bem-stat-value indigo">{confirmedOrders.length}</span>
            <span className="bem-stat-label">Total Confirmed</span>
          </div>
          <div className="bem-stat">
            <span className="bem-stat-value green">{exportOrders.length}</span>
            <span className="bem-stat-label">Ready to Export</span>
          </div>
          <div className="bem-stat">
            <span className="bem-stat-value orange">{selectedIds.length}</span>
            <span className="bem-stat-label">Selected</span>
          </div>
          <div className="bem-stat">
            <span className="bem-stat-value blue">৳{totalAmount.toLocaleString()}</span>
            <span className="bem-stat-label">Batch Value</span>
          </div>
        </div>

        {/* Body */}
        <div className="bem-body">

          {/* Last export info */}
          {lastExport && (
            <div className="bem-last-export-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={14} />
                <span>Last export: <strong>{lastExport.order_count} orders</strong> by {lastExport.exported_by} · {fmtDate(lastExport.exported_at)}</span>
              </div>
              <button 
                type="button" 
                onClick={handleRedownload}
                style={{
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  background: 'var(--card-bg, #ffffff)',
                  border: '1px solid var(--border-color)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: 'var(--text-color)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--primary-color)'; e.currentTarget.style.color = 'var(--primary-color)'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-color)'; }}
              >
                <Download size={12} /> Redownload
              </button>
            </div>
          )}

          {/* Scope selector */}
          <div className="bem-section">
            <p className="bem-section-title">Export Scope</p>
            <div className="bem-scope-toggle">
              <button className={`bem-scope-btn ${scope==='all' ? 'active' : ''}`} onClick={() => setScope('all')}>
                <div className="bem-scope-icon purple"><TrendingUp size={16}/></div>
                <div className="bem-scope-text">
                  <strong>Date Filtered</strong>
                  <span>Export by date preset or range</span>
                </div>
              </button>
              <button className={`bem-scope-btn ${scope==='selected' ? 'active' : ''}`} onClick={() => setScope('selected')}>
                <div className="bem-scope-icon blue"><CheckSquare size={16}/></div>
                <div className="bem-scope-text">
                  <strong>Manual Selection</strong>
                  <span>{selectedIds.length} orders checked in table</span>
                </div>
              </button>
            </div>
          </div>

          {/* Date filter (only for 'all' scope) */}
          {scope === 'all' && (
            <div className="bem-section">
              <p className="bem-section-title">Date Filter</p>
              <div className="bem-filter-row">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`bem-preset-chip ${!hasCustomRange && preset===p.id ? 'active' : ''}`}
                    onClick={() => { setPreset(p.id); setDateFrom(''); setDateTo(''); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="bem-date-grid">
                <div className="bem-date-field">
                  <label>From</label>
                  <input type="date" className="bem-date-input" value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPreset('all'); }} />
                </div>
                <div className="bem-date-field">
                  <label>To</label>
                  <input type="date" className="bem-date-input" value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPreset('all'); }} />
                </div>
                <button className="bem-reset-btn" disabled={!hasCustomRange && preset==='all'}
                  onClick={() => { setDateFrom(''); setDateTo(''); setPreset('sinceLast'); }}>
                  Reset
                </button>
              </div>
            </div>
          )}

          {/* Manual selection warning */}
          {scope === 'selected' && selectedIds.length === 0 && (
            <div className="bem-section">
              <div className="bem-info-box warning">
                <AlertTriangle size={15} style={{flexShrink:0}}/>
                <span>No orders are checked. Go back to the table and select orders using the checkboxes, then open this modal again.</span>
              </div>
            </div>
          )}

          {/* Orders preview table */}
          {exportOrders.length > 0 && phase === 'idle' && (
            <div className="bem-section">
              <p className="bem-section-title">Preview — {exportOrders.length} Orders</p>
              <div className="bem-preview-table-wrap">
                <table className="bem-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Order ID</th>
                      <th>Customer</th>
                      <th>Product</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportOrders.slice(0, 50).map((o, idx) => (
                      <tr key={o.id}>
                        <td style={{color:'#94a3b8', fontSize:'0.75rem'}}>{idx+1}</td>
                        <td><span className="bem-order-id-badge">#{(o.id||'').replace('ORD-','')}</span></td>
                        <td>{o.customer_name}</td>
                        <td style={{maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{o.product_name}</td>
                        <td style={{fontWeight:600}}>৳{Number(o.amount||0).toLocaleString()}</td>
                        <td style={{color:'#64748b', fontSize:'0.76rem'}}>{fmtShort(o.created_at)}</td>
                      </tr>
                    ))}
                    {exportOrders.length > 50 && (
                      <tr>
                        <td colSpan={6} style={{textAlign:'center', color:'#64748b', padding:'8px', fontSize:'0.78rem'}}>
                          +{exportOrders.length - 50} more orders...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Realtime progress */}
          {(phase === 'exporting' || phase === 'moving') && (
            <div className="bem-progress-section">
              <div className="bem-progress-header">
                <div className="bem-progress-label">
                  <Loader2 size={16} className="bem-spin" />
                  <span>{phaseLabel}</span>
                </div>
                <span className="bem-progress-pct">{pct}%</span>
              </div>
              <div className="bem-progress-track">
                <div className="bem-progress-fill" style={{width: `${pct}%`}} />
              </div>
              <p className="bem-progress-msg">
                {Object.values(orderChips).filter(s=>s==='done').length} / {exportOrders.length} orders processed
              </p>
              <div className="bem-order-progress-chips">
                {Object.entries(orderChips).map(([id, status]) => (
                  <span key={id} className={`bem-order-chip ${status}`}>
                    #{id.replace('ORD-','')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Success banner */}
          {phase === 'done' && (() => {
            const failedCount = Object.values(orderChips).filter(s => s === 'failed').length;
            const doneCount   = Object.values(orderChips).filter(s => s === 'done').length;
            return (
              <div className="bem-success-banner">
                <div className="bem-success-icon"><CheckCircle2 size={18}/></div>
                <div className="bem-success-text">
                  <h4>Export Complete!</h4>
                  <p>
                    <strong>{doneCount} orders</strong> exported to XLSX and moved to <strong>Bulk Exported</strong>.
                    {failedCount > 0 && (
                      <span style={{color:'#f59e0b', display:'block', marginTop:4}}>
                        ⚠️ {failedCount} orders failed after 3 retries — they remain Confirmed and will appear in the next export.
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Error banner */}
          {phase === 'error' && (
            <div className="bem-section">
              <div className="bem-info-box warning">
                <AlertTriangle size={15} style={{flexShrink:0}}/>
                <span>{errorMsg}</span>
              </div>
            </div>
          )}

          {/* Export history */}
          {history.length > 0 && phase === 'idle' && (
            <div className="bem-section">
              <p className="bem-section-title">Recent Exports</p>
              <div className="bem-history-list">
                {history.slice(0, 4).map(item => (
                  <div className="bem-history-item" key={item.id}>
                    <div className="bem-history-item-icon"><Package size={14}/></div>
                    <div className="bem-history-item-info">
                      <strong>{item.order_count} orders · ৳{Number(item.total_amount||0).toLocaleString()}</strong>
                      <span>{fmtDate(item.exported_at)} by {item.exported_by}</span>
                    </div>
                    <span className="bem-history-badge">Done</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>{/* end body */}

        {/* Footer */}
        <div className="bem-footer">
          <div className="bem-footer-info">
            {phase === 'idle' && exportOrders.length > 0 &&
              `${exportOrders.length} orders · ৳${totalAmount.toLocaleString()} · XLSX format`}
            {phase === 'done' && 'All orders moved to Bulk Exported ✓'}
          </div>
          <div className="bem-footer-actions">
            <button className="bem-cancel-btn" onClick={onClose}>
              {phase === 'done' ? 'Close' : 'Cancel'}
            </button>
            {phase !== 'done' && (
              <button
                className={`bem-export-btn ${(phase==='exporting'||phase==='moving') ? 'running' : ''}`}
                disabled={!canExport || exportOrders.length === 0}
                onClick={handleExport}
              >
                {(phase === 'exporting' || phase === 'moving')
                  ? <><Loader2 size={16} className="bem-spin"/> Processing...</>
                  : <><Zap size={16}/> Export {exportOrders.length} Orders</>
                }
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
