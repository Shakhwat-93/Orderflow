/**
 * PrintPreviewModal.jsx
 * ──────────────────────
 * Enterprise-grade print preview modal for OrderFlow.
 *
 * Features:
 *  - Template selector: A4 Invoice | Thermal Label
 *  - Live scrollable preview (rendered HTML in iframe)
 *  - Print settings: paper size, show price, show logo, color mode
 *  - Single order or bulk (N orders) mode
 *  - Print button triggers native browser print dialog
 *  - Company branding settings (persisted to localStorage)
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  X, Printer, FileText, Tag, Settings2, Eye,
  ChevronDown, ChevronUp, Check, Package,
  Building2, Phone, MapPin, Sparkles,
  LayoutTemplate, Zap
} from 'lucide-react';
import {
  buildA4HTML,
  buildThermalHTML,
  openPrintWindow,
  extractProductDetails,
  formatBDT,
  formatDate
} from './printUtils';
import './PrintPreviewModal.css';

// ─── Constants ─────────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'a4-invoice',
    label: 'A4 Invoice',
    icon: FileText,
    description: 'Professional invoice — A4 paper, full details',
    color: '#6366f1',
    bg: 'rgba(99,102,241,0.08)',
  },
  {
    id: 'thermal-label',
    label: 'Thermal Sticker',
    icon: Tag,
    description: 'Compact delivery label — 80mm thermal printer',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
  },
];

const COMPANY_SETTINGS_KEY = 'orderflow_print_company_settings';

const loadCompanySettings = () => {
  try {
    const saved = localStorage.getItem(COMPANY_SETTINGS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

const saveCompanySettings = (settings) => {
  try {
    localStorage.setItem(COMPANY_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
};

// ─── Component ─────────────────────────────────────────────────────────────
/**
 * PrintPreviewModal
 *
 * Props:
 *  isOpen        boolean              — whether the modal is visible
 *  onClose       () => void
 *  orders        Order[]              — orders to print (1 = single, N = bulk)
 */
