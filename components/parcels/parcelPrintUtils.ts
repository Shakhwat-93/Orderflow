/**
 * Parcel Thermal Label Print System
 * ─────────────────────────────────
 * Generates crisp 80mm / 100mm thermal shipping and parcel labels
 * with embedded vector Code 128 barcodes.
 * Works seamlessly in Chrome, Edge, and Desktop Electron.
 */

import { generateCode128Svg } from '@/utils/barcodeGenerator';
import type { ParcelRecord } from '@/types/parcels';

function escHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildParcelThermalLabelHTML(
  parcels: ParcelRecord[],
  options: {
    paperSize?: '80mm' | '100mm';
    companyName?: string;
  } = {}
): string {
  const { paperSize = '80mm', companyName = 'CANVAS ORDER' } = options;
  const widthMm = paperSize === '100mm' ? '96mm' : '76mm';

  const labelHtmls = parcels.map((parcel, idx) => {
    const barcodeSvg = generateCode128Svg(parcel.barcode, {
      width: paperSize === '100mm' ? 2.2 : 1.9,
      height: 48,
      includeText: true,
      fontSize: 11,
      margin: 4,
    });

    const itemsSummary = (parcel.items || [])
      .map((it) => `${it.product_name}${it.size ? ` (${it.size})` : ''} × ${it.quantity}`)
      .join(', ');

    return `
      <div class="parcel-label-page">
        <!-- HEADER -->
        <div class="lbl-header">
          <div class="lbl-company">${escHtml(companyName)}</div>
          <div class="lbl-badge">PARCEL LABEL</div>
        </div>

        <!-- BARCODE SECTION -->
        <div class="lbl-barcode-box">
          <div class="lbl-barcode-svg">${barcodeSvg}</div>
          <div class="lbl-parcel-id">${escHtml(parcel.parcel_id)}</div>
        </div>

        <!-- ORDER & DISPATCH DETAILS -->
        <div class="lbl-grid">
          <div class="lbl-grid-cell">
            <span class="lbl-meta-key">ORDER ID</span>
            <span class="lbl-meta-val">${escHtml(parcel.order_id || 'N/A')}</span>
          </div>
          <div class="lbl-grid-cell">
            <span class="lbl-meta-key">TOTAL QTY</span>
            <span class="lbl-meta-val">${escHtml(parcel.total_quantity)} PCS</span>
          </div>
        </div>

        <!-- RECIPIENT INFORMATION -->
        <div class="lbl-section">
          <div class="lbl-section-title">DELIVER TO</div>
          <div class="lbl-customer-name">${escHtml((parcel.customer_name || 'Valued Customer').toUpperCase())}</div>
          <div class="lbl-customer-phone">📞 ${escHtml(parcel.customer_phone || 'N/A')}</div>
          <div class="lbl-customer-addr">${escHtml(parcel.customer_address || 'Address on file')}</div>
          ${
            parcel.shipping_zone
              ? `<div class="lbl-zone-tag">${escHtml(parcel.shipping_zone)}</div>`
              : ''
          }
        </div>

        <!-- CONTENTS -->
        <div class="lbl-section">
          <div class="lbl-section-title">PARCEL CONTENTS</div>
          <div class="lbl-items-text">${escHtml(itemsSummary || 'Standard Order Items')}</div>
        </div>

        <!-- FOOTER & CUT LINE -->
        <div class="lbl-footer">
          <span>Courier: <strong>${escHtml(parcel.courier_name || 'Standard Dispatch')}</strong></span>
          <span>${new Date(parcel.created_at).toLocaleDateString('en-GB')}</span>
        </div>

        <div class="cut-line">✂ ───────────────────────────────── ✂</div>
      </div>
    `;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Parcel Labels — ${parcels.length} Package(s)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Consolas', 'Courier New', monospace;
      background: white;
      color: #000;
      margin: 0;
      padding: 0;
    }
    @page {
      size: ${paperSize} auto;
      margin: 2mm 3mm;
    }
    @media print {
      body { width: ${widthMm}; }
      .parcel-label-page { page-break-after: always; break-after: page; }
      .cut-line { display: none; }
    }
    .parcel-label-page {
      width: ${widthMm};
      max-width: 100%;
      margin: 0 auto;
      padding: 6px 4px 10px;
      border-bottom: 1.5px dashed #666;
    }
    .lbl-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #000;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .lbl-company {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .lbl-badge {
      font-size: 9px;
      font-weight: 800;
      background: #000;
      color: #fff;
      padding: 1px 5px;
      border-radius: 2px;
    }
    .lbl-barcode-box {
      text-align: center;
      margin: 4px 0 8px;
      padding: 4px;
      border: 1px solid #000;
      background: #fafafa;
    }
    .lbl-barcode-svg svg {
      display: block;
      margin: 0 auto;
      max-width: 100%;
      height: auto;
    }
    .lbl-parcel-id {
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 2px;
      margin-top: 3px;
    }
    .lbl-grid {
      display: flex;
      border: 1px solid #000;
      margin-bottom: 6px;
    }
    .lbl-grid-cell {
      flex: 1;
      padding: 4px 6px;
    }
    .lbl-grid-cell:first-child {
      border-right: 1px solid #000;
    }
    .lbl-meta-key {
      display: block;
      font-size: 8.5px;
      font-weight: 700;
      color: #333;
    }
    .lbl-meta-val {
      font-size: 12px;
      font-weight: 900;
    }
    .lbl-section {
      border: 1px solid #000;
      padding: 5px 6px;
      margin-bottom: 6px;
    }
    .lbl-section-title {
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      border-bottom: 0.5px solid #ccc;
      padding-bottom: 2px;
      margin-bottom: 3px;
    }
    .lbl-customer-name {
      font-size: 12.5px;
      font-weight: 900;
      line-height: 1.2;
    }
    .lbl-customer-phone {
      font-size: 11px;
      font-weight: 800;
      margin: 2px 0;
    }
    .lbl-customer-addr {
      font-size: 10px;
      line-height: 1.25;
      color: #111;
    }
    .lbl-zone-tag {
      display: inline-block;
      font-size: 9px;
      font-weight: 800;
      border: 1px solid #000;
      padding: 0 4px;
      margin-top: 3px;
    }
    .lbl-items-text {
      font-size: 9.5px;
      line-height: 1.3;
      font-weight: 600;
    }
    .lbl-footer {
      display: flex;
      justify-content: space-between;
      font-size: 8.5px;
      font-weight: 700;
      margin-top: 4px;
      padding: 2px 0;
    }
    .cut-line {
      font-size: 9px;
      text-align: center;
      color: #666;
      margin-top: 6px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  ${labelHtmls.join('\n')}
  <script>
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        window.print();
      }, 350);
    });
  </script>
</body>
</html>`;
}

/**
 * Trigger browser/electron thermal print for one or multiple parcels
 */
export function printParcelLabels(
  parcels: ParcelRecord[],
  options: { paperSize?: '80mm' | '100mm'; companyName?: string } = {}
) {
  if (!parcels || parcels.length === 0) return;

  const html = buildParcelThermalLabelHTML(parcels, options);
  const printWin = window.open('', '_blank', 'width=480,height=720,menubar=no,toolbar=no');
  if (!printWin) {
    alert('Please allow popups to print parcel barcode labels.');
    return;
  }

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}
