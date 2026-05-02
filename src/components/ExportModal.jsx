import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Download, X, FileText, Filter, CheckSquare,
  Calendar, Package, CheckCircle2, Loader2, History, ChevronDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './ExportModal.css';

// ── Constants ────────────────────────────────────────────────

const LAST_EXPORT_KEY = 'orderflow:last_export_v1';

const ORDER_STATUSES = [
  'New', 'Pending Call', 'Final Call Pending', 'Confirmed',
  'Bulk Exported', 'Courier Submitted', 'Factory Processing',
  'Completed', 'Fake Order', 'Cancelled'
];

const STATUS_COLORS = {
  'New': '#0ea5e9',
  'Pending Call': '#f59e0b',
  'Final Call Pending': '#f97316',
  'Confirmed': '#10b981',
  'Bulk Exported': '#8b5cf6',
  'Courier Submitted': '#06b6d4',
  'Factory Processing': '#6366f1',
  'Completed': '#22c55e',
  'Fake Order': '#ef4444',
  'Cancelled': '#94a3b8',
};

/** All available CSV columns with labels and field mappings */
const ALL_COLUMNS = [
  { key: 'id',            label: 'Order ID',        default: true },
  { key: 'created_at',   label: 'Date & Time',      default: true },
  { key: 'customer_name',label: 'Customer Name',    default: true },
  { key: 'phone',        label: 'Phone',            default: true },
  { key: 'address',      label: 'Address',          default: true },
  { key: 'shipping_zone',label: 'Shipping Zone',    default: true },
  { key: 'product_details', label: 'Product Details', default: true },
  { key: 'product_name', label: 'Product Name',     default: false },
  { key: 'size',         label: 'Size',             default: false },
  { key: 'quantity',     label: 'Quantity',         default: true },
  { key: 'amount',       label: 'Total Amount',     default: true },
  { key: 'delivery_charge', label: 'Delivery Charge', default: true },
  { key: 'status',       label: 'Status',           default: true },
  { key: 'source',       label: 'Source',           default: false },
  { key: 'notes',        label: 'Notes',            default: false },
  { key: 'ip_address',   label: 'IP Address',       default: false },
];

// ── XLSX Engine ───────────────────────────────────────────────

/**
 * Format a date string for XLSX export — readable format.
 */
const formatDateForXlsx = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-BD', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
  } catch {
    return iso;
  }
};

/**
 * Generate a timestamped file name.
 */
const buildFileName = (mode, statusLabels) => {
  const date = new Date().toISOString().slice(0, 10);
  const time = new Date().toTimeString().slice(0, 5).replace(':', 'h');
  if (mode === 'status' && statusLabels.length === 1) {
    const slug = statusLabels[0].replace(/\s+/g, '_').toLowerCase();
    return `orders_${slug}_${date}_${time}.xlsx`;
  }
  return `orders_export_${date}_${time}.xlsx`;
};

// ── Helpers ──────────────────────────────────────────────────

