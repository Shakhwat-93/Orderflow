import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Megaphone, ChevronDown, Check, Image, Trash2,
  DollarSign, ShoppingBag, Eye, FileText, Upload, Plus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './CampaignEntryModal.css';

const PLATFORMS = ['Facebook', 'Instagram', 'Google', 'TikTok', 'YouTube', 'Twitter', 'LinkedIn', 'Other'];

const PLATFORM_COLORS = {
  Facebook: '#1877f2',
  Instagram: '#e1306c',
  Google:   '#4285f4',
  TikTok:   '#ff0050',
  YouTube:  '#ff0000',
  Twitter:  '#1da1f2',
  LinkedIn: '#0a66c2',
  Other:    '#6b7280',
};

const EMPTY_FORM = {
  campaign_name: '',
  platform: 'Facebook',
  product_name: '',
  spend: '',
  orders_received: '',
  impressions: '',
  notes: '',
};

/**
 * CampaignEntryModal
 * Props:
 *  isOpen        – boolean
 *  onClose       – fn
 *  onSave        – fn(formData, imageFiles) => Promise<void>
 *  initialData   – optional pre-fill object for editing
 *  disabled      – boolean (locked mode)
 */
export const CampaignEntryModal = ({ isOpen, onClose, onSave, initialData = null, disabled = false }) => {
  const [form, setForm] = useState(initialData ? {
    campaign_name:   initialData.campaign_name   || '',
    platform:        initialData.platform         || 'Facebook',
    product_name:    initialData.product_name    || '',
    spend:           initialData.spend            ?? '',
    orders_received: initialData.orders_received ?? '',
    impressions:     initialData.impressions      ?? '',
    notes:           initialData.notes            || '',
  } : { ...EMPTY_FORM });

  const [platformOpen, setPlatformOpen] = useState(false);
  const [images, setImages] = useState([]); // Array of { file, preview, uploading, url }
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  /* ── Derived ────────────────────────────────────────── */
  const spend  = parseFloat(form.spend)           || 0;
  const orders = parseInt(form.orders_received)   || 0;
  const cpo    = orders > 0 ? spend / orders : null;

  /* ── Validation ─────────────────────────────────────── */
  const validate = () => {
    const e = {};
    if (!form.campaign_name.trim()) e.campaign_name = 'Campaign title required';
    if (!form.product_name.trim()) e.product_name = 'Product focus required';
    if (form.spend === '' || isNaN(form.spend)) e.spend = 'Valid spend amount required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Image Handling ─────────────────────────────────── */
  const addImageFiles = useCallback((files) => {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    const previews = valid.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      uploading: false,
      url: null,
    }));
    setImages(prev => [...prev, ...previews]);
  }, []);

  const removeImage = (index) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    addImageFiles(e.dataTransfer.files);
  }, [addImageFiles]);

  /* ── Upload images to Supabase storage ─────────────── */
  const uploadImages = async () => {
    const urls = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (img.url) { urls.push(img.url); continue; }
      const ext  = img.file.name.split('.').pop();
      const path = `campaign-reports/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('campaign-images')
        .upload(path, img.file, { cacheControl: '3600', upsert: false });
      if (error) {
        console.warn('Image upload failed:', error.message);
        continue;
      }
      const { data: { publicUrl } } = supabase.storage
        .from('campaign-images')
        .getPublicUrl(data.path);
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
      if (images.some(img => !img.url)) {
        // Only upload if there's a bucket; gracefully skip if not configured
        try { imageUrls = await uploadImages(); } catch {}
      } else {
        imageUrls = images.map(i => i.url).filter(Boolean);
      }

      await onSave({
        ...form,
        spend:           parseFloat(form.spend)          || 0,
        orders_received: parseInt(form.orders_received)  || 0,
        impressions:     parseInt(form.impressions)      || 0,
        image_urls:      imageUrls,
      }, images.map(i => i.file));

      onClose();
    } catch (err) {
      console.error('CampaignEntryModal save error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Reset on open ───────────────────────────────────── */
  const handleClose = () => {
    setErrors({});
    setPlatformOpen(false);
    setDragging(false);
    onClose();
  };

  if (!isOpen) return null;

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
        {/* ── Modal Header ── */}
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

        {/* ── Scrollable Body ── */}
        <div className="cem-body">

          {/* ── Section 1: Campaign Identity ── */}
          <div className="cem-section">
            <div className="cem-section-label">
              <span className="cem-kicker">Campaign Identity</span>
            </div>

            {/* Campaign Title */}
            <div className="cem-field-group">
              <label className="cem-label">Campaign Title <span className="cem-req">*</span></label>
              <input
                className={`cem-input ${errors.campaign_name ? 'error' : ''}`}
                placeholder="e.g. Summer Sale — Facebook Retargeting"
                value={form.campaign_name}
                onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))}
                disabled={disabled}
              />
              {errors.campaign_name && <p className="cem-error">{errors.campaign_name}</p>}
            </div>

            <div className="cem-row-2">
              {/* Platform */}
              <div className="cem-field-group">
                <label className="cem-label">Platform</label>
                <div className="cem-platform-wrap">
                  <button
                    type="button"
                    className="cem-platform-btn"
                    style={{ borderLeft: `3px solid ${PLATFORM_COLORS[form.platform]}` }}
                    onClick={() => setPlatformOpen(p => !p)}
                    disabled={disabled}
                  >
                    <span
                      className="cem-platform-dot"
                      style={{ background: PLATFORM_COLORS[form.platform] }}
                    />
                    <span>{form.platform}</span>
                    <ChevronDown size={14} className={`cem-chevron ${platformOpen ? 'open' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {platformOpen && (
                      <motion.div
                        className="cem-platform-dropdown"
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.14 }}
                      >
                        {PLATFORMS.map(p => (
                          <button
                            key={p}
                            type="button"
                            className={`cem-platform-opt ${form.platform === p ? 'active' : ''}`}
                            onClick={() => { setForm(f => ({ ...f, platform: p })); setPlatformOpen(false); }}
                          >
                            <span className="cem-platform-dot" style={{ background: PLATFORM_COLORS[p] }} />
                            <span>{p}</span>
                            {form.platform === p && <Check size={12} className="cem-opt-check" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Product Focus */}
              <div className="cem-field-group">
                <label className="cem-label">Product Focus <span className="cem-req">*</span></label>
                <input
                  className={`cem-input ${errors.product_name ? 'error' : ''}`}
                  placeholder="e.g. Toy Box Combo, Organizer Set"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  disabled={disabled}
                />
                {errors.product_name && <p className="cem-error">{errors.product_name}</p>}
              </div>
            </div>
          </div>

          {/* ── Section 2: Performance Metrics ── */}
          <div className="cem-section">
            <div className="cem-section-label">
              <span className="cem-kicker">Performance Metrics</span>
            </div>

            <div className="cem-row-3">
              {/* Spend */}
              <div className="cem-field-group">
                <label className="cem-label">
                  <DollarSign size={13} className="cem-label-icon" />
                  Ad Spend <span className="cem-req">*</span>
                </label>
                <div className="cem-input-prefix-wrap">
                  <span className="cem-input-prefix">$</span>
                  <input
                    className={`cem-input prefix ${errors.spend ? 'error' : ''}`}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.spend}
                    onChange={e => setForm(f => ({ ...f, spend: e.target.value }))}
                    disabled={disabled}
                  />
                </div>
                {errors.spend && <p className="cem-error">{errors.spend}</p>}
              </div>

              {/* Orders */}
              <div className="cem-field-group">
                <label className="cem-label">
                  <ShoppingBag size={13} className="cem-label-icon" />
                  Orders Generated
                </label>
                <input
                  className="cem-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.orders_received}
                  onChange={e => setForm(f => ({ ...f, orders_received: e.target.value }))}
                  disabled={disabled}
                />
              </div>

              {/* Impressions */}
              <div className="cem-field-group">
                <label className="cem-label">
                  <Eye size={13} className="cem-label-icon" />
                  Reach / Impressions
                </label>
                <input
                  className="cem-input"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.impressions}
                  onChange={e => setForm(f => ({ ...f, impressions: e.target.value }))}
                  disabled={disabled}
                />
              </div>
            </div>

            {/* CPO Preview Badge */}
            {cpo !== null && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="cem-cpo-preview"
              >
                <div className="cem-cpo-badge">
                  <span className="cem-cpo-label">Auto CPO</span>
                  <span className="cem-cpo-value">
                    ${cpo.toFixed(2)}
                  </span>
                </div>
                <p className="cem-cpo-hint">Cost per order calculated automatically from spend ÷ orders</p>
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
                placeholder="Describe targeting strategy, anomalies, or key insights for this campaign..."
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

              {/* Drop zone */}
              <div
                ref={dropZoneRef}
                className={`cem-dropzone ${dragging ? 'dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => addImageFiles(e.target.files)}
                />
                <div className="cem-dropzone-inner">
                  <div className="cem-dropzone-icon">
                    <Upload size={22} />
                  </div>
                  <p className="cem-dropzone-text">
                    <strong>Drop screenshots here</strong> or click to browse
                  </p>
                  <p className="cem-dropzone-hint">PNG, JPG, GIF — Ad screenshots, analytics exports</p>
                </div>
              </div>

              {/* Image Preview Grid */}
              {images.length > 0 && (
                <div className="cem-image-grid">
                  {images.map((img, idx) => (
                    <motion.div
                      key={idx}
                      className="cem-image-card"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.18 }}
                    >
                      <img
                        src={img.preview}
                        alt={`attachment-${idx}`}
                        className="cem-image-thumb"
                      />
                      <button
                        className="cem-image-remove"
                        onClick={e => { e.stopPropagation(); removeImage(idx); }}
                        title="Remove"
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.div>
                  ))}
                  <div
                    className="cem-image-add-more"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus size={20} />
                    <span>Add more</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="cem-footer">
          <button className="cem-btn-cancel" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          {!disabled && (
            <button
              className="cem-btn-save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="cem-spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={16} />
                  {initialData ? 'Update Campaign' : 'Add Campaign'}
                </>
              )}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );

  return createPortal(modal, document.body);
};
