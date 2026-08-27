import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Plus, Minus, Trash2, X } from 'lucide-react';

export const BulkActionBar = ({
  selectedCount,
  onClearSelection,
  onOpenBatchAdjust,
  onDeleteBatch
}) => {
  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <div className="bulk-action-bar-container">
        <motion.div
          className="bulk-action-bar"
          initial={{ y: 50, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 50, opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        >
          <div className="bulk-info-badge">
            <span className="bulk-count-pill">{selectedCount}</span>
            <span>Selected</span>
          </div>

          <div className="bulk-btn-group">
            <button
              type="button"
              className="bulk-action-btn restock"
              onClick={() => onOpenBatchAdjust('add')}
              title="Add stock to all selected items"
            >
              <Plus size={14} /> Restock
            </button>

            <button
              type="button"
              className="bulk-action-btn deduct"
              onClick={() => onOpenBatchAdjust('deduct')}
              title="Deduct stock from all selected items"
            >
              <Minus size={14} /> Deduct
            </button>

            <button
              type="button"
              className="bulk-action-btn danger"
              onClick={onDeleteBatch}
              title="Delete selected items"
            >
              <Trash2 size={14} /> Delete
            </button>

            <button
              type="button"
              className="bulk-clear-btn"
              onClick={onClearSelection}
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
