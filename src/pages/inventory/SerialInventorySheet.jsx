import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Tag, Plus, Loader2, Check } from 'lucide-react';
import { Button } from '../../components/Button';

export const SerialInventorySheet = ({
  isOpen,
  onClose,
  toyBoxes = [],
  toyBoxGroups = {},
  onOpenAddModal,
  onUpdateStock
}) => {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('All');
  const [updatingId, setUpdatingId] = useState(null);

  const productNames = useMemo(() => {
    return ['All', ...Object.keys(toyBoxGroups).sort((a, b) => a.localeCompare(b))];
  }, [toyBoxGroups]);

  const filteredSerials = useMemo(() => {
    return toyBoxes.filter(box => {
      const matchesProduct = selectedProduct === 'All' || box.product_name === selectedProduct;
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        String(box.toy_box_number).includes(q) ||
        (box.product_name || '').toLowerCase().includes(q);
      return matchesProduct && matchesSearch;
    }).sort((a, b) => {
      if (a.product_name !== b.product_name) {
        return (a.product_name || '').localeCompare(b.product_name || '');
      }
      return Number(a.toy_box_number) - Number(b.toy_box_number);
    });
  }, [toyBoxes, selectedProduct, search]);

  if (!isOpen) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="sheet-backdrop"
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="serial-inventory-sheet"
      >
        <div className="bottom-sheet-handle" />

        <div className="serial-sheet-header">
          <div className="serial-sheet-title-wrap">
            <div className="serial-sheet-icon">
              <Tag size={18} className="text-accent" />
            </div>
            <div>
              <h2 className="serial-sheet-title">Serial Inventory</h2>
              <span className="serial-sheet-subtitle">{toyBoxes.length} tracked serial units</span>
            </div>
          </div>

          <div className="serial-sheet-header-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onClose();
                onOpenAddModal();
              }}
              className="serial-sheet-add-btn"
            >
              <Plus size={14} /> Add Serials
            </Button>
            <button type="button" onClick={onClose} className="drawer-close-btn">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="serial-sheet-toolbar">
          <div className="serial-search-box">
            <Search size={15} className="serial-search-icon" />
            <input
              type="text"
              placeholder="Search serial number or product..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="serial-search-input"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="serial-search-clear"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {productNames.length > 2 && (
            <div className="serial-product-tabs">
              {productNames.map(pName => (
                <button
                  key={pName}
                  type="button"
                  className={`serial-tab-pill ${selectedProduct === pName ? 'active' : ''}`}
                  onClick={() => setSelectedProduct(pName)}
                >
                  {pName}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Serials List */}
        <div className="serial-sheet-body">
          {filteredSerials.length > 0 ? (
            <div className="serial-list-container">
              {filteredSerials.map((box) => {
                const stockQty = Number(box.stock_quantity) || 0;
                const isOutOfStock = stockQty === 0;
                const isLow = stockQty <= 5 && !isOutOfStock;

                return (
                  <div
                    key={box.id}
                    className={`serial-row-item ${isOutOfStock ? 'out-of-stock' : isLow ? 'low-stock' : ''}`}
                  >
                    <div className="serial-row-left">
                      <span className="serial-num-tag">#{box.toy_box_number}</span>
                      <span className="serial-row-prod-name">{box.product_name || 'Toy Box'}</span>
                    </div>

                    <div className="serial-row-right">
                      <div className="serial-qty-input-wrap">
                        <input
                          type="number"
                          min="0"
                          defaultValue={box.stock_quantity ?? 0}
                          key={`${box.id}-${box.stock_quantity}`}
                          onBlur={async (e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!Number.isNaN(val) && val !== box.stock_quantity) {
                              setUpdatingId(box.id);
                              try {
                                await onUpdateStock(box.id, val);
                              } finally {
                                setUpdatingId(null);
                              }
                            }
                          }}
                          className="serial-direct-input"
                        />
                        <span className="serial-pcs-label">pcs</span>
                        {updatingId === box.id && (
                          <Loader2 size={12} className="spin text-accent" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="serial-empty-box">
              <p>No serials found matching "{search}"</p>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
