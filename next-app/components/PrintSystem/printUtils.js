/**
 * PrintSystem / printUtils.js
 * ───────────────────────────
 * Core utility functions powering the enterprise print system.
 * Handles product data extraction, HTML template building,
 * and cross-browser print window management.
 */

// ─── Product Detail Extractor ──────────────────────────────────────────────
/**
 * Normalize order product details into a consistent array format.
 * Mirrors the logic in OrderDetailsModal.jsx for consistency.
 *
 * @param {Object} order - Order object from Supabase
 * @returns {Array<{name, quantity, size, unitPrice, totalPrice}>}
 */
export const extractProductDetails = (order) => {
  if (!order) return [];

  if (Array.isArray(order.order_lines_payload) && order.order_lines_payload.length > 0) {
    return order.order_lines_payload.map((item) => {
      const qty   = Number(item.quantity)  || 1;
      const total = Number(item.line_total ?? ((item.unit_price || 0) * qty)) || 0;
      const unit  = Number(item.unit_price ?? (total / qty)) || 0;
      return {
        name:       item.product_name || 'Unknown Product',
        quantity:   qty,
        size:       item.size || item.color || '',
        unitPrice:  unit,
        totalPrice: total,
      };
    });
  }

  if (Array.isArray(order.ordered_items) && order.ordered_items.length > 0) {
    if (typeof order.ordered_items[0] !== 'object') {
      // Array of serial numbers (legacy toybox format)
      const totalAmount = Number(order.amount) || 0;
      const count       = order.ordered_items.length;
      const unit        = count > 0 ? totalAmount / count : 0;
      return order.ordered_items.map((serial) => ({
        name:       order.product_name || 'TOY BOX',
        quantity:   1,
        size:       order.size || '',
        unitPrice:  unit,
        totalPrice: unit,
        toyBoxNumber: serial,
      }));
    }
    return order.ordered_items.map((item) => {
      const qty   = Number(item.quantity) || 1;
      const unit  = Number(item.price || 0);
      return {
        name:       item.name || item.product_name || 'Unknown Product',
        quantity:   qty,
        size:       item.size || item.color || '',
        unitPrice:  unit,
        totalPrice: unit * qty,
      };
    });
  }

  // Fallback: single-product order
  return [{
    name:       order.product_name || 'Unknown Product',
    quantity:   Number(order.quantity) || 1,
    size:       order.size || '',
    unitPrice:  Number(order.amount) || 0,
    totalPrice: Number(order.amount) || 0,
  }];
};

// ─── Financial Helpers ─────────────────────────────────────────────────────
/**
 * Resolve delivery charge from multiple possible sources.
 * @param {Object} order
 * @returns {number}
 */
export const resolveDeliveryCharge = (order) => {
  if (!order) return 0;
  const direct  = Number(order.delivery_charge);
  const summary = Number(order?.pricing_summary?.delivery_charge);
  if (Number.isFinite(direct)  && direct  > 0) return direct;
  if (Number.isFinite(summary) && summary > 0) return summary;
  const zone = String(order.shipping_zone || '').toLowerCase();
  return zone.includes('inside') ? 80 : 150;
};

/**
 * Format a number as Bangladeshi Taka currency string.
 * @param {number} amount
 * @returns {string}
 */
export const formatBDT = (amount) =>
  `৳${Number(amount || 0).toLocaleString('en-BD')}`;

/**
 * Format ISO date string to readable format.
 * @param {string} iso
 * @returns {string}
 */
export const formatDate = (iso) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
};

/**
 * Format ISO date to include time.
 * @param {string} iso
 * @returns {string}
 */
export const formatDateTime = (iso) => {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
};

// ─── A4 Invoice HTML Builder ───────────────────────────────────────────────
/**
 * Build a complete self-contained A4 invoice HTML string.
 * This string is injected into a fresh print window — no external CSS.
 *
 * @param {Object[]} orders - Array of order objects
 * @param {Object} settings - Print settings
 * @param {boolean} settings.showPrice  - Whether to show prices
 * @param {boolean} settings.showLogo   - Whether to show company logo/name
 * @param {string}  settings.colorMode  - 'color' | 'bw'
 * @param {string}  settings.companyName
 * @param {string}  settings.companyPhone
 * @param {string}  settings.companyAddress
 * @param {string}  settings.companyTagline
 * @returns {string} Full HTML document string
 */
