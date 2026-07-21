/**
 * ContentDetailDrawer — Right-side slide-in panel
 * Shows complete info for one content item across 6 tabs.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, ExternalLink, Calendar, User, MapPin, Clock, DollarSign,
  FileText, Film, Image, Link2, CheckCircle2, XCircle,
  ChevronRight, Activity, Edit2, Folder
} from 'lucide-react';
import './ContentDetailDrawer.css';

/* ── Constants ──────────────────────────────────── */
export const WORKFLOW_STAGES = [
  'Planning','Assigned','Shooting','Editing','Review',
  'Revision Required','Approved','Content Received','Scheduled','Published','Archived'
];

export const STATUS_CONFIG = {
  'Planning':          { color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.22)' },
  'Assigned':          { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.22)' },
  'Shooting':          { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.22)' },
  'Editing':           { color: '#a855f7', bg: 'rgba(168,85,247,0.1)',   border: 'rgba(168,85,247,0.22)' },
  'Review':            { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',   border: 'rgba(99,102,241,0.22)' },
  'Revision Required': { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.22)' },
  'Approved':          { color: '#14b8a6', bg: 'rgba(20,184,166,0.1)',  border: 'rgba(20,184,166,0.22)' },
  'Content Received':  { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.22)' },
  'Scheduled':         { color: '#4f46e5', bg: 'rgba(79,70,229,0.1)',   border: 'rgba(79,70,229,0.22)' },
  'Published':         { color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
  'Archived':          { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)',border: 'rgba(148,163,184,0.15)' },
};

/* ── Helpers ────────────────────────────────────── */
const fmt = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
};

const fmtDateTime = (dateStr) => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
};

const DriveLink = ({ href, label, icon: Icon }) => {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="cdd-file-link">
      <Icon size={14} />
      <span>{label}</span>
      <ExternalLink size={11} className="cdd-ext-icon" />
    </a>
  );
};

const InfoRow = ({ label, value, highlight }) => (
  <div className="cdd-info-row">
    <span className="cdd-info-label">{label}</span>
    <span className={`cdd-info-value ${highlight ? 'cdd-info-highlight' : ''}`}>{value || '—'}</span>
  </div>
);

/* ── Progress Bar ───────────────────────────────── */
const WorkflowProgress = ({ status }) => {
  const idx = WORKFLOW_STAGES.indexOf(status);
  const pct = idx < 0 ? 0 : Math.round((idx / (WORKFLOW_STAGES.length - 1)) * 100);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Planning'];
  return (
    <div className="cdd-progress-wrap">
      <div className="cdd-progress-track">
        <div className="cdd-progress-fill" style={{ width: `${pct}%`, background: cfg.color }} />
      </div>
      <div className="cdd-progress-labels">
        {WORKFLOW_STAGES.filter((_, i) => i % 2 === 0).map(s => (
          <span key={s} className={`cdd-prog-label ${s === status ? 'active' : ''}`}>{s}</span>
        ))}
      </div>
    </div>
  );
};

/* ── Status Badge ───────────────────────────────── */
export const StatusBadge = ({ status, size = 'md' }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Planning'];
  return (
    <span className={`cdd-status-badge cdd-status-${size}`} style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
      {status}
    </span>
  );
};