const timeAgo = (iso) => {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ════════════════════════════════════════════════════════════
// ExportModal Component
// ════════════════════════════════════════════════════════════

/**
 * Enterprise Order Export Modal
 * 
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - allOrders: order[] — full filtered order list (respects current filters)
 *  - selectedOrderIds: string[] — manually checked order IDs
 *  - currentFilters: object — { status, productName, dateRange, searchTerm, source }
 *  - products: { name }[] — unique product names for product filter
 */
export const ExportModal = ({
  isOpen,
  onClose,
  allOrders = [],
  selectedOrderIds = [],
  currentFilters = {},
  products = [],
}) => {
  // ── Export mode ───────────────────────────────────────────
  // 'current'  — export whatever is currently filtered/visible
  // 'manual'   — export only manually selected orders
  // 'status'   — export by chosen statuses (multi-select)
  // 'date'     — export by custom date range
  // 'product'  — export by selected product
  const [mode, setMode] = useState('current');

  // ── Mode-specific state ────────────────────────────────────
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // ── Column picker ──────────────────────────────────────────
  const [selectedColumns, setSelectedColumns] = useState(
    ALL_COLUMNS.filter(c => c.default).map(c => c.key)
  );

  // ── UI state ───────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastExportInfo, setLastExportInfo] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_EXPORT_KEY)); } catch { return null; }
  });
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [lastExportCount, setLastExportCount] = useState(0);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setMode(selectedOrderIds.length > 0 ? 'manual' : 'current');
      setSelectedStatuses([]);
      setDateFrom('');
      setDateTo('');
      setSelectedProduct('');
      setShowSuccess(false);
      setShowColumnPicker(false);
    }
  }, [isOpen, selectedOrderIds.length]);

  // ── Compute exportable orders based on mode ────────────────
  const exportableOrders = useMemo(() => {
    if (!Array.isArray(allOrders)) return [];

    switch (mode) {
      case 'manual':
        return allOrders.filter(o => selectedOrderIds.includes(o.id));

      case 'status':
        if (selectedStatuses.length === 0) return [];
        return allOrders.filter(o => selectedStatuses.includes(o.status));

      case 'date': {
        if (!dateFrom && !dateTo) return allOrders;
        const from = dateFrom ? new Date(dateFrom).getTime() : null;
        // dateTo: end of day
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
        return allOrders.filter(o => {
          const t = new Date(o.updated_at || o.created_at || 0).getTime();
          if (from && t < from) return false;
          if (to && t > to) return false;
          return true;
        });
      }

      case 'product':
        if (!selectedProduct) return allOrders;
        return allOrders.filter(o =>
          String(o.product_name || '').toLowerCase().includes(selectedProduct.toLowerCase())
        );

      case 'current':
      default:
        return allOrders;
    }
  }, [mode, allOrders, selectedOrderIds, selectedStatuses, dateFrom, dateTo, selectedProduct]);

  const canExport = exportableOrders.length > 0 && selectedColumns.length > 0;

  // ── Handle export ──────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!canExport) return;
    setIsExporting(true);

    try {
      // Small delay so the loading state renders before heavy work
      await new Promise(r => setTimeout(r, 80));

      const columns = ALL_COLUMNS.filter(c => selectedColumns.includes(c.key));
      const headers = columns.map(c => c.label);
      
      const rows = exportableOrders.map(order => {
        const row = {};
        columns.forEach(col => {
          let value = order[col.key];

          // Combine product variations, sizes, and ordered items into one comprehensive column
          if (col.key === 'product_details') {
            const items = Array.isArray(order?.ordered_items) ? order.ordered_items : [];
            value = [order?.product_name, order?.size, ...items.map(i => i?.name || '')]
              .filter(Boolean)
              .join(', ');
          }

          // Exact delivery charge shown in modal (with fallback to 70/130 based on zone)
          if (col.key === 'delivery_charge' && (value === undefined || value === null || value === '')) {
            const isInside = String(order?.shipping_zone || '').toLowerCase().includes('inside');
            value = isInside ? 70 : 130;
          }

          if (col.key === 'created_at') value = formatDateForXlsx(value);
          if (col.key === 'amount' || col.key === 'delivery_charge') {
            value = Number(value || 0).toFixed(2);
          }
          if (col.key === 'quantity') value = Number(value || 1);
          
          row[col.label] = value;
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Orders Export');

      const statusLabels = mode === 'status' ? selectedStatuses : [];
      const fileName = buildFileName(mode, statusLabels);

      XLSX.writeFile(wb, fileName);

      // Save last export info to localStorage
      const info = {
        fileName,
        count: exportableOrders.length,
        mode,
        exportedAt: new Date().toISOString(),
        columns: selectedColumns.length,
      };
      localStorage.setItem(LAST_EXPORT_KEY, JSON.stringify(info));
      setLastExportInfo(info);
      setLastExportCount(exportableOrders.length);
      setShowSuccess(true);

      // Auto-close after 1.5s
      setTimeout(() => {
        onClose();
        setTimeout(() => setShowSuccess(false), 400);
      }, 1500);

    } catch (err) {
      console.error('[ExportModal] Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [canExport, exportableOrders, selectedColumns, mode, selectedStatuses, onClose]);

  // ── Column toggle ──────────────────────────────────────────
  const toggleColumn = useCallback((key) => {
    setSelectedColumns(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  const toggleStatus = useCallback((status) => {
    setSelectedStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  }, []);

  const selectAllColumns = () => setSelectedColumns(ALL_COLUMNS.map(c => c.key));
  const selectDefaultColumns = () => setSelectedColumns(ALL_COLUMNS.filter(c => c.default).map(c => c.key));

  // Unique product names for the product dropdown
  const uniqueProducts = useMemo(() => {
    const names = new Set((allOrders || []).map(o => o.product_name).filter(Boolean));
    return Array.from(names).sort();
  }, [allOrders]);

  if (!isOpen) return null;

  return (
    <>
      <div className="export-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="export-modal" role="dialog" aria-modal="true" aria-label="Export Orders">

          {/* Header */}
          <div className="export-modal-header">
            <div className="export-modal-title">
              <div className="export-modal-title-icon">
                <Download size={17} />
              </div>
              <div>
                <h2>Export Orders</h2>
                <p>Enterprise XLSX export — choose mode, filters &amp; columns</p>
              </div>
            </div>
            <button className="export-modal-close" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="export-modal-body">

            {/* Last export info */}
            {lastExportInfo && (
              <div className="last-export-bar">
                <History size={14} />
                <span>
                  Last export:&nbsp;
                  <strong>{lastExportInfo.count} orders</strong>
                  &nbsp;·&nbsp;{lastExportInfo.fileName}
                  &nbsp;·&nbsp;{timeAgo(lastExportInfo.exportedAt)}
                </span>
              </div>
            )}

            {/* Export Mode */}
            <div>
              <div className="export-section-title">Export Mode</div>
              <div className="export-mode-grid">

                <button
                  className={`export-mode-card ${mode === 'current' ? 'selected' : ''}`}
                  onClick={() => setMode('current')}
                >
                  <div className="export-mode-icon purple"><Filter size={17} /></div>
                  <div className="export-mode-text">
                    <strong>Current View</strong>
                    <span>Export with active filters ({allOrders.length} orders)</span>
                  </div>
                </button>

                <button
                  className={`export-mode-card ${mode === 'manual' ? 'selected' : ''}`}
                  onClick={() => setMode('manual')}
                >
                  <div className="export-mode-icon blue"><CheckSquare size={17} /></div>
                  <div className="export-mode-text">
                    <strong>Selected Only</strong>
                    <span>{selectedOrderIds.length} orders checked</span>
                  </div>
                </button>

                <button
                  className={`export-mode-card ${mode === 'status' ? 'selected' : ''}`}
                  onClick={() => setMode('status')}
                >
                  <div className="export-mode-icon green"><CheckCircle2 size={17} /></div>
                  <div className="export-mode-text">
                    <strong>By Status</strong>
                    <span>Pick one or more statuses</span>
                  </div>
                </button>

                <button
                  className={`export-mode-card ${mode === 'date' ? 'selected' : ''}`}
                  onClick={() => setMode('date')}
                >
                  <div className="export-mode-icon orange"><Calendar size={17} /></div>
                  <div className="export-mode-text">
                    <strong>By Date Range</strong>
                    <span>Custom from / to dates</span>
                  </div>
                </button>

                <button
                  className={`export-mode-card ${mode === 'product' ? 'selected' : ''}`}
                  style={{ gridColumn: 'span 2' }}
                  onClick={() => setMode('product')}
                >
                  <div className="export-mode-icon purple"><Package size={17} /></div>
                  <div className="export-mode-text">
                    <strong>By Product</strong>
                    <span>Export orders for a specific product</span>
                  </div>
                </button>

              </div>
            </div>

            {/* Mode-specific controls */}

            {/* Status multi-select */}
            {mode === 'status' && (
              <div>
                <div className="export-section-title">Select Statuses</div>
                <div className="status-checkbox-grid">
                  {ORDER_STATUSES.map(status => (
                    <button
                      key={status}
                      className={`status-chip-checkbox ${selectedStatuses.includes(status) ? 'checked' : ''}`}
                      onClick={() => toggleStatus(status)}
                    >
                      <span
                        className="status-chip-dot"
                        style={{ color: STATUS_COLORS[status] || '#64748b' }}
                      />
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Date range picker */}
            {mode === 'date' && (
              <div>
                <div className="export-section-title">Date Range</div>
                <div className="export-date-row">
                  <div className="export-date-field">
                    <label>From</label>
                    <input
                      type="date"
                      className="export-date-input"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                    />
                  </div>
                  <div className="export-date-field">
                    <label>To</label>
                    <input
                      type="date"
                      className="export-date-input"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Product picker */}
            {mode === 'product' && (
              <div>
                <div className="export-section-title">Select Product</div>
                <select
                  className="export-product-select"
                  value={selectedProduct}
                  onChange={e => setSelectedProduct(e.target.value)}
                >
                  <option value="">— All Products —</option>
                  {uniqueProducts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Manual mode info */}
            {mode === 'manual' && (
              <div className={`export-selection-info ${selectedOrderIds.length === 0 ? 'export-zero-warning' : ''}`}>
                <CheckSquare size={15} />
                {selectedOrderIds.length === 0
                  ? <span>⚠️ No orders selected. Check rows in the table first, then export.</span>
                  : <span><strong>{selectedOrderIds.length}</strong> orders selected for export</span>
                }
              </div>
            )}

            {/* Preview count */}
            <div className="export-preview-count">
              <FileText size={14} />
              <span>Will export&nbsp;</span>
              <strong>{exportableOrders.length}</strong>
              <span>&nbsp;orders</span>
              {selectedColumns.length > 0 && (
                <span style={{ marginLeft: 'auto', color: '#94a3b8' }}>
                  {selectedColumns.length} columns
                </span>
              )}
            </div>

            {/* Column Picker (collapsible) */}
            <div>
              <button
                className="export-section-title"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 0, color: 'var(--text-secondary, #64748b)'
                }}
                onClick={() => setShowColumnPicker(p => !p)}
              >
                Choose Columns ({selectedColumns.length}/{ALL_COLUMNS.length})
                <ChevronDown size={13} style={{ transform: showColumnPicker ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {showColumnPicker && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, marginTop: 8 }}>
                    <button
                      style={{ fontSize: '0.75rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      onClick={selectAllColumns}
                    >Select All</button>
                    <button
                      style={{ fontSize: '0.75rem', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={selectDefaultColumns}
                    >Reset to Default</button>
                  </div>
                  <div className="column-picker-grid">
                    {ALL_COLUMNS.map(col => (
                      <button
                        key={col.key}
                        className={`column-toggle ${selectedColumns.includes(col.key) ? 'checked' : ''}`}
                        onClick={() => toggleColumn(col.key)}
                      >
                        <div className="column-toggle-check">
                          {selectedColumns.includes(col.key) && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        {col.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="export-modal-footer">
            <div className="export-footer-left">
              {exportableOrders.length > 0
                ? `${exportableOrders.length} orders · ${selectedColumns.length} columns · XLSX`
                : 'No orders to export'}
            </div>
            <div className="export-footer-actions">
              <button className="export-cancel-btn" onClick={onClose}>Cancel</button>
              <button
                id="export-run-btn"
                className={`export-run-btn ${isExporting ? 'exporting' : ''}`}
                onClick={handleExport}
                disabled={!canExport || isExporting}
              >
                {isExporting
                  ? <><Loader2 size={15} style={{ animation: 'em-spin 1s linear infinite' }} /> Exporting...</>
                  : <><Download size={15} /> Export {exportableOrders.length} Orders</>
                }
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Success Toast */}
      {showSuccess && (
        <div className="export-success-toast">
          <CheckCircle2 size={22} />
          <div className="export-toast-text">
            <strong>Export Complete!</strong>
            <span>{lastExportCount} orders downloaded as XLSX</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes em-spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
};