export const buildA4HTML = (orders, settings = {}) => {
  const {
    showPrice     = true,
    showLogo      = true,
    colorMode     = 'color',
    companyName   = 'OrderFlow',
    companyPhone  = '',
    companyAddress= '',
    companyTagline= 'Quality Products, Delivered Fast',
  } = settings;

  const accent    = colorMode === 'color' ? '#6366f1' : '#1a1a1a';
  const accentBg  = colorMode === 'color' ? '#f0f0ff' : '#f5f5f5';
  const greenText = colorMode === 'color' ? '#059669' : '#333';
  const redText   = colorMode === 'color' ? '#dc2626' : '#555';

  const pages = orders.map((order) => {
    const products     = extractProductDetails(order);
    const deliveryCharge = resolveDeliveryCharge(order);
    const grandTotal   = Number(order.amount || 0);
    const subtotal     = Math.max(0, grandTotal - deliveryCharge);
    const isPaid       = String(order.payment_status || '').toLowerCase() === 'paid';

    const productRows = products.map((p, idx) => `
      <tr>
        <td class="td-num">${idx + 1}</td>
        <td class="td-name">
          ${escHtml(p.name)}
          ${p.size ? `<span class="size-badge">${escHtml(p.size)}</span>` : ''}
        </td>
        <td class="td-center">${p.quantity}</td>
        ${showPrice ? `
          <td class="td-right">${formatBDT(p.unitPrice)}</td>
          <td class="td-right fw-bold">${formatBDT(p.totalPrice)}</td>
        ` : ''}
      </tr>
    `).join('');

    const paymentBadgeStyle = isPaid
      ? `background:${colorMode === 'color' ? '#dcfce7' : '#e5e5e5'};color:${greenText};border:1px solid ${colorMode === 'color' ? '#86efac' : '#999'}`
      : `background:${colorMode === 'color' ? '#fef9c3' : '#f0f0f0'};color:${colorMode === 'color' ? '#854d0e' : '#444'};border:1px solid ${colorMode === 'color' ? '#fde047' : '#aaa'}`;

    const statusBadgeStyle = (() => {
      const s = String(order.status || '').toLowerCase();
      if (['confirmed', 'completed', 'delivered'].includes(s)) {
        return `background:${colorMode==='color'?'#dcfce7':'#e5e5e5'};color:${greenText}`;
      }
      if (['cancelled', 'returned', 'failed'].includes(s)) {
        return `background:${colorMode==='color'?'#fee2e2':'#eee'};color:${redText}`;
      }
      return `background:${accentBg};color:${accent}`;
    })();

    return `
      <div class="invoice-page">
        <!-- HEADER -->
        <div class="inv-header">
          <div class="inv-brand">
            ${showLogo ? `
              <div class="inv-logo-circle" style="background:${accent}">
                ${companyName.charAt(0).toUpperCase()}
              </div>
            ` : ''}
            <div class="inv-brand-text">
              <div class="inv-company-name">${escHtml(companyName)}</div>
              ${companyPhone    ? `<div class="inv-company-sub">📞 ${escHtml(companyPhone)}</div>` : ''}
              ${companyAddress  ? `<div class="inv-company-sub">📍 ${escHtml(companyAddress)}</div>` : ''}
            </div>
          </div>
          <div class="inv-meta">
            <div class="inv-invoice-label">INVOICE</div>
            <div class="inv-invoice-num">#${String(order.id || '').replace('ORD-', '')}</div>
            <div class="inv-date">Date: ${formatDate(order.created_at)}</div>
            <div class="inv-date">Time: ${new Date(order.created_at || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</div>
          </div>
        </div>

        <div class="inv-divider" style="background:${accent}"></div>

        <!-- CUSTOMER + STATUS ROW -->
        <div class="inv-info-grid">
          <div class="inv-info-box">
            <div class="inv-info-title">BILL TO</div>
            <div class="inv-customer-name">${escHtml(order.customer_name || 'N/A')}</div>
            <div class="inv-info-row">📞 ${escHtml(order.phone || 'N/A')}</div>
            <div class="inv-info-row">📍 ${escHtml(order.address || 'N/A')}</div>
            ${order.shipping_zone ? `<div class="inv-info-row zone-badge" style="color:${accent}">🚚 ${escHtml(String(order.shipping_zone).replace(/\s*\([^)]*\d[^)]*\)\s*/g, '').trim())}</div>` : ''}
          </div>
          <div class="inv-info-box inv-status-box">
            <div class="inv-info-title">ORDER STATUS</div>
            <div class="status-badge" style="${statusBadgeStyle}">${escHtml(order.status || 'Pending')}</div>
            <div class="inv-info-title" style="margin-top:10px">PAYMENT</div>
            <div class="status-badge" style="${paymentBadgeStyle}">${escHtml(order.payment_status || 'Pending')}</div>
            ${order.source ? `
              <div class="inv-info-title" style="margin-top:10px">SOURCE</div>
              <div class="inv-source">${escHtml(order.source)}</div>
            ` : ''}
          </div>
        </div>

        <!-- PRODUCT TABLE -->
        <table class="inv-table">
          <thead>
            <tr>
              <th class="th-num">#</th>
              <th>Product</th>
              <th class="th-center">Qty</th>
              ${showPrice ? `
                <th class="th-right">Unit Price</th>
                <th class="th-right">Total</th>
              ` : ''}
            </tr>
          </thead>
          <tbody>
            ${productRows}
          </tbody>
        </table>

        <!-- TOTALS -->
        ${showPrice ? `
          <div class="inv-totals">
            <div class="inv-total-row">
              <span>Subtotal</span>
              <span>${formatBDT(subtotal)}</span>
            </div>
            <div class="inv-total-row">
              <span>Delivery Charge</span>
              <span>${formatBDT(deliveryCharge)}</span>
            </div>
            <div class="inv-total-row grand" style="color:${accent};border-top:2px solid ${accent}">
              <span>GRAND TOTAL</span>
              <span>${formatBDT(grandTotal)}</span>
            </div>
          </div>
        ` : ''}

        <!-- NOTES -->
        ${order.notes ? `
          <div class="inv-notes">
            <div class="inv-notes-title">Order Note</div>
            <div class="inv-notes-body">${escHtml(order.notes)}</div>
          </div>
        ` : ''}

        <!-- FOOTER -->
        <div class="inv-footer">
          <div class="inv-footer-thanks">Thank you for your order! 🎉</div>
          ${companyTagline ? `<div class="inv-footer-tag">${escHtml(companyTagline)}</div>` : ''}
          <div class="inv-footer-id">Order ID: ${escHtml(order.id || '')}</div>
        </div>
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice Print</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: white; }

    @page { size: A4; margin: 12mm 15mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-page { page-break-after: always; }
      .invoice-page:last-child { page-break-after: avoid; }
    }

    .invoice-page { max-width: 720px; margin: 0 auto; padding: 20px 0 30px; min-height: 100vh; display: flex; flex-direction: column; }

    /* Header */
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .inv-brand { display: flex; align-items: center; gap: 12px; }
    .inv-logo-circle { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: white; flex-shrink: 0; }
    .inv-company-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .inv-company-sub { font-size: 11px; color: #555; margin-top: 2px; }
    .inv-meta { text-align: right; }
    .inv-invoice-label { font-size: 11px; font-weight: 700; letter-spacing: 2px; color: #666; text-transform: uppercase; }
    .inv-invoice-num { font-size: 24px; font-weight: 900; letter-spacing: -1px; color: ${accent}; }
    .inv-date { font-size: 11px; color: #555; margin-top: 2px; }

    /* Divider */
    .inv-divider { height: 3px; border-radius: 2px; margin-bottom: 16px; }

    /* Info Grid */
    .inv-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
    .inv-info-box { padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 8px; background: ${accentBg}; }
    .inv-info-title { font-size: 9px; font-weight: 800; letter-spacing: 1.5px; color: #888; text-transform: uppercase; margin-bottom: 6px; }
    .inv-customer-name { font-size: 15px; font-weight: 800; margin-bottom: 4px; }
    .inv-info-row { font-size: 11.5px; color: #444; margin-bottom: 3px; line-height: 1.5; }
    .zone-badge { font-weight: 600; font-size: 11px; }
    .inv-status-box { display: flex; flex-direction: column; }
    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; margin-top: 4px; }
    .inv-source { font-size: 12px; font-weight: 600; color: #555; margin-top: 4px; }

    /* Table */
    .inv-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .inv-table thead tr { background: ${accent}; color: white; }
    .inv-table th { padding: 8px 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .inv-table tbody tr { border-bottom: 1px solid #f3f4f6; }
    .inv-table tbody tr:nth-child(even) { background: ${accentBg}; }
    .inv-table td { padding: 9px 10px; font-size: 12.5px; vertical-align: middle; }
    .td-num  { width: 30px; color: #999; font-size: 11px; }
    .td-name { }
    .td-center { text-align: center; width: 50px; }
    .td-right  { text-align: right; width: 100px; }
    .th-num    { width: 30px; }
    .th-center { text-align: center; width: 50px; }
    .th-right  { text-align: right; width: 100px; }
    .fw-bold   { font-weight: 700; }
    .size-badge { display: inline-block; background: rgba(99,102,241,0.1); color: ${accent}; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 5px; vertical-align: middle; }

    /* Totals */
    .inv-totals { width: 240px; margin-left: auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 14px; }
    .inv-total-row { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 12.5px; }
    .inv-total-row:not(:last-child) { border-bottom: 1px solid #f3f4f6; }
    .inv-total-row.grand { font-size: 14px; font-weight: 800; padding: 10px 12px; margin-top: 0; }

    /* Notes */
    .inv-notes { padding: 10px 14px; border: 1px solid #fde68a; border-radius: 8px; background: #fffbeb; margin-bottom: 14px; }
    .inv-notes-title { font-size: 9px; font-weight: 800; letter-spacing: 1px; color: #92400e; text-transform: uppercase; margin-bottom: 4px; }
    .inv-notes-body { font-size: 11.5px; color: #78350f; line-height: 1.5; }

    /* Footer */
    .inv-footer { margin-top: auto; padding-top: 16px; border-top: 1px dashed #e5e7eb; text-align: center; }
    .inv-footer-thanks { font-size: 14px; font-weight: 700; color: ${accent}; margin-bottom: 4px; }
    .inv-footer-tag { font-size: 11px; color: #888; margin-bottom: 6px; }
    .inv-footer-id { font-size: 9px; color: #bbb; font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  ${pages.join('\n')}
</body>
</html>`;
};

