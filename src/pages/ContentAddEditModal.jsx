/**
 * ContentAddEditModal — Comprehensive add/edit form for content items
 * Sections: Planning Info | Assignment & Shoot | Drive & Files | Cost & Payment
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, FolderPlus, ChevronDown, ChevronUp } from 'lucide-react';
import './ContentAddEditModal.css';

const CONTENT_TYPES = ['UGC','Lifestyle','Review','Demo','Hook','Voice Over','Image','Reel','Carousel','Tutorial','Unboxing','Testimonial'];
const PLATFORMS     = ['Facebook','Instagram','TikTok','YouTube','Website'];
const PRIORITIES    = ['High','Medium','Low'];
const PAYMENT_STATUSES = ['Unpaid','Partial','Paid'];
const WORKFLOW_STATUSES = ['Planning','Assigned','Shooting','Editing','Review','Revision Required','Approved','Content Received','Scheduled','Published','Archived'];

const EMPTY_FORM = {
  // Planning
  product_id: '', product_name: '', content_title: '', content_type: 'UGC',
  campaign_name: '', platform: 'Facebook', priority: 'Medium',
  content_needed: 1, brief: '', script_content: '', planning_date: '',
  workflow_status: 'Planning',
  // Assignment
  model_creator: '', videographer: '', photographer: '', editor: '',
  assigned_to: '', assigned_by: '', assignment_date: '',
  shoot_location: '', shoot_date: '', delivery_deadline: '', expected_delivery_date: '',
  // Delivery
  delivery_status: '', content_received: false, receive_date: '', received_by: '',
  final_approval: false, notes: '',
  // Drive
  drive_folder: '', raw_footage_link: '', edited_video_link: '', thumbnail_link: '',
  caption_document: '', script_document: '', final_export_link: '',
  // Cost (legacy kept)
  model_remuneration: 0, photographer_cost: 0, videographer_cost: 0,
  editing_cost: 0, other_cost: 0, payment_status: 'Unpaid', publish_date: '',
  // Legacy
  inhouse_count: 0, inhouse_unit_cost: 0, brand_name: '', brand_unit_count: 0, brand_unit_cost: 0,
};

const SectionHeader = ({ title, sectionKey, open, onToggle }) => (
  <button type="button" className="caem-section-header" onClick={() => onToggle(sectionKey)}>
    <span>{title}</span>
    {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
  </button>
);

const Field = ({ label, required, children }) => (
  <div className="caem-field">
    <label className="caem-label">{label}{required && <span className="caem-required">*</span>}</label>
    {children}
  </div>
);

export const ContentAddEditModal = ({ item, inventoryProducts, onSave, onClose, loading }) => {
  const isEdit = !!item;
  const [form, setForm]       = useState(EMPTY_FORM);
  const [open, setOpen]       = useState({ planning: true, assignment: false, drive: false, cost: false });

  useEffect(() => {
    if (item) {
      setForm({ ...EMPTY_FORM, ...item });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [item]);

  const set = (field, val) => setForm(p => ({ ...p, [field]: val }));

  const toggle = (k) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const handleInventorySelect = (id) => {
    const found = inventoryProducts.find(p => p.id === id);
    set('product_id', id);
    if (found) set('product_name', found.name);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.product_name && !form.content_title) {
      alert('Please enter a product name or content title.');
      return;
    }
    onSave(form);
  };

  const totalCost = (form.model_remuneration||0) + (form.photographer_cost||0) +
    (form.videographer_cost||0) + (form.editing_cost||0) + (form.other_cost||0);

  return (
    <div className="caem-overlay">
      <motion.div
        className="caem-modal"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
      >
        {/* Modal Header */}
        <div className="caem-header">
          <div className="caem-header-left">
            <FolderPlus size={18} className="caem-header-icon" />
            <div>
              <h3 className="caem-header-title">{isEdit ? 'Edit Content Item' : 'Add New Content Item'}</h3>
              <p className="caem-header-sub">{isEdit ? `Editing: ${item.content_title || item.product_name}` : 'Create a new content production item'}</p>
            </div>
          </div>
          <button className="caem-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Scrollable Form */}
        <form className="caem-body" onSubmit={handleSubmit}>

          {/* ── SECTION 1: Planning Information ── */}
          <SectionHeader title="📋 Planning Information" sectionKey="planning" open={open.planning} onToggle={toggle} />
          {open.planning && (
            <div className="caem-section-grid">
              <Field label="Inventory Product">
                <select className="caem-input" value={form.product_id} onChange={e => handleInventorySelect(e.target.value)}>
                  <option value="">— Select from inventory —</option>
                  {inventoryProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              <Field label="Product / Custom Name" required>
                <input className="caem-input" type="text" placeholder="e.g. Canvas Bag – Summer Collection"
                  value={form.product_name} onChange={e => set('product_name', e.target.value)} />
              </Field>
              <Field label="Content Title">
                <input className="caem-input" type="text" placeholder="e.g. Unboxing Hook — POV Style"
                  value={form.content_title} onChange={e => set('content_title', e.target.value)} />
              </Field>
              <Field label="Content Type">
                <select className="caem-input" value={form.content_type} onChange={e => set('content_type', e.target.value)}>
                  {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Platform">
                <select className="caem-input" value={form.platform} onChange={e => set('platform', e.target.value)}>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select className="caem-input" value={form.priority} onChange={e => set('priority', e.target.value)}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Campaign Name">
                <input className="caem-input" type="text" placeholder="e.g. Eid Campaign 2025"
                  value={form.campaign_name} onChange={e => set('campaign_name', e.target.value)} />
              </Field>
              <Field label="Quantity">
                <input className="caem-input" type="number" min="1" value={form.content_needed}
                  onChange={e => set('content_needed', parseInt(e.target.value)||1)} />
              </Field>
              <Field label="Planning Date">
                <input className="caem-input" type="date" value={form.planning_date}
                  onChange={e => set('planning_date', e.target.value)} />
              </Field>
              <Field label="Workflow Status">
                <select className="caem-input" value={form.workflow_status} onChange={e => set('workflow_status', e.target.value)}>
                  {WORKFLOW_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Brief / Description" >
                <textarea className="caem-input caem-textarea" rows={3} placeholder="Describe the content brief…"
                  value={form.brief} onChange={e => set('brief', e.target.value)} />
              </Field>
              <Field label="Script (Optional)">
                <textarea className="caem-input caem-textarea" rows={3} placeholder="Script or talking points…"
                  value={form.script_content} onChange={e => set('script_content', e.target.value)} />
              </Field>
            </div>
          )}

          {/* ── SECTION 2: Assignment & Shoot ── */}
          <SectionHeader title="👥 Assignment & Shoot Details" sectionKey="assignment" open={open.assignment} onToggle={toggle} />
          {open.assignment && (
            <div className="caem-section-grid">
              <Field label="Model / Creator">
                <input className="caem-input" type="text" placeholder="Creator name"
                  value={form.model_creator} onChange={e => set('model_creator', e.target.value)} />
              </Field>
              <Field label="Videographer">
                <input className="caem-input" type="text" value={form.videographer}
                  onChange={e => set('videographer', e.target.value)} />
              </Field>
              <Field label="Photographer">
                <input className="caem-input" type="text" value={form.photographer}
                  onChange={e => set('photographer', e.target.value)} />
              </Field>
              <Field label="Editor">
                <input className="caem-input" type="text" value={form.editor}
                  onChange={e => set('editor', e.target.value)} />
              </Field>
              <Field label="Assigned To">
                <input className="caem-input" type="text" placeholder="Responsible person"
                  value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} />
              </Field>
              <Field label="Assigned By">
                <input className="caem-input" type="text" value={form.assigned_by}
                  onChange={e => set('assigned_by', e.target.value)} />
              </Field>
              <Field label="Assignment Date">
                <input className="caem-input" type="date" value={form.assignment_date}
                  onChange={e => set('assignment_date', e.target.value)} />
              </Field>
              <Field label="Shoot Location">
                <input className="caem-input" type="text" value={form.shoot_location}
                  onChange={e => set('shoot_location', e.target.value)} />
              </Field>
              <Field label="Shoot Date">
                <input className="caem-input" type="date" value={form.shoot_date}
                  onChange={e => set('shoot_date', e.target.value)} />
              </Field>
              <Field label="Delivery Deadline">
                <input className="caem-input" type="date" value={form.delivery_deadline}
                  onChange={e => set('delivery_deadline', e.target.value)} />
              </Field>
              <Field label="Expected Delivery Date">
                <input className="caem-input" type="date" value={form.expected_delivery_date}
                  onChange={e => set('expected_delivery_date', e.target.value)} />
              </Field>
              <Field label="Received By">
                <input className="caem-input" type="text" value={form.received_by}
                  onChange={e => set('received_by', e.target.value)} />
              </Field>
              <Field label="Receive Date">
                <input className="caem-input" type="date" value={form.receive_date}
                  onChange={e => set('receive_date', e.target.value)} />
              </Field>
              <Field label="Publish Date">
                <input className="caem-input" type="date" value={form.publish_date}
                  onChange={e => set('publish_date', e.target.value)} />
              </Field>
              <div className="caem-checkbox-row">
                <label className="caem-checkbox-label">
                  <input type="checkbox" checked={form.content_received}
                    onChange={e => set('content_received', e.target.checked)} />
                  Content Received
                </label>
                <label className="caem-checkbox-label">
                  <input type="checkbox" checked={form.final_approval}
                    onChange={e => set('final_approval', e.target.checked)} />
                  Final Approval
                </label>
              </div>
              <Field label="Delivery Status">
                <input className="caem-input" type="text" placeholder="e.g. On Time, Late, Pending"
                  value={form.delivery_status} onChange={e => set('delivery_status', e.target.value)} />
              </Field>
              <Field label="Notes">
                <textarea className="caem-input caem-textarea" rows={3} value={form.notes}
                  onChange={e => set('notes', e.target.value)} />
              </Field>
            </div>
          )}

          {/* ── SECTION 3: Drive & Files ── */}
          <SectionHeader title="📁 Drive & File Links" sectionKey="drive" open={open.drive} onToggle={toggle} />
          {open.drive && (
            <div className="caem-section-grid">
              {[
                ['Google Drive Folder', 'drive_folder', 'https://drive.google.com/...'],
                ['Raw Footage Link',    'raw_footage_link', 'https://...'],
                ['Edited Video Link',  'edited_video_link', 'https://...'],
                ['Thumbnail Link',     'thumbnail_link', 'https://...'],
                ['Caption Document',   'caption_document', 'https://docs.google.com/...'],
                ['Script Document',    'script_document', 'https://...'],
                ['Final Export Link',  'final_export_link', 'https://...'],
              ].map(([label, key, ph]) => (
                <Field key={key} label={label}>
                  <input className="caem-input" type="url" placeholder={ph}
                    value={form[key]} onChange={e => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
          )}

          {/* ── SECTION 4: Cost & Payment ── */}
          <SectionHeader title="💰 Cost & Payment" sectionKey="cost" open={open.cost} onToggle={toggle} />
          {open.cost && (
            <div className="caem-section-grid">
              {[
                ['Model Remuneration', 'model_remuneration'],
                ['Photographer Cost',  'photographer_cost'],
                ['Videographer Cost',  'videographer_cost'],
                ['Editing Cost',       'editing_cost'],
                ['Other Cost',         'other_cost'],
              ].map(([label, key]) => (
                <Field key={key} label={`${label} (৳)`}>
                  <input className="caem-input" type="number" min="0" step="0.01"
                    value={form[key]} onChange={e => set(key, parseFloat(e.target.value)||0)} />
                </Field>
              ))}
              <div className="caem-total-cost-display">
                <span>Total Cost</span>
                <strong>৳{totalCost.toLocaleString()}</strong>
              </div>
              <Field label="Payment Status">
                <select className="caem-input" value={form.payment_status}
                  onChange={e => set('payment_status', e.target.value)}>
                  {PAYMENT_STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="caem-footer">
          <button type="button" className="caem-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
          <button type="button" className="caem-btn-save" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Board'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
