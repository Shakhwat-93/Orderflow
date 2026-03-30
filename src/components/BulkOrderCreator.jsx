import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Wand2, Plus, Trash2, X, CheckCircle2, AlertCircle, Loader2, Upload,
  Sparkles, Users, Package, MapPin, Phone, User, ChevronDown, ChevronUp,
  FileText, RotateCcw, Send, Copy, ClipboardList, ChevronsDown, ArrowRight,
  Info, CheckSquare, Square, Edit3, Star, Zap, Globe, Table2, FileSpreadsheet,
  AlertTriangle, Eye, EyeOff
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import CurrencyIcon from './CurrencyIcon';
import './BulkOrderCreator.css';

// ─── Constants ───────────────────────────────────────────────────────
const PRODUCT_OPTIONS = [
  'TOY BOX', 'ORGANIZER', 'Travel bag', 'TOY BOX + ORG', 'Gym bag',
  'VLOGGER FOR FREE', 'MMB', 'Quran', 'WAIST BAG', 'BAGPACK', 'Moshari'
];

const PRODUCT_PRICES = {
  'TOY BOX': 1250, 'ORGANIZER': 850, 'Travel bag': 950, 'TOY BOX + ORG': 2000,
  'Gym bag': 750, 'VLOGGER FOR FREE': 650, 'MMB': 550, 'Quran': 1200,
  'WAIST BAG': 450, 'BAGPACK': 1500, 'Moshari': 850
};

const PRODUCT_COLORS = {
  'TOY BOX': '#f97316', 'ORGANIZER': '#059669', 'Travel bag': '#1d4ed8',
  'TOY BOX + ORG': '#5b21b6', 'Gym bag': '#b91c1c', 'VLOGGER FOR FREE': '#334155',
  'MMB': '#a855f7', 'Quran': '#84cc16', 'WAIST BAG': '#0d9488',
  'BAGPACK': '#3b82f6', 'Moshari': '#22c55e'
};

const SOURCES = ['Website', 'Facebook', 'Instagram', 'Direct'];
const SHIPPING_ZONES = [
  { value: 'Inside Dhaka', charge: 80 },
  { value: 'Outside Dhaka', charge: 150 }
];