const PrintPreviewModal = ({ isOpen, onClose, orders = [] }) => {
  // ── Template selection ──────────────────────────────────────────────────
  const [activeTemplate, setActiveTemplate] = useState('a4-invoice');

  // ── Print settings ──────────────────────────────────────────────────────
  const [paperSize, setPaperSize]     = useState('A4');       // 'A4' | '80mm' | '100mm'
  const [showPrice, setShowPrice]     = useState(true);
  const [showLogo, setShowLogo]       = useState(true);
  const [colorMode, setColorMode]     = useState('color');    // 'color' | 'bw'
  const [copies, setCopies]           = useState(1);

  // ── Company branding (persisted) ────────────────────────────────────────
  const [companySettings, setCompanySettings] = useState(() => ({
    companyName:    'OrderFlow',
    companyPhone:   '',
    companyAddress: '',
    companyTagline: 'Quality Products, Delivered Fast',
    ...loadCompanySettings(),
  }));
  const [showBrandingPanel, setShowBrandingPanel] = useState(false);

  // ── Preview state ───────────────────────────────────────────────────────
  const [previewHtml, setPreviewHtml]       = useState('');
  const [isGenerating, setIsGenerating]     = useState(false);
  const [previewOrder, setPreviewOrder]     = useState(0); // index of order being previewed
  const iframeRef = useRef(null);

  // ── Build preview HTML whenever settings change ──────────────────────────
  const buildPreviewHtml = useCallback(() => {
    if (!orders || orders.length === 0) return '';
    const settings = {
      showPrice,
      showLogo,
      colorMode,
      paperSize: activeTemplate === 'thermal-label' ? paperSize : 'A4',
      ...companySettings,
    };
    // For preview, only render 1 order at a time to keep it fast
    const singleOrder = [orders[previewOrder] || orders[0]];
    if (activeTemplate === 'thermal-label') {
      return buildThermalHTML(singleOrder, settings);
    }
    return buildA4HTML(singleOrder, settings);
  }, [orders, activeTemplate, showPrice, showLogo, colorMode, paperSize, companySettings, previewOrder]);

  useEffect(() => {
    if (!isOpen) return;
    setIsGenerating(true);
    const timer = setTimeout(() => {
      const html = buildPreviewHtml();
      setPreviewHtml(html);
      setIsGenerating(false);
    }, 120);
    return () => clearTimeout(timer);
  }, [isOpen, buildPreviewHtml]);

  // Update iframe content when previewHtml changes
  useEffect(() => {
    if (!iframeRef.current || !previewHtml) return;
    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  // ── Save branding changes ───────────────────────────────────────────────
  const handleBrandingChange = (field, value) => {
    const updated = { ...companySettings, [field]: value };
    setCompanySettings(updated);
    saveCompanySettings(updated);
  };

  // ── Print handler ───────────────────────────────────────────────────────
  const handlePrint = useCallback(() => {
    if (!orders || orders.length === 0) return;
    const settings = {
      showPrice,
      showLogo,
      colorMode,
      paperSize: activeTemplate === 'thermal-label' ? paperSize : 'A4',
      ...companySettings,
    };

    // Expand copies: repeat each order N times
    const expandedOrders = [];
    for (let c = 0; c < copies; c++) {
      expandedOrders.push(...orders);
    }

    let html = '';
    const title = activeTemplate === 'thermal-label'
      ? `Thermal Labels — ${orders.length} Order(s)`
      : `Invoice — ${orders.length} Order(s)`;

    if (activeTemplate === 'thermal-label') {
      html = buildThermalHTML(expandedOrders, settings);
    } else {
      html = buildA4HTML(expandedOrders, settings);
    }

    openPrintWindow(html, title);
  }, [orders, activeTemplate, showPrice, showLogo, colorMode, paperSize, copies, companySettings]);

  // ── Keyboard shortcut ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, handlePrint, onClose]);

  // ── Template switching: auto-adjust paper size ──────────────────────────
  useEffect(() => {
    if (activeTemplate === 'thermal-label') {
      setPaperSize(prev => (prev === 'A4' ? '80mm' : prev));
    } else {
      setPaperSize('A4');
    }
  }, [activeTemplate]);

  if (!isOpen) return null;

  const isSingleOrder = orders.length === 1;
  const selectedOrder = orders[previewOrder] || orders[0];
  const products = selectedOrder ? extractProductDetails(selectedOrder) : [];

  return (
    <div className="ppm-overlay" role="dialog" aria-modal="true" aria-label="Print Preview">
      <div className="ppm-modal">

        {/* ── Modal Header ───────────────────────────────────────────────── */}
        <div className="ppm-header">
          <div className="ppm-header-left">
            <div className="ppm-header-icon">
              <Printer size={18} />
            </div>
            <div>
              <h2 className="ppm-header-title">Print System</h2>
              <p className="ppm-header-sub">
                {isSingleOrder
                  ? `Single order · #${String(selectedOrder?.id || '').replace('ORD-', '')}`
                  : `Bulk print · ${orders.length} orders selected`}
              </p>
            </div>
          </div>
          <div className="ppm-header-actions">
            <button
              type="button"
              className="ppm-shortcut-hint"
              title="Keyboard shortcut: Ctrl+P"
            >
              <kbd>Ctrl</kbd>+<kbd>P</kbd>
            </button>
            <button type="button" className="ppm-close-btn" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Body: Two-column layout ─────────────────────────────────────── */}
        <div className="ppm-body">

          {/* LEFT: Settings Panel */}
          <div className="ppm-settings-panel">

            {/* Template Selector */}
            <div className="ppm-section">
              <div className="ppm-section-title">
                <LayoutTemplate size={13} />
                Template
              </div>
              <div className="ppm-template-grid">
                {TEMPLATES.map((tpl) => {
                  const Icon = tpl.icon;
                  const isActive = activeTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      className={`ppm-template-card ${isActive ? 'active' : ''}`}
                      style={{
                        '--tpl-color': tpl.color,
                        '--tpl-bg':    tpl.bg,
                      }}
                      onClick={() => setActiveTemplate(tpl.id)}
                    >
                      <div className="ppm-tpl-icon">
                        <Icon size={18} />
                      </div>
                      <div className="ppm-tpl-info">
                        <span className="ppm-tpl-label">{tpl.label}</span>
                        <span className="ppm-tpl-desc">{tpl.description}</span>
                      </div>
                      {isActive && (
                        <div className="ppm-tpl-check">
                          <Check size={11} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paper Size */}
            <div className="ppm-section">
              <div className="ppm-section-title">
                <Settings2 size={13} />
                Paper Size
              </div>
              <div className="ppm-pill-group">
                {(activeTemplate === 'a4-invoice'
                  ? [{ id: 'A4', label: 'A4' }]
                  : [
                      { id: '80mm', label: '80mm Thermal' },
                      { id: '100mm', label: '100mm Thermal' },
                    ]
                ).map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`ppm-pill ${paperSize === opt.id ? 'active' : ''}`}
                    onClick={() => setPaperSize(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Print Options */}
            <div className="ppm-section">
              <div className="ppm-section-title">
                <Zap size={13} />
                Print Options
              </div>

              <div className="ppm-option-row">
                <div className="ppm-option-label">
                  <span>Show Prices</span>
                  <span className="ppm-option-hint">Amounts visible on print</span>
                </div>
                <button
                  type="button"
                  className={`ppm-toggle ${showPrice ? 'on' : 'off'}`}
                  onClick={() => setShowPrice(p => !p)}
                  aria-pressed={showPrice}
                >
                  <span className="ppm-toggle-knob" />
                </button>
              </div>

              <div className="ppm-option-row">
                <div className="ppm-option-label">
                  <span>Show Logo / Brand</span>
                  <span className="ppm-option-hint">Company name in header</span>
                </div>
                <button
                  type="button"
                  className={`ppm-toggle ${showLogo ? 'on' : 'off'}`}
                  onClick={() => setShowLogo(p => !p)}
                  aria-pressed={showLogo}
                >
                  <span className="ppm-toggle-knob" />
                </button>
              </div>

              <div className="ppm-option-row">
                <div className="ppm-option-label">
                  <span>Color Mode</span>
                  <span className="ppm-option-hint">Color vs Black & White</span>
                </div>
                <div className="ppm-pill-group compact">
                  {[{ id: 'color', label: '🎨 Color' }, { id: 'bw', label: '⬛ B&W' }].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`ppm-pill ${colorMode === opt.id ? 'active' : ''}`}
                      onClick={() => setColorMode(opt.id)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ppm-option-row">
                <div className="ppm-option-label">
                  <span>Copies</span>
                  <span className="ppm-option-hint">Repeat per order</span>
                </div>
                <div className="ppm-copies-control">
                  <button type="button" className="ppm-copies-btn" onClick={() => setCopies(c => Math.max(1, c - 1))} disabled={copies <= 1}>−</button>
                  <span className="ppm-copies-value">{copies}</span>
                  <button type="button" className="ppm-copies-btn" onClick={() => setCopies(c => Math.min(5, c + 1))} disabled={copies >= 5}>+</button>
                </div>
              </div>
            </div>

            {/* Company Branding */}
            <div className="ppm-section">
              <button
                type="button"
                className="ppm-collapsible-header"
                onClick={() => setShowBrandingPanel(p => !p)}
              >
                <div className="ppm-section-title" style={{ margin: 0 }}>
                  <Building2 size={13} />
                  Company Branding
                </div>
                {showBrandingPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showBrandingPanel && (
                <div className="ppm-branding-fields">
                  {[
                    { key: 'companyName',    label: 'Company Name',    placeholder: 'OrderFlow',            icon: Building2 },
                    { key: 'companyPhone',   label: 'Phone',           placeholder: '01XXXXXXXXX',          icon: Phone },
                    { key: 'companyAddress', label: 'Address',         placeholder: 'Dhaka, Bangladesh',    icon: MapPin },
                    { key: 'companyTagline', label: 'Tagline',         placeholder: 'Quality Products...',  icon: Sparkles },
                  ].map(({ key, label, placeholder, icon: Icon }) => (
                    <div key={key} className="ppm-brand-field">
                      <label className="ppm-brand-label">
                        <Icon size={11} />
                        {label}
                      </label>
                      <input
                        type="text"
                        className="ppm-brand-input"
                        value={companySettings[key] || ''}
                        placeholder={placeholder}
                        onChange={e => handleBrandingChange(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bulk order navigator */}
            {!isSingleOrder && (
              <div className="ppm-section">
                <div className="ppm-section-title">
                  <Package size={13} />
                  Preview Order ({previewOrder + 1} of {orders.length})
                </div>
                <div className="ppm-nav-control">
                  <button
                    type="button"
                    className="ppm-nav-btn"
                    disabled={previewOrder <= 0}
                    onClick={() => setPreviewOrder(p => Math.max(0, p - 1))}
                  >
                    ‹ Prev
                  </button>
                  <div className="ppm-nav-info">
                    <span className="ppm-nav-name">{orders[previewOrder]?.customer_name || 'Unknown'}</span>
                    <span className="ppm-nav-id">#{String(orders[previewOrder]?.id || '').replace('ORD-', '')}</span>
                  </div>
                  <button
                    type="button"
                    className="ppm-nav-btn"
                    disabled={previewOrder >= orders.length - 1}
                    onClick={() => setPreviewOrder(p => Math.min(orders.length - 1, p + 1))}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}

          </div>{/* end settings panel */}

          {/* RIGHT: Preview Area */}
          <div className="ppm-preview-area">
            <div className="ppm-preview-toolbar">
              <div className="ppm-preview-label">
                <Eye size={13} />
                Live Preview
                <span className="ppm-preview-sub">
                  {activeTemplate === 'a4-invoice' ? 'A4' : paperSize} · Showing order {previewOrder + 1}
                </span>
              </div>
            </div>

            <div className="ppm-preview-frame-wrap">
              {isGenerating ? (
                <div className="ppm-preview-loading">
                  <div className="ppm-preview-spinner" />
                  <span>Generating preview...</span>
                </div>
              ) : (
                <iframe
                  ref={iframeRef}
                  className="ppm-preview-iframe"
                  title="Print Preview"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>

        </div>{/* end body */}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="ppm-footer">
          <div className="ppm-footer-info">
            <Package size={14} />
            <span>
              {orders.length} order{orders.length !== 1 ? 's' : ''}
              {copies > 1 ? ` × ${copies} copies = ${orders.length * copies} pages` : ''}
              &nbsp;·&nbsp;
              {activeTemplate === 'a4-invoice' ? 'A4 Invoice' : `Thermal Label (${paperSize})`}
            </span>
          </div>
          <div className="ppm-footer-actions">
            <button type="button" className="ppm-cancel-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="ppm-print-btn"
              onClick={handlePrint}
              disabled={orders.length === 0}
            >
              <Printer size={16} />
              Print {orders.length * copies > 1 ? `(${orders.length * copies} pages)` : 'Now'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PrintPreviewModal;