// ─── Thermal Label HTML Builder ────────────────────────────────────────────
/**
 * Build a self-contained thermal label HTML string.
 * Optimized for 80mm thermal printers (standard courier label).
 *
 * @param {Object[]} orders
 * @param {Object}   settings
 * @param {string}   settings.paperSize - '80mm' | '100mm'
 * @param {boolean}  settings.showPrice
 * @param {boolean}  settings.showLogo
 * @param {string}   settings.companyName
 * @returns {string}
 */
export const buildThermalHTML = (orders, settings = {}) => {
  const {
    paperSize   = '80mm',
    showPrice   = true,
    showLogo    = true,
    companyName = 'OrderFlow',
  } = settings;

  const width = paperSize === '100mm' ? '96mm' : '76mm';

  const labels = orders.map((order, idx) => {
    const products       = extractProductDetails(order);
    const deliveryCharge = resolveDeliveryCharge(order);
    const grandTotal     = Number(order.amount || 0);
    const productSummary = products
      .map(p => `${p.name}${p.size ? ` (${p.size})` : ''} × ${p.quantity}`)
      .join(', ');

    const shortId = String(order.id || '').replace('ORD-', '');

    return `
      <div class="label-page">
        <!-- TOP HEADER -->
        <div class="lbl-header">
          ${showLogo ? `<div class="lbl-brand">${escHtml(companyName.toUpperCase())}</div>` : ''}
          <div class="lbl-courier">${escHtml(order.courier_name || 'COURIER')}</div>
        </div>

        <!-- ORDER ID BAR -->
        <div class="lbl-orderid-bar">
          <div class="lbl-orderid-label">ORDER ID</div>
          <div class="lbl-orderid">${escHtml(shortId)}</div>
        </div>

        <!-- RECIPIENT -->
        <div class="lbl-section">
          <div class="lbl-section-title">▌ DELIVER TO</div>
          <div class="lbl-customer-name">${escHtml((order.customer_name || '').toUpperCase())}</div>
          <div class="lbl-phone">${escHtml(order.phone || 'N/A')}</div>
          <div class="lbl-address">${escHtml(order.address || 'N/A')}</div>
          ${order.shipping_zone ? `<div class="lbl-zone">${escHtml(String(order.shipping_zone).replace(/\s*\([^)]*\d[^)]*\)\s*/g, '').trim())}</div>` : ''}
        </div>

        <!-- PRODUCTS -->
        <div class="lbl-section">
          <div class="lbl-section-title">▌ ORDER CONTENTS</div>
          <div class="lbl-products">${escHtml(productSummary)}</div>
        </div>

        <!-- AMOUNT + PAYMENT -->
        ${showPrice ? `
          <div class="lbl-amount-row">
            <div class="lbl-amount-label">COD AMOUNT</div>
            <div class="lbl-amount">৳${Number(grandTotal).toLocaleString()}</div>
          </div>
          ${deliveryCharge > 0 ? `
            <div class="lbl-dc">Delivery: ৳${deliveryCharge.toLocaleString()}</div>
          ` : ''}
        ` : ''}

        <!-- STATUS + DATE -->
        <div class="lbl-footer-row">
          <div class="lbl-status">${escHtml(order.status || '')}</div>
          <div class="lbl-date">${formatDate(order.created_at)}</div>
        </div>

        <!-- CUT LINE -->
        <div class="cut-line">✂ ─────────────────────────────── ✂</div>
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Label Print</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', 'Consolas', monospace; background: white; color: #000; }

    @page { size: ${paperSize} auto; margin: 2mm 3mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .label-page { page-break-after: always; }
      .label-page:last-child { page-break-after: avoid; }
    }

    .label-page { width: ${width}; margin: 0 auto; padding: 6px 4px 4px; border-bottom: 2px dashed #000; }

    /* Header */
    .lbl-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 5px; }
    .lbl-brand { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
    .lbl-courier { border: 2px solid #000; padding: 2px 6px; font-size: 10px; font-weight: 900; text-transform: uppercase; }

    /* Order ID */
    .lbl-orderid-bar { background: #000; color: #fff; padding: 4px 8px; margin-bottom: 6px; display: flex; align-items: baseline; gap: 8px; }
    .lbl-orderid-label { font-size: 8px; font-weight: 700; letter-spacing: 1px; opacity: 0.75; }
    .lbl-orderid { font-size: 18px; font-weight: 900; letter-spacing: 2px; }

    /* Section */
    .lbl-section { margin-bottom: 6px; }
    .lbl-section-title { font-size: 8px; font-weight: 900; letter-spacing: 1px; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; }
    .lbl-customer-name { font-size: 18px; font-weight: 900; line-height: 1.2; text-transform: uppercase; }
    .lbl-phone { font-size: 14px; font-weight: 800; margin: 3px 0; letter-spacing: 1px; }
    .lbl-address { font-size: 11px; font-weight: 700; line-height: 1.4; }
    .lbl-zone { font-size: 10px; font-weight: 700; color: #333; margin-top: 2px; }
    .lbl-products { font-size: 11px; font-weight: 700; line-height: 1.5; }

    /* Amount */
    .lbl-amount-row { display: flex; justify-content: space-between; align-items: baseline; background: #f0f0f0; padding: 5px 8px; margin-bottom: 3px; border: 1px solid #000; }
    .lbl-amount-label { font-size: 9px; font-weight: 800; letter-spacing: 1px; }
    .lbl-amount { font-size: 22px; font-weight: 900; }
    .lbl-dc { font-size: 9px; color: #555; font-weight: 700; text-align: right; margin-bottom: 4px; }

    /* Footer row */
    .lbl-footer-row { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ccc; padding-top: 4px; margin-top: 4px; }
    .lbl-status { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #555; }
    .lbl-date { font-size: 9px; color: #777; }

    /* Cut line */
    .cut-line { font-size: 8px; color: #bbb; text-align: center; margin-top: 4px; letter-spacing: 0; }
  </style>
</head>
<body>
  ${labels.join('\n')}
</body>
</html>`;
};

