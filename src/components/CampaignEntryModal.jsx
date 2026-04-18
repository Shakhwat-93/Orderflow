import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Megaphone, ChevronDown, Check, Trash2,
  DollarSign, ShoppingBag, Eye, FileText, Upload, Plus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './CampaignEntryModal.css';

export const PLATFORMS = ['Facebook', 'Instagram', 'Google', 'TikTok', 'YouTube', 'Twitter', 'LinkedIn', 'Other'];

export const PLATFORM_COLORS = {
  Facebook:  '#1877f2',
  Instagram: '#e1306c',
  Google:    '#4285f4',
  TikTok:    '#ff0050',
  YouTube:   '#ff0000',
  Twitter:   '#1da1f2',
  LinkedIn:  '#0a66c2',
  Other:     '#6b7280',
};

const EMPTY_FORM = {
  campaign_name:   '',
  platforms:       ['Facebook'],   // ← now an ARRAY
  product_name:    '',
  spend:           '',
  orders_received: '',
  impressions:     '',
  notes:           '',
};

/**
 * Normalise platforms from initialData (supports old string or new array)
 */
const parsePlatforms = (raw) => {
  if (!raw) return ['Facebook'];
  if (Array.isArray(raw)) return raw.length ? raw : ['Facebook'];
  // comma-separated legacy string
  return raw.split(',').map(s => s.trim()).filter(Boolean);
};

/**
 * CampaignEntryModal
 * Props:
 *  isOpen        – boolean
 *  onClose       – fn
 *  onSave        – fn(formData, imageFiles) => Promise<void>
 *  initialData   – optional pre-fill for editing
 *  disabled      – boolean (locked/read-only)
 */
