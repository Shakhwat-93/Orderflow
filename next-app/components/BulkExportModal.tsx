'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  History,
  AlertTriangle,
  Package,
  CheckSquare,
  Calendar,
  Zap,
  TrendingUp,
  Users
} from 'lucide-react';
import { getFormattedProductName } from '../utils/productCatalog';

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
const fmtDate = (iso?: string) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-BD', {
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
};

const fmtShort = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth()+1}/${String(d.getFullYear()).slice(-2)}`;
};

const matchesPreset = (iso?: string, preset?: string, lastExportedUntil?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();

  if (preset === 'sinceLast') {
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

const updateWithRetry = async (
  onStatusChange: (id: string, status: string) => Promise<any>,
  orderId: string,
  status: string,
  maxRetries = 3
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await onStatusChange(orderId, status);
      return true;
    } catch (err) {
      if (attempt === maxRetries) return false;
      await new Promise(r => setTimeout(r, attempt * 400));
    }
  }
  return false;
};

const matchesDateRange = (iso?: string, from?: string, to?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  if (from && d < new Date(from)) return false;
  if (to)  { const t = new Date(to + 'T23:59:59'); if (d > t) return false; }
  return true;
};

const formatPhone = (v: any = '') => String(v || '').replace(/\D/g,'').replace(/^88/,'').replace(/^0/,'');
const formatSource = (v: any = '') => {
  const s = String(v || '').trim();
  return s.toLowerCase() === 'website' ? 'NEW WEB' : s.toUpperCase();
};

// ── XLSX row builder (matches EXACT user format requested) ──
const EXPORT_COLS = [
  'DATE', 'NOTE', 'NAME', 'ADDRESS', 'INSIDE/OUTSIDE DHAKA', 'PHONE',
  'ORDER ID', 'ORDER SHORT', 'COLOR CODE', 'SOURCE', 'QUANTITY',
  'PRODUCT PRICE', 'DELIVERY CHARGE', 'TOTAL AMOUNT'
];

const getShortNameWithColor = (text = '') => {
  const t = String(text || '').toLowerCase();
  let base = t;
  if (t.includes('toy box') || t.includes('toybox')) base = 'toy box';
  else if (t.includes('mpb') || t.includes('multipurpose')) base = 'mpb';
  else if (t.includes('org') || t.includes('organizer')) base = 'org';
  else if (t.includes('mmb') || t.includes('mini')) base = 'mmb';
  else if (t.includes('stb') || t.includes('travel bag') || t.includes('gym bag')) {
     if (t.includes('gym bag')) base = 'gym bag';
     else base = 'stb';
  }
  else if (t.includes('sunglass')) base = 'sunglass';

  const colors: string[] = [];
  ['black', 'beige', 'blue', 'red', 'golden', 'white', 'green', 'pink', 'grey', 'gray', 'silver', 'brown'].forEach(c => {
    if (t.includes(c)) colors.push(c);
  });
  
  if (colors.length > 0 && base !== t) {
     return `${base} ${colors.join(' ')}`;
  }
  return base;
};

const formatDateForXlsx = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  } catch {
    return iso;
  }
};

const buildRow = (order: any) => {
  const row: Record<string, any> = {};
  
  row['DATE'] = formatDateForXlsx(order.created_at);
  row['NOTE'] = order.notes || '';
  row['NAME'] = order.customer_name || '';
  row['ADDRESS'] = order.address || '';
  
  const lowerZone = String(order.shipping_zone || '').toLowerCase();
  row['INSIDE/OUTSIDE DHAKA'] = lowerZone.includes('inside') ? 'Inside Dhaka' 
                              : lowerZone.includes('outside') ? 'Outside Dhaka' 
                              : 'Outside Dhaka';
                              
  row['PHONE'] = formatPhone(order.phone);
  row['ORDER ID'] = order.id || '';
  
  const productDetails = Array.isArray(order?.order_lines_payload) && order.order_lines_payload.length > 0
    ? order.order_lines_payload.map((item: any) => {
        const qty = Number(item.quantity) || 1;
        const total = Number(item.line_total ?? ((item.unit_price || 0) * qty)) || 0;
        const unit = Number(item.unit_price ?? (total / qty)) || 0;
        return {
          name: item.product_name || 'Unknown Product',
          quantity: qty,
          size: item.size || item.color || '',
          unitPrice: unit,
          totalPrice: total,
          price: total
        };
      })
    : Array.isArray(order?.ordered_items) && order.ordered_items.length > 0
      ? (typeof order.ordered_items[0] !== 'object'
          ? order.ordered_items.map(() => {
              const totalAmount = Number(order.amount) || 0;
              const count = order.ordered_items.length;
              const unit = count > 0 ? totalAmount / count : 0;
              return {
                name: order.product_name || 'TOY BOX',
                quantity: 1,
                size: order.size || '',
                unitPrice: unit,
                totalPrice: unit,
                price: unit
              };
            })
          : order.ordered_items.map((item: any) => {
              const qty = Number(item.quantity) || 1;
              const unit = Number(item.price || 0);
              const total = unit * qty;
              return {
                name: item.name || item.product_name || 'Unknown Product',
                quantity: qty,
                size: item.size || item.color || '',
                unitPrice: unit,
                totalPrice: total,
                price: total
              };
            })
        )
      : [{
          name: order?.product_name || 'Unknown Product',
          quantity: Number(order?.quantity) || 1,
          size: order?.size || '',
          unitPrice: Number(order?.amount) || 0,
          totalPrice: Number(order?.amount) || 0,
          price: Number(order?.amount) || 0
        }];
      
  const shorts = productDetails.map((i: any) => {
     const combinedName = `${i.name || ''} ${i.size || ''}`;
     return getShortNameWithColor(combinedName);
  });
  row['ORDER SHORT'] = [...new Set(shorts.filter(Boolean))].join(', ');
  
  const colors = [
    order?.size,
    ...productDetails.map((i: any) => i.size || ''),
    ...productDetails.map((i: any) => {
      const nameLower = String(i.name || '').toLowerCase();
      const foundColor = ['black', 'beige', 'blue', 'red', 'golden', 'white', 'green', 'pink', 'grey', 'gray', 'silver', 'brown'].find(c => nameLower.includes(c));
      return foundColor || '';
    })
  ]
    .filter(Boolean)
    .map((s: any) => String(s).trim());
  row['COLOR CODE'] = [...new Set(colors)].join(', ');
  
  row['SOURCE'] = formatSource(order.source);
  
  const totalQty = productDetails.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);
  row['QUANTITY'] = totalQty || Number(order.quantity) || 1;
  
  let dc = 0;
  const directCharge = Number(order?.delivery_charge);
  const summaryCharge = Number(order?.pricing_summary?.delivery_charge);
  
  if (order?.delivery_charge !== undefined && order?.delivery_charge !== null && order?.delivery_charge !== '' && Number.isFinite(directCharge)) {
    dc = directCharge;
  } else if (order?.pricing_summary?.delivery_charge !== undefined && order?.pricing_summary?.delivery_charge !== null && order?.pricing_summary?.delivery_charge !== '' && Number.isFinite(summaryCharge)) {
    dc = summaryCharge;
  } else {
    dc = lowerZone.includes('inside') ? 60 : 130;
  }
  
  const amt = order?.amount !== undefined && order?.amount !== null && order?.amount !== '' ? Number(order.amount) : 0;
  const productPrice = Math.max(0, amt - dc);
  
  row['PRODUCT PRICE'] = productPrice % 1 === 0 ? productPrice : parseFloat(productPrice.toFixed(2));
  row['DELIVERY CHARGE'] = dc;
  row['TOTAL AMOUNT'] = amt % 1 === 0 ? amt : parseFloat(amt.toFixed(2));
  
  return row;
};

export interface BulkExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  confirmedOrders?: any[];
  allOrders?: any[];
  selectedIds?: string[];
  onStatusChange: (id: string, status: string) => Promise<any>;
  exportedBy?: string;
}

export const BulkExportModal: React.FC<BulkExportModalProps> = ({
  isOpen,
  onClose,
  confirmedOrders = [],
  selectedIds = [],
  onStatusChange,
  exportedBy = 'System'
}) => {
  const [preset, setPreset] = useState('sinceLast');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const hasCustomRange = Boolean(dateFrom || dateTo);
  const [scope, setScope] = useState<'all' | 'selected'>('all');

  const [history, setHistory] = useState<any[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) || '[]') || []; }
    catch { return []; }
  });
  const lastExport = history[0] || null;

  const [phase, setPhase] = useState<'idle' | 'exporting' | 'moving' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [orderChips, setOrderChips] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);
  const isRunningRef = useRef(false);

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
      isRunningRef.current = false;
    }
  }, [isOpen, selectedIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(history.slice(0, 20))); }
    catch {}
  }, [history]);

  const exportOrders = useMemo(() => {
    let base: any[];
    if (scope === 'selected') {
      base = confirmedOrders.filter(o => selectedIds.includes(o.id));
    } else {
      const lastSuccessIds = new Set(lastExport?.succeeded_ids || []);
      base = confirmedOrders.filter(o => {
        if (lastSuccessIds.has(o.id)) return false;
        if (hasCustomRange) return matchesDateRange(o.created_at, dateFrom, dateTo);
        return matchesPreset(o.created_at, preset, lastExport?.exported_until);
      });
    }
    const seen = new Set();
    return base.filter(o => { if (seen.has(o.id)) return false; seen.add(o.id); return true; });
  }, [confirmedOrders, scope, selectedIds, preset, dateFrom, dateTo, hasCustomRange, lastExport]);

  const totalAmount = useMemo(
    () => exportOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0),
    [exportOrders]
  );

  const canExport = exportOrders.length > 0 && phase === 'idle';

  const handleExport = useCallback(async () => {
    if (!canExport || isRunningRef.current) return;
    isRunningRef.current = true;
    abortRef.current = false;
    setPhase('exporting');
    setProgress(5);
    setErrorMsg('');

    const sorted = [...exportOrders].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );

    const chips: Record<string, string> = {};
    sorted.forEach(o => { chips[o.id] = 'pending'; });
    setOrderChips({ ...chips });

    const oldestCreatedAt = sorted[0]?.created_at || new Date().toISOString();
    const newestCreatedAt = sorted[sorted.length - 1]?.created_at || new Date().toISOString();

    try {
      // ── On-Demand Lazy Chunk Load for XLSX ──
      const XLSX = await import('xlsx');

      await new Promise(r => setTimeout(r, 80));
      const rows = sorted.map(buildRow);
      const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_COLS });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Confirmed Orders');
      const dateLabel = new Date().toISOString().slice(0, 10);
      const timeLabel = new Date().toTimeString().slice(0, 5).replace(':', 'h');
      XLSX.writeFile(wb, `bulk-export-confirmed-${dateLabel}-${timeLabel}.xlsx`);
      setProgress(20);

      // ── Step 2: Move each order to "Bulk Exported" ──
      setPhase('moving');
      const total = sorted.length;
      let doneCount = 0;
      const succeededIds: string[] = [];
      const failedIds: string[] = [];

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

      const record = {
        id: `exp-${Date.now()}`,
        exported_at: new Date().toISOString(),
        exported_until: oldestCreatedAt,
        newest_order_at: newestCreatedAt,
        exported_by: exportedBy,
        order_count: sorted.length,
        succeeded_ids: succeededIds,
        failed_ids: failedIds,
        order_ids: sorted.map(o => o.id),
        preset: scope === 'selected' ? 'manual-selection' : preset,
        total_amount: totalAmount,
        failed_count: failedIds.length,
      };

      setHistory(prev => [record, ...prev]);
      setPhase('done');
    } catch (err: any) {
      console.error('Bulk export failure:', err);
      setErrorMsg(err?.message || 'Export process failed. Check your connection.');
      setPhase('error');
    } finally {
      isRunningRef.current = false;
    }
  }, [canExport, exportOrders, onStatusChange, exportedBy, scope, preset, totalAmount]);

  if (!isOpen) return null;

  const succeededCount = Object.values(orderChips).filter(s => s === 'done').length;
  const failedCount = Object.values(orderChips).filter(s => s === 'failed').length;
  const doneCount = succeededCount + failedCount;

  return (
    <div className="bem-overlay" onClick={onClose}>
      <div className="bem-modal" onClick={e => e.stopPropagation()}>
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
          <button className="bem-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="bem-body">
          {lastExport && phase === 'idle' && (
            <div className="bem-last-export-card">
              <div className="bem-last-export-icon"><History size={16} /></div>
              <div className="bem-last-export-content">
                <span className="bem-last-export-title">
                  Last Exported: {fmtDate(lastExport.exported_at)}
                </span>
                <span className="bem-last-export-meta">
                  {lastExport.order_count} orders by {lastExport.exported_by}
                  {lastExport.failed_count > 0 && ` (${lastExport.failed_count} failed to move)`}
                </span>
              </div>
              <button
                className="bem-reexport-link"
                onClick={() => setPreset('all')}
                title="Include already exported orders"
              >
                Export All
              </button>
            </div>
          )}

          {selectedIds.length > 0 && phase === 'idle' && (
            <div className="bem-scope-selector">
              <button
                className={`bem-scope-btn ${scope === 'selected' ? 'active' : ''}`}
                onClick={() => setScope('selected')}
              >
                <CheckSquare size={14} />
                Selected ({selectedIds.length})
              </button>
              <button
                className={`bem-scope-btn ${scope === 'all' ? 'active' : ''}`}
                onClick={() => setScope('all')}
              >
                <Users size={14} />
                Filter-Based ({confirmedOrders.length})
              </button>
            </div>
          )}

          {scope === 'all' && phase === 'idle' && (
            <div className="bem-section">
              <p className="bem-section-title">Select Orders to Export</p>
              <div className="bem-preset-grid">
                {DATE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    className={`bem-preset-btn ${preset === p.id && !hasCustomRange ? 'active' : ''}`}
                    onClick={() => {
                      setPreset(p.id);
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    <Calendar size={13} />
                    <span>{p.label}</span>
                    {p.id === 'sinceLast' && lastExport && (
                      <span className="bem-preset-hint">new since last export</span>
                    )}
                  </button>
                ))}
              </div>

              <div className="bem-custom-dates">
                <span className="bem-custom-dates-label">Or Custom Date Range:</span>
                <div className="bem-date-inputs">
                  <input
                    type="date"
                    className="bem-date-input"
                    value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); setPreset(''); }}
                    placeholder="From"
                  />
                  <span className="bem-date-sep">→</span>
                  <input
                    type="date"
                    className="bem-date-input"
                    value={dateTo}
                    onChange={e => { setDateTo(e.target.value); setPreset(''); }}
                    placeholder="To"
                  />
                  {hasCustomRange && (
                    <button
                      className="bem-clear-date-btn"
                      onClick={() => { setDateFrom(''); setDateTo(''); setPreset('sinceLast'); }}
                    >
                      <X size={12}/> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {phase === 'idle' && (
            <div className="bem-summary-bar">
              <div className="bem-summary-stat">
                <span className="bem-stat-val">{exportOrders.length}</span>
                <span className="bem-stat-lbl">Orders to Export</span>
              </div>
              <div className="bem-summary-divider" />
              <div className="bem-summary-stat">
                <span className="bem-stat-val">৳{totalAmount.toLocaleString()}</span>
                <span className="bem-stat-lbl">Total Value</span>
              </div>
              <div className="bem-summary-divider" />
              <div className="bem-summary-stat">
                <span className="bem-stat-val">
                  {scope === 'selected' ? 'Custom Selection' : DATE_PRESETS.find(p => p.id === preset)?.label || 'Custom Range'}
                </span>
                <span className="bem-stat-lbl">Scope</span>
              </div>
            </div>
          )}

          {(phase === 'exporting' || phase === 'moving' || phase === 'done') && (
            <div className="bem-progress-panel">
              <div className="bem-progress-header">
                <span className="bem-progress-label">
                  {phase === 'exporting' && 'Generating & Downloading XLSX...'}
                  {phase === 'moving' && `Moving orders → Bulk Exported (${doneCount}/${exportOrders.length})...`}
                  {phase === 'done' && 'Export Complete!'}
                </span>
                <span className="bem-progress-pct">{progress}%</span>
              </div>

              <div className="bem-progress-track">
                <div
                  className={`bem-progress-bar ${phase === 'done' ? 'complete' : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              {exportOrders.length > 0 && (
                <div className="bem-chips-scroll">
                  {exportOrders.map(order => {
                    const status = orderChips[order.id] || 'pending';
                    return (
                      <span key={order.id} className={`bem-order-chip ${status}`}>
                        {status === 'done' && '✓ '}
                        {status === 'failed' && '✕ '}
                        {status === 'processing' && '⟳ '}
                        #{order.id}
                      </span>
                    );
                  })}
                </div>
              )}

              {phase === 'done' && (
                <div className="bem-done-card">
                  <CheckCircle2 size={24} className="bem-done-icon"/>
                  <div>
                    <p className="bem-done-title">Bulk Export Successful</p>
                    <p className="bem-done-body">
                      <strong>{doneCount} orders</strong> exported to XLSX and moved to <strong>Bulk Exported</strong>.
                      {failedCount > 0 && (
                        <span className="bem-failed-note">
                          {' '}({failedCount} order{failedCount > 1 ? 's' : ''} failed to move — will retry on next run)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="bem-error-card">
              <AlertTriangle size={18}/>
              <span>{errorMsg}</span>
            </div>
          )}

          {history.length > 0 && phase === 'idle' && (
            <div className="bem-section">
              <p className="bem-section-title">Recent Exports</p>
              <div className="bem-history-list">
                {history.slice(0, 4).map((item: any) => (
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
        </div>

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