// ─── HTML Escape ──────────────────────────────────────────────────────────
/**
 * Escape special HTML characters to prevent XSS in print templates.
 * @param {string} str
 * @returns {string}
 */
export const escHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// ─── Print Window Opener ──────────────────────────────────────────────────
/**
 * Open a new browser window, inject HTML, and trigger print dialog.
 * Uses a fresh window so app styles don't bleed into print output.
 *
 * @param {string} html - Complete HTML document string
 * @param {string} title - Window title for print dialog
 * @returns {boolean} true if window was successfully opened
 */
export const openPrintWindow = (html, title = 'Print') => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Pop-up blocked! Please allow pop-ups for this site to print.');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;

  // Wait for fonts/images to load before printing
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
      // Auto-close after print (optional, some browsers block this)
      win.onafterprint = () => win.close();
    }, 250);
  };
  return true;
};

// ─── Main Print Entry Point ───────────────────────────────────────────────
/**
 * High-level function: build HTML and open print window.
 *
 * @param {Object[]} orders     - Array of order objects to print
 * @param {string}   template   - 'a4-invoice' | 'thermal-label'
 * @param {Object}   settings   - Print settings
 */
export const printOrders = (orders, template, settings = {}) => {
  if (!orders || orders.length === 0) {
    alert('No orders to print.');
    return;
  }

  let html = '';
  const title = template === 'thermal-label'
    ? `Thermal Labels — ${orders.length} Order(s)`
    : `Invoice — ${orders.length} Order(s)`;

  if (template === 'thermal-label') {
    html = buildThermalHTML(orders, settings);
  } else {
    html = buildA4HTML(orders, settings);
  }

  openPrintWindow(html, title);
};