/* ── Main Component ─────────────────────────────── */
export const ContentDetailDrawer = ({ item, activityLogs, onClose, onStatusChange, onEdit }) => {
  const [tab, setTab] = useState('overview');

  if (!item) return null;

  const cfg = STATUS_CONFIG[item.workflow_status] || STATUS_CONFIG['Planning'];
  const title = item.content_title || item.product_name;
  const totalCost = (item.model_remuneration||0) + (item.photographer_cost||0) + (item.videographer_cost||0) + (item.editing_cost||0) + (item.other_cost||0);

  const TABS = [
    { id: 'overview',   label: 'Overview',    icon: FileText },
    { id: 'assignment', label: 'Assignment',  icon: User },
    { id: 'timeline',   label: 'Timeline',    icon: Calendar },
    { id: 'files',      label: 'Files',       icon: Folder },
    { id: 'cost',       label: 'Cost',        icon: DollarSign },
    { id: 'activity',   label: 'Activity',    icon: Activity },
  ];

  return (
    <AnimatePresence>
      <div className="cdd-overlay">
        <motion.div
          className="cdd-panel"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 35 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Drawer Header */}
          <div className="cdd-header">
            <div className="cdd-header-left">
              <StatusBadge status={item.workflow_status} />
              <div className="cdd-header-title-area">
                <h2 className="cdd-title">{title}</h2>
                <p className="cdd-subtitle">{item.product_name} · {item.content_type || 'UGC'} · {item.platform || 'Facebook'}</p>
              </div>
            </div>
            <div className="cdd-header-actions">
              <button className="cdd-edit-btn" onClick={onEdit} title="Edit content item">
                <Edit2 size={15} />
              </button>
              <button className="cdd-close-btn" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="cdd-progress-section">
            <WorkflowProgress status={item.workflow_status} />
          </div>

          {/* Tabs */}
          <div className="cdd-tabs">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.id} className={`cdd-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                  <Icon size={13} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="cdd-body">

            {/* ── OVERVIEW ── */}
            {tab === 'overview' && (
              <div className="cdd-section-list">
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Planning Information</h4>
                  <InfoRow label="Content Title" value={item.content_title} highlight />
                  <InfoRow label="Product" value={item.product_name} />
                  <InfoRow label="Content Type" value={item.content_type} />
                  <InfoRow label="Campaign" value={item.campaign_name} />
                  <InfoRow label="Platform" value={item.platform} />
                  <InfoRow label="Priority" value={item.priority} />
                  <InfoRow label="Quantity" value={item.content_needed || item.quantity || '—'} />
                  <InfoRow label="Planning Date" value={fmt(item.planning_date)} />
                </div>
                {item.brief && (
                  <div className="cdd-section">
                    <h4 className="cdd-section-title">Brief / Description</h4>
                    <p className="cdd-text-block">{item.brief}</p>
                  </div>
                )}
                {item.script_content && (
                  <div className="cdd-section">
                    <h4 className="cdd-section-title">Script</h4>
                    <p className="cdd-text-block cdd-script">{item.script_content}</p>
                  </div>
                )}
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Delivery</h4>
                  <InfoRow label="Content Received" value={item.content_received ? '✅ Yes' : '❌ No'} />
                  <InfoRow label="Receive Date" value={fmt(item.receive_date)} />
                  <InfoRow label="Received By" value={item.received_by} />
                  <InfoRow label="Final Approval" value={item.final_approval ? '✅ Approved' : 'Pending'} />
                  <InfoRow label="Delivery Status" value={item.delivery_status} />
                </div>
                {item.notes && (
                  <div className="cdd-section">
                    <h4 className="cdd-section-title">Notes</h4>
                    <p className="cdd-text-block">{item.notes}</p>
                  </div>
                )}
                {/* Quick Status Changer */}
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Change Status</h4>
                  <div className="cdd-status-grid">
                    {WORKFLOW_STAGES.map(s => {
                      const c = STATUS_CONFIG[s];
                      return (
                        <button
                          key={s}
                          className={`cdd-status-pick ${item.workflow_status === s ? 'active' : ''}`}
                          style={item.workflow_status === s ? { background: c.bg, color: c.color, borderColor: c.border } : {}}
                          onClick={() => onStatusChange(item.id, s)}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ── ASSIGNMENT ── */}
            {tab === 'assignment' && (
              <div className="cdd-section-list">
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Crew</h4>
                  <InfoRow label="Model / Creator" value={item.model_creator} />
                  <InfoRow label="Videographer" value={item.videographer} />
                  <InfoRow label="Photographer" value={item.photographer} />
                  <InfoRow label="Editor" value={item.editor} />
                </div>
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Assignment</h4>
                  <InfoRow label="Assigned To" value={item.assigned_to} highlight />
                  <InfoRow label="Assigned By" value={item.assigned_by} />
                  <InfoRow label="Assignment Date" value={fmt(item.assignment_date)} />
                </div>
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Shoot Details</h4>
                  <InfoRow label="Shoot Location" value={item.shoot_location} />
                  <InfoRow label="Shoot Date" value={fmt(item.shoot_date)} />
                  <InfoRow label="Delivery Deadline" value={fmt(item.delivery_deadline)} />
                  <InfoRow label="Expected Delivery" value={fmt(item.expected_delivery_date)} />
                </div>
              </div>
            )}

            {/* ── TIMELINE ── */}
            {tab === 'timeline' && (
              <div className="cdd-section-list">
                <div className="cdd-timeline">
                  {[
                    { label: 'Content Planned', date: item.planning_date || item.created_at, icon: FileText, color: '#6366f1' },
                    { label: 'Assigned', date: item.assignment_date, icon: User, color: '#3b82f6' },
                    { label: 'Shoot Date', date: item.shoot_date, icon: MapPin, color: '#f59e0b' },
                    { label: 'Delivery Deadline', date: item.delivery_deadline, icon: Clock, color: '#ef4444' },
                    { label: 'Expected Delivery', date: item.expected_delivery_date, icon: Calendar, color: '#a855f7' },
                    { label: 'Content Received', date: item.receive_date, icon: CheckCircle2, color: '#22c55e' },
                    { label: 'Published', date: item.publish_date, icon: ExternalLink, color: '#10b981' },
                  ].map((ev, i) => (
                    <div key={i} className={`cdd-timeline-item ${!ev.date ? 'cdd-tl-empty' : ''}`}>
                      <div className="cdd-tl-dot" style={{ background: ev.date ? ev.color : '#e2e8f0' }}>
                        <ev.icon size={10} color={ev.date ? 'white' : '#94a3b8'} />
                      </div>
                      <div className="cdd-tl-content">
                        <span className="cdd-tl-label">{ev.label}</span>
                        <span className="cdd-tl-date">{ev.date ? fmt(ev.date) : 'Not set'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── FILES ── */}
            {tab === 'files' && (
              <div className="cdd-section-list">
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Production Assets</h4>
                  <div className="cdd-files-grid">
                    <DriveLink href={item.drive_folder} label="Google Drive Folder" icon={Folder} />
                    <DriveLink href={item.raw_footage_link} label="Raw Footage" icon={Film} />
                    <DriveLink href={item.edited_video_link} label="Edited Video" icon={Film} />
                    <DriveLink href={item.thumbnail_link} label="Thumbnail" icon={Image} />
                    <DriveLink href={item.caption_document} label="Caption Document" icon={FileText} />
                    <DriveLink href={item.script_document} label="Script Document" icon={FileText} />
                    <DriveLink href={item.final_export_link} label="Final Export" icon={Link2} />
                  </div>
                  {!item.drive_folder && !item.raw_footage_link && !item.edited_video_link && !item.final_export_link && (
                    <p className="cdd-empty-msg">No files linked yet. Edit this item to add Drive links.</p>
                  )}
                </div>
              </div>
            )}

            {/* ── COST ── */}
            {tab === 'cost' && (
              <div className="cdd-section-list">
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Production Costs</h4>
                  {[
                    { label: 'Model Remuneration', val: item.model_remuneration },
                    { label: 'Photographer Cost',  val: item.photographer_cost },
                    { label: 'Videographer Cost',  val: item.videographer_cost },
                    { label: 'Editing Cost',       val: item.editing_cost },
                    { label: 'Other Cost',         val: item.other_cost },
                  ].map(row => (
                    <div className="cdd-cost-row" key={row.label}>
                      <span className="cdd-cost-label">{row.label}</span>
                      <span className="cdd-cost-val">৳{(row.val||0).toLocaleString()}</span>
                    </div>
                  ))}
                  <div className="cdd-cost-total-row">
                    <span>Total Cost</span>
                    <span>৳{((item.model_remuneration||0)+(item.photographer_cost||0)+(item.videographer_cost||0)+(item.editing_cost||0)+(item.other_cost||0)).toLocaleString()}</span>
                  </div>
                  <div className="cdd-cost-row" style={{ marginTop: 12 }}>
                    <span className="cdd-cost-label">Payment Status</span>
                    <span className={`cdd-payment-badge ${item.payment_status === 'Paid' ? 'paid' : item.payment_status === 'Partial' ? 'partial' : 'unpaid'}`}>
                      {item.payment_status || 'Unpaid'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ── ACTIVITY ── */}
            {tab === 'activity' && (
              <div className="cdd-section-list">
                <div className="cdd-section">
                  <h4 className="cdd-section-title">Activity Log</h4>
                  {activityLogs && activityLogs.length > 0 ? (
                    <div className="cdd-activity-list">
                      {activityLogs.map(log => (
                        <div key={log.id} className="cdd-activity-item">
                          <div className="cdd-activity-dot" />
                          <div className="cdd-activity-content">
                            <span className="cdd-activity-desc">{log.action_description}</span>
                            <span className="cdd-activity-meta">{log.user_name} · {fmtDateTime(log.created_at)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="cdd-empty-msg">No activity recorded yet.</p>
                  )}
                </div>
              </div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
