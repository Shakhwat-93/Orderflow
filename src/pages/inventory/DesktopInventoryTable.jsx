import React from 'react';
import { Package, Plus, Minus, Edit2, Trash2, TrendingUp, TrendingDown, Check, Loader2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import CurrencyIcon from '../../components/CurrencyIcon';
import { Badge } from '../../components/Badge';

export const DesktopInventoryTable = ({
  items,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onSelectProduct,
  onOpenProductModal,
  onOpenAdjustModal,
  onDeleteProduct,
  onQuickAdjust,
  adjustingIds = new Set()
}) => {
  const isAllSelected = items.length > 0 && selectedIds.size === items.length;
  const isPartiallySelected = selectedIds.size > 0 && selectedIds.size < items.length;

  return (
    <div className="desktop-inv-table-card">
      <div className="desktop-table-scroll-wrap">
        <table className="desktop-inv-table">
          <thead>
            <tr>
              <th className="table-col-checkbox">
                <input
                  type="checkbox"
                  className="table-checkbox"
                  checked={isAllSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = isPartiallySelected;
                  }}
                  onChange={onSelectAll}
                  aria-label="Select all products"
                />
              </th>
              <th>Product Details</th>
              <th>Category</th>
              <th className="text-right">Price</th>
              <th className="text-right">Cost</th>
              <th className="text-right">Margin</th>
              <th>Stock Health</th>
              <th>Quick Adjust</th>
              <th>Status</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const isSelected = selectedIds.has(item.id);
              const isAdjusting = adjustingIds.has(item.id);
              const stock = Number(item.current_stock) || 0;
              const minStock = Number(item.min_stock_level) || 5;
              const sellingPrice = Number(item.selling_price) || Number(item.unit_price) || 0;
              const makingCost = Number(item.making_cost) || 0;
              const marginPct = sellingPrice > 0 ? ((sellingPrice - makingCost) / sellingPrice * 100) : 0;
              const isProfit = marginPct >= 0;

              const stockStatus = stock === 0 ? 'Out of Stock' : stock <= minStock ? 'Low Stock' : 'In Stock';
              const statusVariant = stock === 0 ? 'danger' : stock <= minStock ? 'warning' : 'success';

              // Visual bar calculation
              const maxRef = Math.max(minStock * 3, stock, 10);
              const stockPercent = Math.min((stock / maxRef) * 100, 100);

              const rowClasses = [
                'desktop-inv-row',
                isSelected ? 'is-selected' : ''
              ].filter(Boolean).join(' ');

              return (
                <tr
                  key={item.id}
                  className={rowClasses}
                  onClick={() => onSelectProduct(item)}
                >
                  {/* Selection Checkbox */}
                  <td className="table-col-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="table-checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(item.id)}
                      aria-label={`Select ${item.name}`}
                    />
                  </td>

                  {/* Product Details */}
                  <td>
                    <div className="table-product-cell">
                      <div className="table-prod-icon-box">
                        <Package size={18} />
                      </div>
                      <div className="table-prod-info">
                        <span className="table-prod-name">{item.name}</span>
                        <span className="table-prod-sku">SKU: {item.sku || 'N/A'}</span>
                      </div>
                    </div>
                  </td>

                  {/* Category */}
                  <td>
                    <span className="table-category-pill">{item.category || 'Other'}</span>
                  </td>

                  {/* Customer Price */}
                  <td className="text-right table-price-cell">
                    ৳{sellingPrice.toLocaleString('en-BD')}
                  </td>

                  {/* Making / Cost */}
                  <td className="text-right table-cost-cell">
                    {makingCost > 0 ? `৳${makingCost.toLocaleString('en-BD')}` : '—'}
                  </td>

                  {/* Profit Margin */}
                  <td className="text-right">
                    {sellingPrice > 0 ? (
                      <span className={`table-margin-badge ${isProfit ? 'green' : 'red'}`}>
                        {isProfit ? '+' : ''}{marginPct.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>

                  {/* Stock Level & Visual Bar */}
                  <td className="table-stock-cell">
                    <div className="table-stock-info">
                      <span className="table-stock-number">{stock}</span>
                      <span className="table-stock-min">/ min {minStock}</span>
                    </div>
                    <div className="table-stock-bar-track">
                      <div
                        className={`table-stock-bar-fill ${stock === 0 ? 'out' : stock <= minStock ? 'low' : 'healthy'}`}
                        style={{ width: `${stockPercent}%` }}
                      />
                    </div>
                  </td>

                  {/* Inline Quick Stepper */}
                  <td className="table-quick-adjust-cell" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-stock-stepper" style={{ height: '32px' }}>
                      <button
                        type="button"
                        className="stepper-btn minus"
                        style={{ width: '32px', height: '32px' }}
                        disabled={stock <= 0 || isAdjusting}
                        onClick={() => onQuickAdjust(item, -1)}
                        title="Deduct 1 unit"
                      >
                        <Minus size={13} strokeWidth={2.5} />
                      </button>

                      <div className="stepper-value-box" style={{ minWidth: '32px', fontSize: '0.85rem' }}>
                        {isAdjusting ? <Loader2 size={12} className="spin text-accent" /> : stock}
                      </div>

                      <button
                        type="button"
                        className="stepper-btn plus"
                        style={{ width: '32px', height: '32px' }}
                        disabled={isAdjusting}
                        onClick={() => onQuickAdjust(item, 1)}
                        title="Add 1 unit"
                      >
                        <Plus size={13} strokeWidth={2.5} />
                      </button>
                    </div>
                  </td>

                  {/* Stock Status Badge */}
                  <td>
                    <Badge variant={statusVariant} size="sm">
                      {stockStatus}
                    </Badge>
                  </td>

                  {/* Row Actions */}
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="table-row-actions">
                      <button
                        type="button"
                        className="table-icon-btn"
                        onClick={() => onOpenProductModal(item)}
                        title="Edit product"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        type="button"
                        className="table-icon-btn danger"
                        onClick={() => onDeleteProduct(item.id)}
                        title="Delete product"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
