import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export const Modal = ({ isOpen, onClose, title, subtitle, children }) => {
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartYRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTouchStart = (event) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event) => {
    if (touchStartYRef.current == null) return;

    const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
    const nextOffset = Math.max(0, currentY - touchStartYRef.current);
    setDragOffset(nextOffset);
  };

  const handleTouchEnd = () => {
    if (dragOffset > 96) {
      onClose();
    }

    touchStartYRef.current = null;
    setDragOffset(0);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }}
      >
        <div className="modal-sheet-handle" aria-hidden="true" />
        <div className="modal-header">
          <div className="modal-header-left">
            <h2 className="modal-title">{title}</h2>
            {subtitle && <p className="modal-subtitle">{subtitle}</p>}
          </div>
          <button className="modal-close-btn" onClick={onClose} title="Close">
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};
