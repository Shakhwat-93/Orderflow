import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowUpDown, Check } from 'lucide-react';
import { Button } from '../../components/Button';

export const InventorySortSheet = ({
  isOpen,
  onClose,
  currentSort,
  onSelectSort
}) => {
  if (!isOpen) return null;

  const sortOptions = [
    { id: 'name_asc', label: 'Product Name (A → Z)', desc: 'Alphabetical order' },
    { id: 'name_desc', label: 'Product Name (Z → A)', desc: 'Reverse alphabetical' },
    { id: 'stock_asc', label: 'Stock: Low → High', desc: 'Prioritize out of stock & low stock' },
    { id: 'stock_desc', label: 'Stock: High → Low', desc: 'Most stocked items first' },
    { id: 'price_desc', label: 'Price: High → Low', desc: 'Highest value products' },
    { id: 'price_asc', label: 'Price: Low → High', desc: 'Lowest price first' },
    { id: 'margin_desc', label: 'Profit Margin: High → Low', desc: 'Highest gross margin %' }
  ];

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
            <ArrowUpDown size={18} className="text-accent" />
            <h3 className="bottom-sheet-title">Sort Products</h3>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close sort sheet"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bottom-sheet-body" style={{ padding: '8px 16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {sortOptions.map((opt) => {
              const isActive = currentSort === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  className={`sheet-option-pill ${isActive ? 'active' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px' }}
                  onClick={() => {
                    onSelectSort(opt.id);
                    onClose();
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{opt.label}</span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{opt.desc}</span>
                  </div>
                  {isActive && <Check size={16} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>
  );
};