// ─── CSV Parser ──────────────────────────────────────────────────────
// Columns: NAME | ADDRESS | Phone | Toyboxcode | source | QTY(TOY) | ORG QTY | MMB BAG | OTHER | toy box amount | ORG Amount | MMB Amount | OTHER Amount | DELIVERY CHARGE | Total
// ─── Robust phone normalizer ──────────────────────────────────────────
// Handles: spaces, scientific notation, missing leading 0
const normalizeBDPhone = (raw) => {
  let s = String(raw ?? '').trim();
  // Handle Excel scientific notation: 1.71235E+10 or 1.71235e10
  if (/^[0-9.]+[eE][+]?[0-9]+$/.test(s)) {
    try { s = String(Math.round(parseFloat(s))); } catch { /**/ }
  }
  // Strip everything that is not a digit
  s = s.replace(/\D/g, '');
  // Auto-prepend 0 for 10-digit BD numbers (e.g., 1712345678)
  if (s.length === 10 && s.startsWith('1')) s = '0' + s;
  // Auto-prepend 01 for 9-digit BD numbers (e.g., 712345678)
  if (s.length === 9 && /^[6-9]/.test(s)) s = '01' + s;
  return s;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], errors: ['File has no data rows.'] };

  // Auto-detect separator (tab or comma)
  const sep = lines[0].includes('\t') ? '\t' : ',';

  const rawHeaders = lines[0].split(sep).map(h => h.trim().toLowerCase());
  
  // Header index finder (fuzzy)
  const col = (patterns) => {
    for (const p of patterns) {
      const idx = rawHeaders.findIndex(h => h.includes(p.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iName    = col(['name']);
  const iAddr    = col(['address', 'addr']);
  const iPhone   = col(['phone', 'mob', 'number']);
  const iCode    = col(['toyboxcode', 'toybox code', 'code']);
  const iSrc     = col(['source']);
  const iToyQty  = col(['qty(toy)', 'toy qty', 'qty toy', 'toy box qty', 'qty(toy)']);
  const iOrgQty  = col(['org qty', 'org  qty', 'organizer qty']);
  const iMmbQty  = col(['mmb bag', 'mmb qty', 'mmb']);
  const iOthQty  = col(['other', 'oth']);
  const iToyAmt  = col(['toy box amount', 'toybox amount', 'toy amount']);
  const iOrgAmt  = col(['org amount', 'org  amount', 'organizer amount']);
  const iMmbAmt  = col(['mmb amount', 'mmb  amount']);
  const iOthAmt  = col(['other (amount)', 'other amount', 'oth amount']);
  const iDel     = col(['delivery charge', 'delivery', 'del charge']);
  const iTotal   = col(['total']);

  const errors = [];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.trim());
    const get = (idx) => (idx !== -1 ? (cells[idx] || '').trim() : '');
    const getNum = (idx) => { const v = parseFloat(get(idx).replace(/,/g, '')); return isNaN(v) ? 0 : v; };

    const name = get(iName);
    if (!name) continue; // skip empty rows

    const rawAddr = get(iAddr);
    // Detect shipping zone from address column keyword
    let zone = 'Outside Dhaka';
    if (rawAddr.toLowerCase().includes('inside') || rawAddr.toLowerCase().includes('dhaka')) {
      zone = 'Inside Dhaka';
    }
    // Strip zone prefix from address text
    const address = rawAddr
      .replace(/inside\s*dhaka[:\s-]*/gi, '')
      .replace(/outside\s*dhaka[:\s-]*/gi, '')
      .trim();

    let phone = normalizeBDPhone(get(iPhone));
    const toyboxCode = get(iCode);
    const source = get(iSrc) || 'Website';

    const toyQty = Math.max(0, Math.round(getNum(iToyQty)));
    const orgQty = Math.max(0, Math.round(getNum(iOrgQty)));
    const mmbQty = Math.max(0, Math.round(getNum(iMmbQty)));
    const othQty = Math.max(0, Math.round(getNum(iOthQty)));

    const toyAmt = getNum(iToyAmt);
    const orgAmt = getNum(iOrgAmt);
    const mmbAmt = getNum(iMmbAmt);
    const othAmt = getNum(iOthAmt);
    const deliveryCharge = getNum(iDel);
    const totalAmt = getNum(iTotal);

    // Build product list from quantities
    const products = [];
    if (toyQty > 0) {
      products.push({
        name: 'TOY BOX',
        quantity: toyQty,
        size: toyboxCode || '',
        price: toyQty > 0 ? Math.round(toyAmt / toyQty) || PRODUCT_PRICES['TOY BOX'] : PRODUCT_PRICES['TOY BOX'],
        toyBoxNumber: null
      });
    }
    if (orgQty > 0) {
      products.push({
        name: 'ORGANIZER',
        quantity: orgQty,
        size: '',
        price: orgQty > 0 ? Math.round(orgAmt / orgQty) || PRODUCT_PRICES['ORGANIZER'] : PRODUCT_PRICES['ORGANIZER'],
        toyBoxNumber: null
      });
    }
    if (mmbQty > 0) {
      products.push({
        name: 'MMB',
        quantity: mmbQty,
        size: '',
        price: mmbQty > 0 ? Math.round(mmbAmt / mmbQty) || PRODUCT_PRICES['MMB'] : PRODUCT_PRICES['MMB'],
        toyBoxNumber: null
      });
    }
    if (othQty > 0) {
      products.push({
        name: 'BAGPACK', // fallback for 'OTHER' — user can change
        quantity: othQty,
        size: '',
        price: othQty > 0 ? Math.round(othAmt / othQty) || 0 : 0,
        toyBoxNumber: null
      });
    }
    // Fallback if no product qty detected
    if (products.length === 0) {
      products.push({ name: 'TOY BOX', quantity: 1, size: '', price: PRODUCT_PRICES['TOY BOX'], toyBoxNumber: null });
    }

    const row = {
      ...createEmptyRow(),
      customer_name: name,
      phone,
      address,
      shipping_zone: zone,
      source: SOURCES.includes(source) ? source : 'Website',
      products,
      notes: toyboxCode && !products[0].size ? `Toybox Code: ${toyboxCode}` : '',
      isExpanded: false,
      _csv_total: totalAmt, // store CSV total for comparison
      _csv_delivery: deliveryCharge,
    };

    // Per-row validation flags
    const errs = [];
    if (!name) errs.push('Name missing');
    if (!phone || !/^01\d{9}$/.test(phone)) errs.push('Invalid phone');
    if (!address) errs.push('Address missing');
    row._csv_errors = errs;
    if (errs.length > 0) errors.push(`Row ${i}: ${errs.join(', ')}`);

    rows.push(row);
  }

  return { rows, errors };
};

// ─── CSV Preview Table ────────────────────────────────────────────────
const CSVPreviewTable = ({ rows, onConfirm, onCancel, isImporting }) => {
  const [showErrors, setShowErrors] = useState(false);
  const errorRows = rows.filter(r => r._csv_errors?.length > 0);
  const validRows = rows.filter(r => !r._csv_errors?.length);

  return (
    <div className="csv-preview-wrap">
      <div className="csv-preview-header">
        <div className="csv-preview-title">
          <Table2 size={16} />
          <span>CSV Preview — {rows.length} rows detected</span>
        </div>
        <div className="csv-preview-badges">
          <span className="csv-badge csv-badge-ok"><CheckCircle2 size={11} /> {validRows.length} Valid</span>
          {errorRows.length > 0 && (
            <span
              className="csv-badge csv-badge-err"
              onClick={() => setShowErrors(s => !s)}
              style={{ cursor: 'pointer' }}
            >
              <AlertTriangle size={11} /> {errorRows.length} Warnings
            </span>
          )}
        </div>
      </div>

      {showErrors && errorRows.length > 0 && (
        <div className="csv-errors-list">
          {errorRows.map((r, i) => (
            <div key={i} className="csv-error-item">
              <AlertCircle size={12} />
              <strong>{r.customer_name || `Row ${i + 1}`}</strong>: {r._csv_errors.join(', ')}
            </div>
          ))}
        </div>
      )}

      <div className="csv-table-wrap">
        <table className="csv-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Zone</th>
              <th>Products</th>
              <th>Source</th>
              <th>Total (CSV)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={row._csv_errors?.length ? 'csv-row-warn' : 'csv-row-ok'}>
                <td className="csv-td-num">{i + 1}</td>
                <td className="csv-td-name">{row.customer_name}</td>
                <td className="csv-td-phone">{row.phone || <span className="csv-missing">—</span>}</td>
                <td className="csv-td-addr" title={row.address}>{row.address || <span className="csv-missing">—</span>}</td>
                <td>
                  <span className={`csv-zone-pill ${row.shipping_zone === 'Inside Dhaka' ? 'inside' : 'outside'}`}>
                    {row.shipping_zone === 'Inside Dhaka' ? 'Inside' : 'Outside'}
                  </span>
                </td>
                <td className="csv-td-products">
                  {row.products.map((p, pi) => (
                    <span key={pi} className="boc-product-tag" style={{ '--tag-color': PRODUCT_COLORS[p.name] || '#64748b' }}>
                      {p.name} ×{p.quantity}
                    </span>
                  ))}
                </td>
                <td>{row.source}</td>
                <td className="csv-td-total">
                  {row._csv_total > 0 ? <><CurrencyIcon size={11} />{row._csv_total.toLocaleString()}</> : '—'}
                </td>
                <td>
                  {row._csv_errors?.length > 0 ? (
                    <span className="csv-status csv-status-warn" title={row._csv_errors.join(', ')}>
                      <AlertTriangle size={11} /> Warn
                    </span>
                  ) : (
                    <span className="csv-status csv-status-ok">
                      <CheckCircle2 size={11} /> OK
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="csv-preview-actions">
        <button type="button" className="boc-cancel-btn" onClick={onCancel} disabled={isImporting}>
          <X size={14} /> Cancel Import
        </button>
        <button
          type="button"
          className="boc-submit-btn"
          onClick={() => onConfirm(rows)}
          disabled={isImporting || validRows.length === 0}
        >
          {isImporting ? (
            <><Loader2 size={15} className="boc-spin" /> Importing...</>
          ) : (
            <><Upload size={15} /> Import {validRows.length} Valid Orders</>
          )}
        </button>
      </div>
    </div>
  );
};


// ─── Helpers ──────────────────────────────────────────────────────────
const createEmptyRow = () => ({
  id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  customer_name: '',
  phone: '',
  address: '',
  shipping_zone: 'Outside Dhaka',
  source: 'Website',
  notes: '',
  products: [{ name: 'TOY BOX', quantity: 1, size: '', price: 1250, toyBoxNumber: null }],
  aiText: '',
  isExtracting: false,
  isExpanded: true,
  status: 'draft', // draft | valid | error | creating | created | failed
  errorMsg: ''
});

const validateRow = (row) => {
  const errors = {};
  if (!row.customer_name.trim()) errors.customer_name = 'Name required';
  const phone = row.phone.replace(/\D/g, '');
  if (!phone) errors.phone = 'Phone required';
  else if (!/^01\d{9}$/.test(phone)) errors.phone = 'Must be 01XXXXXXXXX (11 digits)';
  if (!row.address.trim()) errors.address = 'Address required';
  if (!row.products.length) errors.products = 'Add at least one product';
  row.products.forEach((p, i) => {
    if (!p.name) errors[`product_${i}_name`] = 'Product required';
    if (p.quantity < 1) errors[`product_${i}_qty`] = 'Qty must be ≥ 1';
  });
  return errors;
};

const calcRowTotal = (row) => {
  const subtotal = row.products.reduce((s, p) => s + (p.price || 0) * (p.quantity || 1), 0);
  const zone = SHIPPING_ZONES.find(z => z.value === row.shipping_zone) || SHIPPING_ZONES[1];
  return subtotal + zone.charge;
};

// ─── Sub-components ───────────────────────────────────────────────────
const ProductTag = ({ name }) => (
  <span className="boc-product-tag" style={{ '--tag-color': PRODUCT_COLORS[name] || '#64748b' }}>
    {name}
  </span>
);

const RowStatusBadge = ({ status, errorMsg }) => {
  const configs = {
    draft: { icon: <Edit3 size={12} />, label: 'Draft', cls: 'draft' },
    valid: { icon: <CheckCircle2 size={12} />, label: 'Ready', cls: 'valid' },
    error: { icon: <AlertCircle size={12} />, label: 'Has Errors', cls: 'error' },
    creating: { icon: <Loader2 size={12} className="boc-spin" />, label: 'Creating...', cls: 'creating' },
    created: { icon: <CheckCircle2 size={12} />, label: 'Created ✓', cls: 'created' },
    failed: { icon: <AlertCircle size={12} />, label: 'Failed', cls: 'failed' },
  };
  const cfg = configs[status] || configs.draft;
  return (
    <span className={`boc-row-status boc-status-${cfg.cls}`} title={errorMsg || ''}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ─── Individual Order Row ─────────────────────────────────────────────
const OrderRowEditor = React.memo(({
  row, index, onChange, onRemove, onDuplicate, onAIExtract,
  disabled, toyBoxInventory
}) => {
  const [validationErrors, setValidationErrors] = useState({});
  const aiRef = useRef(null);

  const handleFieldChange = useCallback((field, value) => {
    onChange(row.id, { [field]: value });
  }, [row.id, onChange]);

  const handleProductChange = useCallback((pIdx, updates) => {
    const newProducts = row.products.map((p, i) => {
      if (i !== pIdx) return p;
      const merged = { ...p, ...updates };
      if (updates.name) merged.price = PRODUCT_PRICES[updates.name] || 0;
      return merged;
    });
    onChange(row.id, { products: newProducts });
  }, [row.id, row.products, onChange]);

  const addProduct = useCallback(() => {
    onChange(row.id, {
      products: [...row.products, { name: 'TOY BOX', quantity: 1, size: '', price: 1250, toyBoxNumber: null }]
    });
  }, [row.id, row.products, onChange]);

  const removeProduct = useCallback((pIdx) => {
    if (row.products.length <= 1) return;
    onChange(row.id, { products: row.products.filter((_, i) => i !== pIdx) });
  }, [row.id, row.products, onChange]);

  const runValidation = useCallback(() => {
    const errs = validateRow(row);
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  }, [row]);

  const total = calcRowTotal(row);
  const isLocked = ['creating', 'created'].includes(row.status);

  return (
    <div className={`boc-order-row boc-row-status-wrap boc-row-${row.status}`}>
      {/* Row Header */}
      <div className="boc-row-header">
        <div className="boc-row-header-left">
          <span className="boc-row-number">{index + 1}</span>
          <div className="boc-row-summary">
            <span className="boc-row-name">{row.customer_name || 'New Customer'}</span>
            {row.phone && <span className="boc-row-phone">{row.phone}</span>}
            {row.products.length > 0 && (
              <div className="boc-row-products-preview">
                {row.products.slice(0, 3).map((p, i) => <ProductTag key={i} name={p.name} />)}
                {row.products.length > 3 && <span className="boc-more-tag">+{row.products.length - 3}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="boc-row-header-right">
          <span className="boc-row-total">
            <CurrencyIcon size={13} /> {total.toLocaleString()}
          </span>
          <RowStatusBadge status={row.status} errorMsg={row.errorMsg} />
          {!isLocked && (
            <>
              <button
                className="boc-icon-btn boc-btn-dup" title="Duplicate Row"
                onClick={() => onDuplicate(row.id)} type="button"
              >
                <Copy size={14} />
              </button>
              <button
                className="boc-icon-btn boc-btn-del" title="Remove Row"
                onClick={() => onRemove(row.id)} type="button"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <button
            className="boc-icon-btn boc-btn-toggle"
            onClick={() => handleFieldChange('isExpanded', !row.isExpanded)} type="button"
          >
            {row.isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {row.isExpanded && (
        <div className="boc-row-body">
          {/* AI Magic Autofill */}
          {!isLocked && (
            <div className="boc-ai-section">
              <div className="boc-ai-label">
                <Wand2 size={13} />
                <span>AI Magic Autofill — Paste WhatsApp/Facebook text</span>
              </div>
              <div className="boc-ai-input-row">
                <textarea
                  ref={aiRef}
                  className="boc-ai-textarea"
                  placeholder="e.g. 'Rafi, 01712345678, Bashundhara Dhaka, TOY BOX 2pcs'"
                  value={row.aiText || ''}
                  onChange={e => handleFieldChange('aiText', e.target.value)}
                  disabled={row.isExtracting || disabled}
                  rows={2}
                />
                <button
                  type="button"
                  className={`boc-ai-btn ${row.isExtracting ? 'boc-ai-btn--loading' : ''}`}
                  onClick={() => onAIExtract(row.id)}
                  disabled={row.isExtracting || !row.aiText?.trim() || disabled}
                >
                  {row.isExtracting ? (
                    <><Loader2 size={14} className="boc-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles size={14} /> AI Autofill</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Customer Info Grid */}
          <div className="boc-form-section">
            <div className="boc-section-title">
              <User size={13} /> Customer Details
            </div>
            <div className="boc-form-grid boc-grid-3">
              <div className="boc-field-wrap">
                <label className="boc-label">
                  <User size={11} /> Name <span className="boc-required">*</span>
                </label>
                <input
                  className={`boc-input ${validationErrors.customer_name ? 'boc-input--error' : ''}`}
                  placeholder="Full customer name"
                  value={row.customer_name}
                  onChange={e => handleFieldChange('customer_name', e.target.value)}
                  onBlur={runValidation}
                  disabled={isLocked || disabled}
                />
                {validationErrors.customer_name && (
                  <span className="boc-field-error">{validationErrors.customer_name}</span>
                )}
              </div>
              <div className="boc-field-wrap">
                <label className="boc-label">
                  <Phone size={11} /> Phone <span className="boc-required">*</span>
                </label>
                <input
                  className={`boc-input ${validationErrors.phone ? 'boc-input--error' : ''}`}
                  placeholder="01XXXXXXXXX"
                  value={row.phone}
                  onChange={e => handleFieldChange('phone', e.target.value)}
                  onBlur={runValidation}
                  disabled={isLocked || disabled}
                />
                {validationErrors.phone && (
                  <span className="boc-field-error">{validationErrors.phone}</span>
                )}
              </div>
              <div className="boc-field-wrap">
                <label className="boc-label">
                  <Globe size={11} /> Source
                </label>
                <select
                  className="boc-input boc-select"
                  value={row.source}
                  onChange={e => handleFieldChange('source', e.target.value)}
                  disabled={isLocked || disabled}
                >
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="boc-form-grid boc-grid-2" style={{ marginTop: '10px' }}>
              <div className="boc-field-wrap boc-field-span-2">
                <label className="boc-label">
                  <MapPin size={11} /> Address <span className="boc-required">*</span>
                </label>
                <input
                  className={`boc-input ${validationErrors.address ? 'boc-input--error' : ''}`}
                  placeholder="Full delivery address"
                  value={row.address}
                  onChange={e => handleFieldChange('address', e.target.value)}
                  onBlur={runValidation}
                  disabled={isLocked || disabled}
                />
                {validationErrors.address && (
                  <span className="boc-field-error">{validationErrors.address}</span>
                )}
              </div>
              <div className="boc-field-wrap">
                <label className="boc-label">
                  <MapPin size={11} /> Shipping Zone
                </label>
                <select
                  className="boc-input boc-select"
                  value={row.shipping_zone}
                  onChange={e => handleFieldChange('shipping_zone', e.target.value)}
                  disabled={isLocked || disabled}
                >
                  {SHIPPING_ZONES.map(z => (
                    <option key={z.value} value={z.value}>{z.value} (৳{z.charge})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Products Section */}
          <div className="boc-form-section">
            <div className="boc-section-title">
              <Package size={13} /> Products
              {validationErrors.products && (
                <span className="boc-field-error" style={{ marginLeft: 8 }}>{validationErrors.products}</span>
              )}
            </div>
            <div className="boc-products-list">
              {row.products.map((product, pIdx) => (
                <div key={pIdx} className="boc-product-row">
                  <div className="boc-product-color-dot" style={{ background: PRODUCT_COLORS[product.name] || '#94a3b8' }} />
                  <div className="boc-field-wrap" style={{ flex: '2' }}>
                    <select
                      className="boc-input boc-select boc-product-select"
                      value={product.name}
                      onChange={e => handleProductChange(pIdx, { name: e.target.value })}
                      disabled={isLocked || disabled}
                    >
                      {PRODUCT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  </div>
                  <div className="boc-field-wrap boc-field-sm">
                    <input
                      className="boc-input"
                      placeholder="Size"
                      value={product.size || ''}
                      onChange={e => handleProductChange(pIdx, { size: e.target.value })}
                      disabled={isLocked || disabled}
                    />
                  </div>
                  <div className="boc-field-wrap boc-field-xs">
                    <input
                      className="boc-input boc-qty-input"
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={product.quantity}
                      onChange={e => handleProductChange(pIdx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      disabled={isLocked || disabled}
                    />
                  </div>
                  <div className="boc-field-wrap boc-field-sm">
                    <div className="boc-price-display">
                      <CurrencyIcon size={11} />
                      <input
                        className="boc-input boc-price-input"
                        type="number"
                        min="0"
                        placeholder="Price"
                        value={product.price}
                        onChange={e => handleProductChange(pIdx, { price: parseFloat(e.target.value) || 0 })}
                        disabled={isLocked || disabled}
                      />
                    </div>
                  </div>
                  <div className="boc-product-line-total">
                    <CurrencyIcon size={11} />
                    {((product.price || 0) * (product.quantity || 1)).toLocaleString()}
                  </div>
                  {!isLocked && row.products.length > 1 && (
                    <button
                      type="button"
                      className="boc-icon-btn boc-btn-del boc-product-del"
                      onClick={() => removeProduct(pIdx)}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!isLocked && (
              <button type="button" className="boc-add-product-btn" onClick={addProduct}>
                <Plus size={13} /> Add Product
              </button>
            )}

            {/* Row Total Summary */}
            <div className="boc-row-totals">
              <div className="boc-total-line">
                <span>Subtotal</span>
                <span>
                  <CurrencyIcon size={12} />
                  {row.products.reduce((s, p) => s + (p.price || 0) * (p.quantity || 1), 0).toLocaleString()}
                </span>
              </div>
              <div className="boc-total-line">
                <span>Delivery ({row.shipping_zone})</span>
                <span>
                  <CurrencyIcon size={12} />
                  {(SHIPPING_ZONES.find(z => z.value === row.shipping_zone)?.charge || 150).toLocaleString()}
                </span>
              </div>
              <div className="boc-total-line boc-total-final">
                <span>Order Total</span>
                <span>
                  <CurrencyIcon size={13} />
                  {total.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="boc-field-wrap" style={{ marginTop: 10 }}>
            <label className="boc-label"><FileText size={11} /> Notes (Optional)</label>
            <textarea
              className="boc-input boc-notes-input"
              placeholder="Special instructions, preferences..."
              value={row.notes}
              onChange={e => handleFieldChange('notes', e.target.value)}
              disabled={isLocked || disabled}
              rows={2}
            />
          </div>

          {/* Error Message for failed rows */}
          {row.status === 'failed' && row.errorMsg && (
            <div className="boc-row-error-banner">
              <AlertCircle size={14} /> {row.errorMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ─── Main Component ───────────────────────────────────────────────────
const BulkOrderCreator = ({ isOpen, onClose }) => {
  const { user, profile, userRoles } = useAuth();
  const { addOrder } = useOrders();

  const [rows, setRows] = useState([createEmptyRow()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResults, setSubmitResults] = useState(null);
  const [globalAiText, setGlobalAiText] = useState('');
  const [isGlobalExtracting, setIsGlobalExtracting] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeTab, setActiveTab] = useState('editor'); // editor | csv | results
  const [csvPreviewRows, setCsvPreviewRows] = useState(null); // null = no preview
  const [isImportingCSV, setIsImportingCSV] = useState(false);
  const [csvErrors, setCsvErrors] = useState([]);
  const csvFileRef = useRef(null);

  const scrollRef = useRef(null);

  const reset = useCallback(() => {
    setRows([createEmptyRow()]);
    setSubmitResults(null);
    setGlobalAiText('');
    setSelectedRows([]);
    setSelectAll(false);
    setActiveTab('editor');
    setCsvPreviewRows(null);
    setCsvErrors([]);
    if (csvFileRef.current) csvFileRef.current.value = '';
  }, []);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  // ── Row Manipulation ────────────────────────────────────────────────
  const updateRow = useCallback((rowId, updates) => {
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, ...updates, status: r.status === 'created' ? 'created' : 'draft' } : r));
  }, []);

  const addNewRow = useCallback(() => {
    const newRow = createEmptyRow();
    setRows(prev => [...prev, newRow]);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, []);

  const removeRow = useCallback((rowId) => {
    setRows(prev => prev.filter(r => r.id !== rowId));
  }, []);

  const duplicateRow = useCallback((rowId) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.id === rowId);
      if (idx === -1) return prev;
      const copy = {
        ...JSON.parse(JSON.stringify(prev[idx])),
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        status: 'draft',
        errorMsg: ''
      };
      const newRows = [...prev];
      newRows.splice(idx + 1, 0, copy);
      return newRows;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setRows(prev => prev.map(r => ({ ...r, isExpanded: false })));
  }, []);

  const expandAll = useCallback(() => {
    setRows(prev => prev.map(r => ({ ...r, isExpanded: true })));
  }, []);

  // ── Per-Row AI Extraction ────────────────────────────────────────────
  const handleAIExtract = useCallback(async (rowId) => {
    const row = rows.find(r => r.id === rowId);
    if (!row?.aiText?.trim()) return;
    setRows(prev => prev.map(r => r.id === rowId ? { ...r, isExtracting: true } : r));
    try {
      const extracted = await api.extractOrderWithAI(row.aiText);
      if (extracted) {
        const mappedProducts = (extracted.products || []).map(p => {
          const matched = PRODUCT_OPTIONS.find(opt =>
            p.name?.toUpperCase().includes(opt.toUpperCase())
          ) || 'TOY BOX';
          const boxMatch = p.name?.match(/#(\d+)/);
          return {
            name: matched,
            quantity: Math.max(1, p.quantity || 1),
            size: p.size || '',
            price: PRODUCT_PRICES[matched] || 0,
            toyBoxNumber: boxMatch ? parseInt(boxMatch[1]) : null
          };
        });
        setRows(prev => prev.map(r => r.id !== rowId ? r : {
          ...r,
          customer_name: extracted.customer_name || r.customer_name,
          phone: extracted.phone || r.phone,
          address: extracted.address || r.address,
          shipping_zone: extracted.shipping_zone || r.shipping_zone,
          notes: extracted.notes || r.notes,
          products: mappedProducts.length > 0 ? mappedProducts : r.products,
          aiText: '',
          isExtracting: false,
          status: 'draft'
        }));
      } else {
        setRows(prev => prev.map(r => r.id === rowId ? { ...r, isExtracting: false } : r));
      }
    } catch (err) {
      console.error('AI extraction failed:', err);
      setRows(prev => prev.map(r => r.id === rowId ? { ...r, isExtracting: false } : r));
    }
  }, [rows]);

  // ── Global AI Paste-and-Split ─────────────────────────────────────────
  const handleGlobalAIPaste = useCallback(async () => {
    if (!globalAiText.trim()) return;
    setIsGlobalExtracting(true);
    try {
      // Split by line breaks or delimiters that look like different orders
      const blocks = globalAiText
        .split(/\n\s*\n+|---+|={3,}/)
        .map(b => b.trim())
        .filter(Boolean);

      if (blocks.length === 0) {
        setIsGlobalExtracting(false);
        return;
      }

      const extractedRows = await Promise.all(
        blocks.map(async (block) => {
          const newRow = createEmptyRow();
          try {
            const extracted = await api.extractOrderWithAI(block);
            if (extracted) {
              const mappedProducts = (extracted.products || []).map(p => {
                const matched = PRODUCT_OPTIONS.find(opt =>
                  p.name?.toUpperCase().includes(opt.toUpperCase())
                ) || 'TOY BOX';
                return {
                  name: matched,
                  quantity: Math.max(1, p.quantity || 1),
                  size: p.size || '',
                  price: PRODUCT_PRICES[matched] || 0,
                  toyBoxNumber: null
                };
              });
              return {
                ...newRow,
                customer_name: extracted.customer_name || '',
                phone: extracted.phone || '',
                address: extracted.address || '',
                shipping_zone: extracted.shipping_zone || 'Outside Dhaka',
                notes: extracted.notes || '',
                products: mappedProducts.length > 0 ? mappedProducts : newRow.products,
                status: 'draft'
              };
            }
          } catch { /* fallback */ }
          return { ...newRow, aiText: block };
        })
      );

      setRows(prev => {
        const existingDrafts = prev.filter(r => r.status !== 'created' && !r.customer_name && !r.phone);
        const keptRows = prev.filter(r => r.status === 'created' || r.customer_name || r.phone);
        return [...keptRows, ...extractedRows];
      });
      setGlobalAiText('');
    } catch (err) {
      console.error('Global AI extraction failed:', err);
    } finally {
      setIsGlobalExtracting(false);
    }
  }, [globalAiText]);

  // ── Validation ────────────────────────────────────────────────────────
  const validateAll = useCallback(() => {
    let allValid = true;
    setRows(prev => prev.map(r => {
      if (r.status === 'created') return r;
      const errs = validateRow(r);
      const isValid = Object.keys(errs).length === 0;
      if (!isValid) allValid = false;
      return { ...r, status: isValid ? 'valid' : 'error', errorMsg: isValid ? '' : Object.values(errs).join('; ') };
    }));
    return allValid;
  }, []);

  // ── Submission ─────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const allValid = validateAll();
    if (!allValid) {
      // Expand all rows with errors
      setRows(prev => prev.map(r => ({
        ...r,
        isExpanded: r.status === 'error' ? true : r.isExpanded
      })));
      return;
    }

    const pendingRows = rows.filter(r => r.status === 'valid' || r.status === 'draft');
    if (pendingRows.length === 0) return;

    setIsSubmitting(true);
    const results = { succeeded: [], failed: [] };

    for (const row of pendingRows) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'creating' } : r));
      try {
        const payload = {
          customer_name: row.customer_name.trim(),
          phone: row.phone.replace(/\D/g, ''),
          address: row.address.trim(),
          product_name: row.products.length > 1
            ? `${row.products.length} Items`
            : row.products[0].name,
          size: row.products[0]?.size || '',
          quantity: row.products.reduce((sum, p) => sum + (p.quantity || 1), 0),
          source: row.source,
          notes: row.notes,
          amount: calcRowTotal(row),
          shipping_zone: row.shipping_zone,
          ordered_items: row.products,
          status: 'New'
        };
        await addOrder(payload);
        results.succeeded.push({ id: row.id, customer_name: row.customer_name });
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'created' } : r));
      } catch (err) {
        const errMsg = err?.message || 'Unknown error';
        results.failed.push({ id: row.id, customer_name: row.customer_name, error: errMsg });
        setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'failed', errorMsg: errMsg } : r));
      }
    }

    setSubmitResults(results);
    setIsSubmitting(false);
    if (results.succeeded.length > 0 && results.failed.length === 0) {
      setActiveTab('results');
    }
  }, [rows, validateAll, addOrder]);

  // ── CSV Import ─────────────────────────────────────────────────────────
  const handleCSVFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const { rows: parsed, errors } = parseCSV(text);
      if (parsed.length === 0) {
        setCsvErrors(['No valid rows found. Check your file format.']);
        setCsvPreviewRows(null);
      } else {
        setCsvPreviewRows(parsed);
        setCsvErrors(errors);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleCSVPasteText = useCallback((text) => {
    const { rows: parsed, errors } = parseCSV(text);
    if (parsed.length === 0) {
      setCsvErrors(['No valid rows found. Check your file format.']);
      setCsvPreviewRows(null);
    } else {
      setCsvPreviewRows(parsed);
      setCsvErrors(errors);
    }
  }, []);

  const handleCSVConfirm = useCallback((previewRows) => {
    // Only import valid rows (no errors)
    const validRows = previewRows.filter(r => !r._csv_errors?.length);
    if (validRows.length === 0) return;
    setIsImportingCSV(true);

    // Clean up temporary CSV fields before adding to editor
    const cleaned = validRows.map(r => {
      const row = { ...r };
      delete row._csv_total;
      delete row._csv_delivery;
      delete row._csv_errors;
      return row;
    });

    setRows(prev => {
      const keptRows = prev.filter(r => r.status === 'created' || r.customer_name || r.phone);
      return [...keptRows, ...cleaned];
    });
    setCsvPreviewRows(null);
    setCsvErrors([]);
    if (csvFileRef.current) csvFileRef.current.value = '';
    setIsImportingCSV(false);
    setActiveTab('editor');
  }, []);

  // ── Stats ─────────────────────────────────────────────────────────────
  const stats = {
    total: rows.length,
    ready: rows.filter(r => r.status === 'valid').length,
    draft: rows.filter(r => r.status === 'draft').length,
    error: rows.filter(r => r.status === 'error').length,
    created: rows.filter(r => r.status === 'created').length,
    failed: rows.filter(r => r.status === 'failed').length,
    grandTotal: rows.reduce((s, r) => s + calcRowTotal(r), 0),
  };
  const pendingCount = rows.filter(r => !['creating', 'created'].includes(r.status)).length;

  if (!isOpen) return null;

  return (
    <div className="boc-overlay" onClick={(e) => e.target === e.currentTarget && !isSubmitting && onClose()}>
      <div className="boc-panel">
        {/* ─── Header ─── */}
        <div className="boc-header">
          <div className="boc-header-left">
            <div className="boc-header-icon">
              <ClipboardList size={22} />
            </div>
            <div>
              <h2 className="boc-title">Bulk Order Creator</h2>
              <p className="boc-subtitle">Create multiple orders simultaneously with AI-powered autofill</p>
            </div>
          </div>
          <div className="boc-header-right">
            <div className="boc-stats-bar">
              <div className="boc-stat">
                <span className="boc-stat-num">{stats.total}</span>
                <span className="boc-stat-lbl">Orders</span>
              </div>
              <div className="boc-stat boc-stat-created">
                <span className="boc-stat-num">{stats.created}</span>
                <span className="boc-stat-lbl">Created</span>
              </div>
              {stats.error > 0 && (
                <div className="boc-stat boc-stat-error">
                  <span className="boc-stat-num">{stats.error}</span>
                  <span className="boc-stat-lbl">Errors</span>
                </div>
              )}
              <div className="boc-stat boc-stat-total">
                <CurrencyIcon size={13} />
                <span className="boc-stat-num">{stats.grandTotal.toLocaleString()}</span>
                <span className="boc-stat-lbl">Total Value</span>
              </div>
            </div>
            <button className="boc-close-btn" onClick={onClose} disabled={isSubmitting}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ─── Tabs ─── */}
        <div className="boc-tabs">
          <button className={`boc-tab ${activeTab === 'editor' ? 'boc-tab--active' : ''}`} onClick={() => setActiveTab('editor')}>
            <Edit3 size={14} /> Order Editor
            <span className="boc-tab-badge">{stats.total}</span>
          </button>
          <button className={`boc-tab ${activeTab === 'csv' ? 'boc-tab--active' : ''}`} onClick={() => setActiveTab('csv')}>
            <FileSpreadsheet size={14} /> CSV Import
            {csvPreviewRows && <span className="boc-tab-badge" style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>{csvPreviewRows.length}</span>}
          </button>
          {submitResults && (
            <button className={`boc-tab ${activeTab === 'results' ? 'boc-tab--active' : ''}`} onClick={() => setActiveTab('results')}>
              <CheckCircle2 size={14} /> Results
              <span className="boc-tab-badge boc-badge-success">{submitResults.succeeded.length}</span>
            </button>
          )}
          {/* Hidden file input for CSV */}
          <input
            ref={csvFileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            style={{ display: 'none' }}
            onChange={handleCSVFile}
          />
        </div>

        {activeTab === 'csv' && (
          <div className="boc-csv-tab" ref={scrollRef}>
            {!csvPreviewRows ? (
              <div className="csv-upload-area">
                {/* Upload zone */}
                <div
                  className="csv-dropzone"
                  onClick={() => csvFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('csv-dropzone--hover'); }}
                  onDragLeave={e => e.currentTarget.classList.remove('csv-dropzone--hover')}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('csv-dropzone--hover');
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = evt => handleCSVPasteText(evt.target.result);
                      reader.readAsText(file, 'UTF-8');
                    }
                  }}
                >
                  <FileSpreadsheet size={32} className="csv-dropzone-icon" />
                  <div className="csv-dropzone-title">Drop your CSV/Excel file here</div>
                  <div className="csv-dropzone-sub">or click to browse — supports <strong>.csv</strong>, <strong>.tsv</strong>, <strong>.txt</strong></div>
                  <button type="button" className="boc-ai-import-btn" style={{ marginTop: 12 }}>
                    <Upload size={15} /> Choose File
                  </button>
                </div>

                {/* Paste area */}
                <div className="csv-paste-section">
                  <div className="csv-paste-label"><Table2 size={13} /> Or paste tab-separated data directly</div>
                  <textarea
                    className="boc-global-textarea csv-paste-textarea"
                    placeholder={"NAME\tADDRESS\tPhone\tToyboxcode\tsource\tQTY(TOY)\tORG QTY\tMMB BAG\tOTHER\ttoy box amount\tORG Amount\tMMB Amount\tOTHER (Amount)\tDELIVERY CHARGE\tTotal\nRafi Ahmed\tInside Dhaka - Mirpur...\t01712345678\tA1\tFacebook\t2\t1\t0\t0\t2500\t850\t0\t0\t80\t3430"}
                    rows={5}
                    onChange={e => {
                      if (e.target.value.trim()) handleCSVPasteText(e.target.value);
                    }}
                  />
                </div>

                {/* Format reference */}
                <div className="csv-format-ref">
                  <div className="csv-format-title"><Info size={13} /> Expected Column Order</div>
                  <div className="csv-format-cols">
                    {['NAME','ADDRESS (inside/outside)','Phone','Toyboxcode','source','QTY(TOY)','ORG QTY','MMB BAG','OTHER','toy box amount','ORG Amount','MMB Amount','OTHER (Amount)','DELIVERY CHARGE','Total'].map((col, i) => (
                      <span key={i} className={`csv-col-chip ${[0,1,2].includes(i) ? 'csv-col-required' : ''}`}>
                        {[0,1,2].includes(i) && <span className="csv-col-req-dot" />}
                        {col}
                      </span>
                    ))}
                  </div>
                  <p className="csv-format-note">
                    Columns marked <span className="csv-col-req-label">red dot</span> are required.
                    Zone (Inside/Outside Dhaka) is auto-detected from the ADDRESS column text.
                    Copy directly from your Excel sheet — tab-separated format is supported.
                  </p>
                </div>

                {csvErrors.length > 0 && (
                  <div className="csv-global-errors">
                    {csvErrors.map((e, i) => (
                      <div key={i} className="csv-error-item">
                        <AlertCircle size={12} /> {e}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <CSVPreviewTable
                rows={csvPreviewRows}
                onConfirm={handleCSVConfirm}
                onCancel={() => { setCsvPreviewRows(null); if (csvFileRef.current) csvFileRef.current.value = ''; }}
                isImporting={isImportingCSV}
              />
            )}
          </div>
        )}

        {activeTab === 'editor' && (
          <>
            {/* ─── Global AI Section ─── */}
            <div className="boc-global-ai">
              <div className="boc-global-ai-header">
                <div className="boc-global-ai-icon">
                  <Zap size={16} />
                </div>
                <div>
                  <div className="boc-global-ai-title">Batch AI Import</div>
                  <div className="boc-global-ai-desc">Paste multiple orders separated by blank lines or <code>---</code> dividers. AI will split and extract each order automatically.</div>
                </div>
              </div>
              <div className="boc-global-ai-body">
                <textarea
                  className="boc-global-textarea"
                  placeholder={`Order 1 text here...\n\n---\n\nOrder 2 text here...\n\n---\n\nOrder 3 text here...`}
                  value={globalAiText}
                  onChange={e => setGlobalAiText(e.target.value)}
                  disabled={isGlobalExtracting || isSubmitting}
                  rows={4}
                />
                <div className="boc-global-ai-actions">
                  <button
                    type="button"
                    className={`boc-ai-import-btn ${isGlobalExtracting ? 'boc-ai-btn--loading' : ''}`}
                    onClick={handleGlobalAIPaste}
                    disabled={isGlobalExtracting || !globalAiText.trim() || isSubmitting}
                  >
                    {isGlobalExtracting ? (
                      <><Loader2 size={15} className="boc-spin" /> Processing {globalAiText.split(/\n\s*\n+|---+|={3,}/).filter(Boolean).length} orders...</>
                    ) : (
                      <><Sparkles size={15} /> AI Batch Import ({globalAiText.split(/\n\s*\n+|---+|={3,}/).filter(Boolean).length} orders)</>
                    )}
                  </button>
                  {globalAiText && (
                    <button type="button" className="boc-clear-btn" onClick={() => setGlobalAiText('')}>
                      <X size={13} /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ─── Toolbar ─── */}
            <div className="boc-toolbar">
              <div className="boc-toolbar-left">
                <button type="button" className="boc-tool-btn" onClick={addNewRow} disabled={isSubmitting}>
                  <Plus size={14} /> Add Order
                </button>
                <button type="button" className="boc-tool-btn" onClick={collapseAll}>
                  <ChevronsDown size={14} /> Collapse All
                </button>
                <button type="button" className="boc-tool-btn" onClick={expandAll}>
                  <ChevronDown size={14} /> Expand All
                </button>
                <button type="button" className="boc-tool-btn boc-tool-btn--danger"
                  onClick={() => { if (window.confirm('Clear all orders?')) reset(); }}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={14} /> Reset
                </button>
              </div>
              <div className="boc-toolbar-right">
                <span className="boc-ready-count">
                  <Info size={12} />
                  {pendingCount} orders pending creation
                </span>
                <button
                  type="button"
                  className="boc-validate-btn"
                  onClick={validateAll}
                  disabled={isSubmitting}
                >
                  <CheckCircle2 size={14} /> Validate All
                </button>
              </div>
            </div>

            {/* ─── Order Rows ─── */}
            <div className="boc-rows-container" ref={scrollRef}>
              {rows.length === 0 ? (
                <div className="boc-empty-state">
                  <div className="boc-empty-icon"><ClipboardList size={40} /></div>
                  <h3>No Orders Yet</h3>
                  <p>Click "Add Order" to start, or use the AI Batch Import above.</p>
                </div>
              ) : (
                rows.map((row, index) => (
                  <OrderRowEditor
                    key={row.id}
                    row={row}
                    index={index}
                    onChange={updateRow}
                    onRemove={removeRow}
                    onDuplicate={duplicateRow}
                    onAIExtract={handleAIExtract}
                    disabled={isSubmitting}
                  />
                ))
              )}
            </div>

            {/* ─── Footer ─── */}
            <div className="boc-footer">
              <div className="boc-footer-summary">
                <div className="boc-footer-stat">
                  <span className="boc-footer-lbl">Orders</span>
                  <span className="boc-footer-val">{stats.total}</span>
                </div>
                <div className="boc-footer-divider" />
                <div className="boc-footer-stat">
                  <span className="boc-footer-lbl">Created</span>
                  <span className="boc-footer-val boc-val-success">{stats.created}</span>
                </div>
                {stats.failed > 0 && (
                  <>
                    <div className="boc-footer-divider" />
                    <div className="boc-footer-stat">
                      <span className="boc-footer-lbl">Failed</span>
                      <span className="boc-footer-val boc-val-error">{stats.failed}</span>
                    </div>
                  </>
                )}
                <div className="boc-footer-divider" />
                <div className="boc-footer-stat boc-footer-total">
                  <span className="boc-footer-lbl">Grand Total</span>
                  <span className="boc-footer-val">
                    <CurrencyIcon size={14} /> {stats.grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="boc-footer-actions">
                <button type="button" className="boc-cancel-btn" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`boc-submit-btn ${isSubmitting ? 'boc-submit-btn--loading' : ''}`}
                  onClick={handleSubmit}
                  disabled={isSubmitting || pendingCount === 0}
                >
                  {isSubmitting ? (
                    <><Loader2 size={16} className="boc-spin" /> Creating Orders...</>
                  ) : (
                    <><Send size={16} /> Create {pendingCount} Order{pendingCount !== 1 ? 's' : ''} <ArrowRight size={14} /></>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── Results Tab ─── */}
        {activeTab === 'results' && submitResults && (
          <div className="boc-results-panel">
            <div className="boc-results-header">
              <div className="boc-results-summary-cards">
                <div className="boc-result-card boc-result-card--success">
                  <CheckCircle2 size={28} />
                  <div>
                    <div className="boc-result-num">{submitResults.succeeded.length}</div>
                    <div className="boc-result-lbl">Successfully Created</div>
                  </div>
                </div>
                {submitResults.failed.length > 0 && (
                  <div className="boc-result-card boc-result-card--error">
                    <AlertCircle size={28} />
                    <div>
                      <div className="boc-result-num">{submitResults.failed.length}</div>
                      <div className="boc-result-lbl">Failed</div>
                    </div>
                  </div>
                )}
                <div className="boc-result-card">
                  <CurrencyIcon size={24} />
                  <div>
                    <div className="boc-result-num">{stats.grandTotal.toLocaleString()}</div>
                    <div className="boc-result-lbl">Total Order Value</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="boc-results-list">
              {submitResults.succeeded.map((r, i) => (
                <div key={i} className="boc-result-item boc-result-item--success">
                  <CheckCircle2 size={16} />
                  <span>{r.customer_name || 'Order'} — Created successfully</span>
                </div>
              ))}
              {submitResults.failed.map((r, i) => (
                <div key={i} className="boc-result-item boc-result-item--error">
                  <AlertCircle size={16} />
                  <span>{r.customer_name} — {r.error}</span>
                </div>
              ))}
            </div>
            <div className="boc-results-actions">
              {submitResults.failed.length > 0 && (
                <button type="button" className="boc-tool-btn" onClick={() => setActiveTab('editor')}>
                  <Edit3 size={14} /> Fix Failed Orders
                </button>
              )}
              <button type="button" className="boc-submit-btn" onClick={onClose}>
                <CheckCircle2 size={16} /> Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkOrderCreator;
