import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Filter, RotateCcw, Check, CheckCircle2, AlertTriangle, XCircle, Package } from 'lucide-react';
import { Button } from '../../components/Button';

export const InventoryFilterSheet = ({
  isOpen,
  onClose,
  categories = [],
  selectedCategory,
  onSelectCategory,
  stockStatusFilter,
  onSelectStockStatus,
  serialOnlyFilter,
  onToggleSerialOnly,
  onResetFilters,
  totalMatching
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="sheet-backdrop"
      />

      {/* Sheet Container */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="bottom-sheet"
      >
        <div className="bottom-sheet-handle" />

        <div className="bottom-sheet-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={18} className="text-accent" />
            <h3 className="bottom-sheet-title">Filter Products</h3>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close filters"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bottom-sheet-body">
          {/* Stock Health Section */}
          <div className="sheet-section">
            <span className="sheet-section-title">Stock Health</span>
            <div className="sheet-options-grid">
              <button
                type="button"
                className={`sheet-option-pill ${stockStatusFilter === 'all' ? 'active' : ''}`}
                onClick={() => onSelectStockStatus('all')}
              >
                All Statuses
              </button>
              <button
                type="button"
                className={`sheet-option-pill ${stockStatusFilter === 'in_stock' ? 'active' : ''}`}
                onClick={() => onSelectStockStatus('in_stock')}
              >
                In Stock (Healthy)
              </button>
              <button
                type="button"
                className={`sheet-option-pill ${stockStatusFilter === 'low_stock' ? 'active' : ''}`}
                onClick={() => onSelectStockStatus('low_stock')}
              >
                Low Stock (Alert)
              </button>
              <button
                type="button"
                className={`sheet-option-pill ${stockStatusFilter === 'out_of_stock' ? 'active' : ''}`}
                onClick={() => onSelectStockStatus('out_of_stock')}
              >
                Out of Stock
              </button>
            </div>
          </div>

          {/* Category Section */}
          <div className="sheet-section">
            <span className="sheet-section-title">Product Category</span>
            <div className="sheet-options-grid">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`sheet-option-pill ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => onSelectCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Serial Tracking Toggle */}
          <div className="sheet-section">
            <span className="sheet-section-title">Tracking Type</span>
            <label className="sheet-toggle-row">
              <span>Show Serial-Tracked Only</span>
              <input
                type="checkbox"
                checked={serialOnlyFilter}
                onChange={(e) => onToggleSerialOnly(e.target.checked)}
                className="mobile-inv-checkbox"
              />
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bottom-sheet-footer">
          <Button
            variant="ghost"
            type="button"
            onClick={onResetFilters}
          >
            <RotateCcw size={15} /> Reset
          </Button>

          <Button
            variant="primary"
            type="button"
            onClick={onClose}
          >
            Show {totalMatching !== undefined ? `${totalMatching} Products` : 'Results'}
          </Button>
        </div>
      </motion.div>
    </>
  );
};