export const CampaignEntryModal = ({ isOpen, onClose, onSave, initialData = null, disabled = false }) => {
  const [form, setForm] = useState(initialData ? {
    campaign_name:   initialData.campaign_name   || '',
    platforms:       parsePlatforms(initialData.platforms ?? initialData.platform),
    product_name:    initialData.product_name    || '',
    spend:           initialData.spend            ?? '',
    orders_received: initialData.orders_received  ?? '',
    impressions:     initialData.impressions       ?? '',
    notes:           initialData.notes             || '',
  } : { ...EMPTY_FORM });

  const [platformOpen, setPlatformOpen]  = useState(false);
  const [images, setImages]              = useState([]);
  const [saving, setSaving]              = useState(false);
  const [errors, setErrors]              = useState({});
  const [dragging, setDragging]          = useState(false);
  const fileInputRef                     = useRef(null);

  /* ── Derived ─────────────────────────────────────────── */
  const spend  = parseFloat(form.spend)          || 0;
  const orders = parseInt(form.orders_received)  || 0;
  const cpo    = orders > 0 ? spend / orders : null;

  /* toggle a platform in/out of the selections */
  const togglePlatform = (p) => {
    setForm(f => {
      const has = f.platforms.includes(p);
      // must keep at least one
      if (has && f.platforms.length === 1) return f;
      return {
        ...f,
        platforms: has
          ? f.platforms.filter(x => x !== p)
          : [...f.platforms, p],
      };
    });
  };

  /* ── Validation ──────────────────────────────────────── */
  const validate = () => {
    const e = {};
    if (!form.campaign_name.trim())    e.campaign_name = 'Campaign title required';
    if (!form.product_name.trim())     e.product_name  = 'Product focus required';
    if (form.spend === '' || isNaN(form.spend)) e.spend = 'Valid spend amount required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Image handling ──────────────────────────────────── */
  const addImageFiles = useCallback((files) => {
    const previews = Array.from(files)
      .filter(f => f.type.startsWith('image/'))
      .map(file => ({ file, preview: URL.createObjectURL(file), url: null }));
    setImages(prev => [...prev, ...previews]);
  }, []);

  const removeImage = (i) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addImageFiles(e.dataTransfer.files);
  }, [addImageFiles]);

  /* ── Upload images ───────────────────────────────────── */
  const uploadImages = async () => {
    const urls = [];
    for (const img of images) {
      if (img.url) { urls.push(img.url); continue; }
      const ext  = img.file.name.split('.').pop();
      const path = `campaign-reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('campaign-images')
        .upload(path, img.file, { cacheControl: '3600', upsert: false });
      if (error) { console.warn('Upload failed:', error.message); continue; }
      const { data: { publicUrl } } = supabase.storage.from('campaign-images').getPublicUrl(data.path);
      urls.push(publicUrl);
    }
    return urls;
  };

  /* ── Save ────────────────────────────────────────────── */
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let imageUrls = [];
      try { imageUrls = await uploadImages(); } catch {}

      await onSave({
        ...form,
        // keep backward-compat: also send comma-joined string as `platform`
        platform:        form.platforms.join(', '),
        spend:           parseFloat(form.spend)         || 0,
        orders_received: parseInt(form.orders_received) || 0,
        impressions:     parseInt(form.impressions)     || 0,
        image_urls:      imageUrls,
      }, images.map(i => i.file));

      onClose();
    } catch (err) {
      console.error('CampaignEntryModal save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setErrors({});
    setPlatformOpen(false);
    setDragging(false);
    onClose();
  };

  if (!isOpen) return null;

  /* ── Render ──────────────────────────────────────────── */
  const selectedCount = form.platforms.length;

  const modal = (
    <div className="cem-overlay" onClick={handleClose}>
      <motion.div
        className="cem-sheet"
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >

        {/* ── Header ── */}
        <div className="cem-header">
          <div className="cem-header-left">
            <div className="cem-header-icon">
              <Megaphone size={20} />
            </div>
            <div>
              <h2 className="cem-title">{initialData ? 'Edit Campaign' : 'New Campaign Entry'}</h2>
              <p className="cem-subtitle">Log detailed performance data for this campaign</p>
            </div>
          </div>
          <button className="cem-close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="cem-body">

          {/* ── Section 1: Identity ── */}
          <div className="cem-section">
            <div className="cem-section-label">
              <span className="cem-kicker">Campaign Identity</span>
            </div>

            {/* Title */}
            <div className="cem-field-group">
              <label className="cem-label">Campaign Title <span className="cem-req">*</span></label>
              <input
                className={`cem-input ${errors.campaign_name ? 'error' : ''}`}
                placeholder="e.g. Summer Sale — Multi-Platform Push"
                value={form.campaign_name}
                onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))}
                disabled={disabled}
              />
              {errors.campaign_name && <p className="cem-error">{errors.campaign_name}</p>}
            </div>

            <div className="cem-row-2">
              {/* ── Multi-Platform Selector ── */}
              <div className="cem-field-group">
                <label className="cem-label">
                  Platforms
                  <span className="cem-badge-count">{selectedCount} selected</span>
                </label>

                <div className="cem-platform-wrap">
                  {/* Trigger Button */}
                  <button
                    type="button"
                    className={`cem-platform-btn multi ${platformOpen ? 'open' : ''}`}
                    onClick={() => !disabled && setPlatformOpen(p => !p)}
                    disabled={disabled}
                  >
                    <div className="cem-platform-pills-preview">
                      {form.platforms.slice(0, 3).map(p => (
                        <span
                          key={p}
                          className="cem-mini-pill"
                          style={{ background: `${PLATFORM_COLORS[p]}18`, color: PLATFORM_COLORS[p], borderColor: `${PLATFORM_COLORS[p]}30` }}
                        >
                          <span className="cem-platform-dot-sm" style={{ background: PLATFORM_COLORS[p] }} />
                          {p}
                        </span>
                      ))}
                      {selectedCount > 3 && (
                        <span className="cem-mini-pill more">+{selectedCount - 3}</span>
                      )}
                    </div>
                    <ChevronDown size={14} className={`cem-chevron ${platformOpen ? 'open' : ''}`} />
                  </button>

                  {/* Dropdown — stays open for multi-select */}
                  <AnimatePresence>
                    {platformOpen && (
                      <>
                        {/* backdrop to close */}
                        <div
                          className="cem-dropdown-backdrop"
                          onClick={() => setPlatformOpen(false)}
                        />
                        <motion.div
                          className="cem-platform-dropdown"
                          initial={{ opacity: 0, y: 6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.97 }}
                          transition={{ duration: 0.14 }}
                        >
                          <p className="cem-dropdown-hint">Select all platforms this ad ran on</p>
                          {PLATFORMS.map(p => {
                            const isSelected = form.platforms.includes(p);
                            const color      = PLATFORM_COLORS[p];
                            return (
                              <button
                                key={p}
                                type="button"
                                className={`cem-platform-opt multi ${isSelected ? 'active' : ''}`}
                                onClick={() => togglePlatform(p)}
                              >
                                {/* Checkbox */}
                                <span
                                  className={`cem-checkbox ${isSelected ? 'checked' : ''}`}
                                  style={isSelected ? { background: color, borderColor: color } : {}}
                                >
                                  {isSelected && <Check size={10} />}
                                </span>
                                {/* Dot + name */}
                                <span className="cem-platform-dot" style={{ background: color }} />
                                <span className="cem-opt-name">{p}</span>
                                {/* Color swatch pill */}
                                {isSelected && (
                                  <span
                                    className="cem-opt-selected-badge"
                                    style={{ background: `${color}18`, color }}
                                  >
                                    Running
                                  </span>
                                )}
                              </button>
                            );
                          })}

                          {/* Done button inside dropdown */}
                          <button
                            type="button"
                            className="cem-dropdown-done"
                            onClick={() => setPlatformOpen(false)}
                          >
                            <Check size={14} />
                            Done ({selectedCount} platform{selectedCount > 1 ? 's' : ''})
                          </button>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>

                {/* Selected platforms displayed below as removable pills */}
                {form.platforms.length > 0 && (
                  <div className="cem-selected-platforms-row">
                    {form.platforms.map(p => (
                      <span
                        key={p}
                        className="cem-selected-pill"
                        style={{
                          background: `${PLATFORM_COLORS[p]}12`,
                          color: PLATFORM_COLORS[p],
                          borderColor: `${PLATFORM_COLORS[p]}25`,
                        }}
                      >
                        <span className="cem-platform-dot-sm" style={{ background: PLATFORM_COLORS[p] }} />
                        {p}
                        {!disabled && (
                          <button
                            type="button"
                            className="cem-pill-remove"
                            onClick={() => togglePlatform(p)}
                            title={`Remove ${p}`}
                          >
                            <X size={10} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Product Focus */}
              <div className="cem-field-group">
                <label className="cem-label">Product Focus <span className="cem-req">*</span></label>
                <input
                  className={`cem-input ${errors.product_name ? 'error' : ''}`}
                  placeholder="e.g. Toy Box Combo, Organizer"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  disabled={disabled}
                />
                {errors.product_name && <p className="cem-error">{errors.product_name}</p>}
              </div>
            </div>
          </div>

          {/* ── Section 2: Metrics ── */}
          <div className="cem-section">
            <div className="cem-section-label">
              <span className="cem-kicker">Performance Metrics</span>
            </div>

            <div className="cem-row-3">
              <div className="cem-field-group">
                <label className="cem-label">
                  <DollarSign size={13} className="cem-label-icon" />
                  Ad Spend <span className="cem-req">*</span>
                </label>
                <div className="cem-input-prefix-wrap">
                  <span className="cem-input-prefix">$</span>
                  <input
                    className={`cem-input prefix ${errors.spend ? 'error' : ''}`}
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.spend}
                    onChange={e => setForm(f => ({ ...f, spend: e.target.value }))}
                    disabled={disabled}
                  />
                </div>
                {errors.spend && <p className="cem-error">{errors.spend}</p>}
              </div>

              <div className="cem-field-group">
                <label className="cem-label">
                  <ShoppingBag size={13} className="cem-label-icon" />
                  Orders Generated
                </label>
                <input
                  className="cem-input"
                  type="number" min="0" placeholder="0"
                  value={form.orders_received}
                  onChange={e => setForm(f => ({ ...f, orders_received: e.target.value }))}
                  disabled={disabled}
                />
              </div>

              <div className="cem-field-group">
                <label className="cem-label">
                  <Eye size={13} className="cem-label-icon" />
                  Reach / Impressions
                </label>
                <input
                  className="cem-input"
                  type="number" min="0" placeholder="0"
                  value={form.impressions}
                  onChange={e => setForm(f => ({ ...f, impressions: e.target.value }))}
                  disabled={disabled}
                />
              </div>
            </div>

            {cpo !== null && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="cem-cpo-preview"
              >
                <div className="cem-cpo-badge">
                  <span className="cem-cpo-label">Auto CPO</span>
                  <span className="cem-cpo-value">${cpo.toFixed(2)}</span>
                </div>
                <p className="cem-cpo-hint">Cost per order = spend ÷ orders (across all platforms)</p>
              </motion.div>
            )}
          </div>

          {/* ── Section 3: Notes ── */}
          <div className="cem-section">
            <div className="cem-section-label">
              <span className="cem-kicker">Strategic Notes</span>
            </div>
            <div className="cem-field-group">
              <label className="cem-label">
                <FileText size={13} className="cem-label-icon" />
                Campaign Notes &amp; Observations
              </label>
              <textarea
                className="cem-textarea"
                placeholder="Describe targeting strategy, anomalies, or key insights..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
                disabled={disabled}
              />
            </div>
          </div>

          {/* ── Section 4: Image Attachments ── */}
          {!disabled && (
            <div className="cem-section">
              <div className="cem-section-label">
                <span className="cem-kicker">Report Attachments</span>
              </div>

              <div
                className={`cem-dropzone ${dragging ? 'dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file" accept="image/*" multiple
                  style={{ display: 'none' }}
                  onChange={e => addImageFiles(e.target.files)}
                />
                <div className="cem-dropzone-inner">
                  <div className="cem-dropzone-icon"><Upload size={22} /></div>
                  <p className="cem-dropzone-text">
                    <strong>Drop screenshots here</strong> or click to browse
                  </p>
                  <p className="cem-dropzone-hint">PNG, JPG, GIF — Ad screenshots, analytics exports</p>
                </div>
              </div>

              {images.length > 0 && (
                <div className="cem-image-grid">
                  {images.map((img, idx) => (
                    <motion.div
                      key={idx}
                      className="cem-image-card"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.18 }}
                    >
                      <img src={img.preview} alt={`attach-${idx}`} className="cem-image-thumb" />
                      <button
                        className="cem-image-remove"
                        onClick={e => { e.stopPropagation(); removeImage(idx); }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.div>
                  ))}
                  <div className="cem-image-add-more" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={20} />
                    <span>Add more</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="cem-footer">
          <button className="cem-btn-cancel" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          {!disabled && (
            <button className="cem-btn-save" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><span className="cem-spinner" />Saving...</>
              ) : (
                <><Check size={16} />{initialData ? 'Update Campaign' : 'Add Campaign'}</>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modal, document.body);
};
