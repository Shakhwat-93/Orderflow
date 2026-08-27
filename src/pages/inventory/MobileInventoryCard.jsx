import React, { useState } from 'react';
import { Package, Plus, Minus, Loader2 } from 'lucide-react';

export const MobileInventoryCard = ({
  item,
  onSelectProduct,
  onQuickAdjust,
  isSelected,
  onToggleSelect,
  selectionMode,
  isAdjusting
}) => {
  const [inlineLoading, setInlineLoading] = useState(false);

  const stock = Number(item.current_stock) || 0;
  const minStock = Number(item.min_stock_level) || 5;
  const sellingPrice = Number(item.selling_price) || Number(item.unit_price) || 0;

  let stockStatus = 'IN STOCK';
  let statusVariant = 'in-stock';
  if (stock === 0) {
    stockStatus = 'OUT OF STOCK';
    statusVariant = 'out-of-stock';
  } else if (stock <= minStock) {
    stockStatus = 'LOW STOCK';
    statusVariant = 'low-stock';
  }

  const handleStep = async (e, delta) => {
    e.stopPropagation();
    if (inlineLoading || isAdjusting) return;
    if (delta < 0 && stock <= 0) return;
    
    setInlineLoading(true);
    try {
      await onQuickAdjust(item, delta);
    } finally {
      setInlineLoading(false);
    }
  };

  const cardClasses = [
    'mobile-inv-card',
    isSelected ? 'is-selected' : '',
    statusVariant
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cardClasses}
      onClick={() => {
        if (selectionMode) {
          onToggleSelect(item.id);
        } else {
          onSelectProduct(item);
        }
      }}
    >
      {/* Optional multi-select checkbox */}
      {selectionMode && (
        <div className="mobile-inv-card-select-col" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            className="mobile-inv-checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(item.id)}
          />
        </div>
      )}

      {/* Main Card Content */}
      <div className="mobile-card-content">
        {/* Top row: Icon + Title/SKU on left, Status Badge on right */}
        <div className="mobile-card-top-row">
          <div className="mobile-card-icon-title-group">
            <div className="mobile-card-prod-icon">
              <Package size={16} className="text-accent" />
            </div>
            <div className="mobile-card-title-sku">
              <h3 className="mobile-card-title">{item.name}</h3>
              <span className="mobile-card-sku">
                {item.category || 'General'} · SKU: {item.sku || 'N/A'}
                {item.supports_serial_tracking && ' · #Serial'}
              </span>
            </div>
          </div>

          <span className={`mobile-status-badge ${statusVariant}`}>
            {stockStatus}
          </span>
        </div>

        {/* Dedicated Bottom Row: Price on left, Compact Stepper on right */}
        <div className="mobile-card-bottom-row">
          <div className="mobile-card-price">
            <span className="mobile-card-currency">৳</span>
            <span className="mobile-card-price-num">{sellingPrice.toLocaleString('en-BD')}</span>
          </div>

          <div className="compact-stepper-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="compact-stepper-btn minus"
              disabled={stock <= 0 || inlineLoading || isAdjusting}
              onClick={(e) => handleStep(e, -1)}
              aria-label="Decrease stock"
            >
              <Minus size={12} strokeWidth={2.5} />
            </button>

            <span className="compact-stepper-val">
              {inlineLoading || isAdjusting ? (
                <Loader2 size={11} className="spin text-accent" />
              ) : (
                stock
              )}
            </span>

            <button
              type="button"
              className="compact-stepper-btn plus"
              disabled={inlineLoading || isAdjusting}
              onClick={(e) => handleStep(e, 1)}
              aria-label="Increase stock"
            >
              <Plus size={12} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
