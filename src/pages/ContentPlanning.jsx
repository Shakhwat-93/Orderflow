import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Calendar, User, Layers, Search, RefreshCw, Plus, Filter,
  X, Check, AlertTriangle, ChevronDown, Eye, Edit2, Trash2,
  ExternalLink, DollarSign, CheckCircle2, Clock, TrendingUp
} from 'lucide-react';
import { ContentDetailDrawer, StatusBadge, WORKFLOW_STAGES, STATUS_CONFIG } from './ContentDetailDrawer';
import { ContentAddEditModal } from './ContentAddEditModal';
import './ContentPlanning.css';

// ── Helpers ──────────────────────────────────────────────────────
const fmt = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—';
const computeCost = (p) =>
  (p.model_remuneration||0)+(p.photographer_cost||0)+(p.videographer_cost||0)+(p.editing_cost||0)+(p.other_cost||0);
const isOverdue = (p) => {
  if (!p.delivery_deadline) return false;
  const done = ['Published','Archived','Content Received'];
  return new Date(p.delivery_deadline) < new Date() && !done.includes(p.workflow_status);
};

// ── Progress Mini Bar ─────────────────────────────────────────────
const MiniProgress = ({ status }) => {
  const idx = WORKFLOW_STAGES.indexOf(status);
  const pct = idx < 0 ? 0 : Math.round((idx / (WORKFLOW_STAGES.length - 1)) * 100);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Planning'];
  return (
    <div className="cp-mini-prog-track" title={`${pct}% — ${status}`}>
      <div className="cp-mini-prog-fill" style={{ width: `${pct}%`, background: cfg.color }} />
    </div>
  );
};

// ── Summary Stat Card ─────────────────────────────────────────────
const SumCard = ({ label, value, color, bg, icon: Icon, sub }) => (
  <div className="cp-sum-card" style={{ '--sum-color': color, '--sum-bg': bg }}>
    <div className="cp-sum-icon"><Icon size={18} /></div>
    <div className="cp-sum-content">
      <p className="cp-sum-label">{label}</p>
      <h3 className="cp-sum-value">{value}</h3>
      {sub && <p className="cp-sum-sub">{sub}</p>}
    </div>
  </div>
);

// ── Main Component ────────────────────────────────────────────────
export const ContentPlanning = () => {
  const { profile } = useAuth();
  const actorName = profile?.name || 'System';

  // ── State ─────────────────────────────────────────────────────
  const [plans, setPlans] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [activityLogs, setActivityLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  });

  const monthOptions = useMemo(() => {
    const list = []; const d = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    for (let i = -6; i <= 6; i++) {
      const t = new Date(d.getFullYear(), d.getMonth() + i, 1);
      list.push(`${months[t.getMonth()]} ${t.getFullYear()}`);
    }
    return list;
  }, []);

  // Filters
  const [searchQuery, setSearchQuery]   = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [filters, setFilters]           = useState({ status:'', type:'', platform:'', priority:'', assignedTo:'', model:'' });

  // Modals / Drawer
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editItem, setEditItem]           = useState(null);
  const [drawerItem, setDrawerItem]       = useState(null);

  // Risk Modal
  const [riskModal, setRiskModal] = useState({ isOpen:false, title:'', message:'', onConfirm:null, onCancel:null });

  // ── Data Fetch ────────────────────────────────────────────────
  const fetchInventory = useCallback(async () => {
    const { data } = await supabase.from('inventory').select('id,name,unit_price').order('name');
    setInventoryProducts(data || []);
  }, []);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('content_plans').select('*').eq('month', selectedMonth).order('created_at', { ascending: true });
      if (error) throw error;
      setPlans(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedMonth]);

  const fetchLogsForItem = useCallback(async (planId) => {
    const { data } = await supabase
      .from('content_activity_logs')
      .select('*').eq('content_plan_id', planId).order('created_at', { ascending: false });
    setActivityLogs(prev => ({ ...prev, [planId]: data || [] }));
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  // ── Activity Logger ───────────────────────────────────────────
  const logActivity = useCallback(async (planId, actionType, desc, oldVal = null, newVal = null) => {
    await supabase.from('content_activity_logs').insert([{
      content_plan_id: planId,
      user_name: actorName,
      action_type: actionType,
      action_description: desc,
      old_value: oldVal,
      new_value: newVal,
    }]);
  }, [actorName]);

  // ── Aggregates / Summary ──────────────────────────────────────
  const summary = useMemo(() => {
    const count = (st) => plans.filter(p => p.workflow_status === st).length;
    return {
      total:     plans.length,
      assigned:  count('Assigned'),
      shooting:  count('Shooting'),
      editing:   count('Editing'),
      review:    count('Review') + count('Revision Required'),
      revision:  count('Revision Required'),
      received:  count('Content Received'),
      published: count('Published'),
      overdue:   plans.filter(isOverdue).length,
      totalCost: plans.reduce((s, p) => s + computeCost(p), 0),
    };
  }, [plans]);

  // ── Filtered Plans ─────────────────────────────────────────────
  const filteredPlans = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return plans.filter(p => {
      if (q && !((p.content_title||p.product_name||'').toLowerCase().includes(q) ||
                 (p.assigned_to||'').toLowerCase().includes(q) ||
                 (p.model_creator||'').toLowerCase().includes(q))) return false;
      if (filters.status   && p.workflow_status !== filters.status)   return false;
      if (filters.type     && p.content_type    !== filters.type)     return false;
      if (filters.platform && p.platform        !== filters.platform) return false;
      if (filters.priority && p.priority        !== filters.priority) return false;
      if (filters.assignedTo && !(p.assigned_to||'').toLowerCase().includes(filters.assignedTo.toLowerCase())) return false;
      if (filters.model    && !(p.model_creator||'').toLowerCase().includes(filters.model.toLowerCase())) return false;
      return true;
    });
  }, [plans, searchQuery, filters]);

  const activeFilters = Object.values(filters).filter(Boolean).length;

  // ── Handlers ──────────────────────────────────────────────────
  const handleSaveItem = async (formData) => {
    setActionLoading(true);
    try {
      const payload = { ...formData, month: selectedMonth };
      if (editItem) {
        const { error } = await supabase.from('content_plans').update(payload).eq('id', editItem.id);
        if (error) throw error;
        await logActivity(editItem.id, 'UPDATE', `${actorName} updated content item`);
      } else {
        const { data, error } = await supabase.from('content_plans').insert([payload]).select().single();
        if (error) throw error;
        await logActivity(data.id, 'CREATE', `${actorName} created content item: ${formData.content_title || formData.product_name}`);
      }
      setShowAddModal(false);
      setEditItem(null);
      fetchPlans();
    } catch (e) { console.error(e); alert('Error: ' + e.message); }
    finally { setActionLoading(false); }
  };

  const handleStatusChange = async (planId, newStatus) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan || plan.workflow_status === newStatus) return;
    const oldStatus = plan.workflow_status;

    setRiskModal({
      isOpen: true,
      title: `Move to "${newStatus}"?`,
      message: `Change status of "${plan.content_title || plan.product_name}" from "${oldStatus}" to "${newStatus}".`,
      onConfirm: async () => {
        try {
          const updates = { workflow_status: newStatus, updated_at: new Date() };
          if (newStatus === 'Content Received') updates.content_received = true;
          if (newStatus === 'Assigned' && !plan.assignment_date) updates.assignment_date = new Date().toISOString().split('T')[0];
          await supabase.from('content_plans').update(updates).eq('id', planId);
          await logActivity(planId, 'STATUS_CHANGE', `Status changed: ${oldStatus} → ${newStatus}`, oldStatus, newStatus);
          // refresh drawer if open
          if (drawerItem?.id === planId) {
            setDrawerItem(p => ({ ...p, workflow_status: newStatus, ...updates }));
          }
          fetchPlans();
          fetchLogsForItem(planId);
        } catch (e) { console.error(e); }
        finally { setRiskModal(p => ({ ...p, isOpen: false })); }
      },
      onCancel: () => setRiskModal(p => ({ ...p, isOpen: false })),
    });
  };

  const handleDelete = (plan) => {
    setRiskModal({
      isOpen: true,
      title: '🗑️ Delete Content Item',
      message: `Delete "${plan.content_title || plan.product_name}"? This cannot be undone.`,
      onConfirm: async () => {
        try {
          await supabase.from('content_plans').delete().eq('id', plan.id);
          if (drawerItem?.id === plan.id) setDrawerItem(null);
          fetchPlans();
        } catch (e) { console.error(e); }
        finally { setRiskModal(p => ({ ...p, isOpen: false })); }
      },
      onCancel: () => setRiskModal(p => ({ ...p, isOpen: false })),
    });
  };

  const openDrawer = async (plan) => {
    setDrawerItem(plan);
    if (!activityLogs[plan.id]) fetchLogsForItem(plan.id);
  };

  const openEdit = (plan) => {
    setEditItem(plan);
    setShowAddModal(true);
    setDrawerItem(null);
  };

  const priorityColor = (p) => ({ 'High':'#ef4444','Medium':'#f59e0b','Low':'#22c55e' }[p] || '#94a3b8');

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="dm-panel">

      {/* ── Header ── */}
      <div className="dm-header-elite">
        <div className="dm-header-left">
          <div className="dm-header-icon-premium"><Layers size={24} /></div>
          <div className="dm-header-text">
            <h1 className="dm-title-elite">Content Production</h1>
            <p className="dm-subtitle-elite">End-to-end content lifecycle management — plan, assign, track, deliver</p>
          </div>
        </div>
        <div className="dm-header-right-elite">
          <div className="month-picker-container">
            <Calendar size={15} className="calendar-icon" />
            <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="premium-select-element">
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button className="cp-btn-filter" onClick={() => setShowFilters(v => !v)}>
            <Filter size={14} />
            Filters {activeFilters > 0 && <span className="cp-filter-badge">{activeFilters}</span>}
          </button>
          <button className="dm-btn-add-campaign" onClick={() => { setEditItem(null); setShowAddModal(true); }}>
            <Plus size={15} /> Add Content
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="cp-sum-grid">
        <SumCard label="Total Planned"  value={summary.total}     color="#6366f1" bg="rgba(99,102,241,0.08)"  icon={Layers}       sub={`${selectedMonth}`} />
        <SumCard label="Assigned"       value={summary.assigned}   color="#3b82f6" bg="rgba(59,130,246,0.08)"  icon={User}         />
        <SumCard label="Shooting"       value={summary.shooting}   color="#f59e0b" bg="rgba(245,158,11,0.08)"  icon={TrendingUp}   />
        <SumCard label="Editing"        value={summary.editing}    color="#a855f7" bg="rgba(168,85,247,0.08)"  icon={RefreshCw}    />
        <SumCard label="In Review"      value={summary.review}     color="#6366f1" bg="rgba(99,102,241,0.08)"  icon={Eye}          sub={`${summary.revision} revisions`} />
        <SumCard label="Received"       value={summary.received}   color="#22c55e" bg="rgba(34,197,94,0.08)"   icon={CheckCircle2} />
        <SumCard label="Published"      value={summary.published}  color="#10b981" bg="rgba(16,185,129,0.08)"  icon={ExternalLink} />
        <SumCard label="Overdue"        value={summary.overdue}    color="#ef4444" bg="rgba(239,68,68,0.08)"   icon={Clock}        />
        <SumCard label="Total Cost"     value={`৳${summary.totalCost.toLocaleString()}`} color="#f59e0b" bg="rgba(245,158,11,0.08)" icon={DollarSign} />
      </div>

      {/* ── Filter Bar ── */}
      <AnimatePresence>
        {showFilters && (
          <motion.div className="cp-filter-bar" initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}>
            <div className="cp-filter-inner">
              <div className="cp-filter-field">
                <label>Status</label>
                <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
                  <option value="">All Statuses</option>
                  {WORKFLOW_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="cp-filter-field">
                <label>Content Type</label>
                <select value={filters.type} onChange={e => setFilters(p => ({ ...p, type: e.target.value }))}>
                  <option value="">All Types</option>
                  {['UGC','Lifestyle','Review','Demo','Hook','Voice Over','Image','Reel','Carousel','Tutorial','Unboxing','Testimonial'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="cp-filter-field">
                <label>Platform</label>
                <select value={filters.platform} onChange={e => setFilters(p => ({ ...p, platform: e.target.value }))}>
                  <option value="">All Platforms</option>
                  {['Facebook','Instagram','TikTok','YouTube','Website'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="cp-filter-field">
                <label>Priority</label>
                <select value={filters.priority} onChange={e => setFilters(p => ({ ...p, priority: e.target.value }))}>
                  <option value="">All</option>
                  <option>High</option><option>Medium</option><option>Low</option>
                </select>
              </div>
              <div className="cp-filter-field">
                <label>Assigned To</label>
                <input type="text" placeholder="Name…" value={filters.assignedTo}
                  onChange={e => setFilters(p => ({ ...p, assignedTo: e.target.value }))} />
              </div>
              <div className="cp-filter-field">
                <label>Model / Creator</label>
                <input type="text" placeholder="Name…" value={filters.model}
                  onChange={e => setFilters(p => ({ ...p, model: e.target.value }))} />
              </div>
              <button className="cp-filter-clear" onClick={() => setFilters({ status:'',type:'',platform:'',priority:'',assignedTo:'',model:'' })}>
                <X size={13} /> Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content Table ── */}
      <div className="dm-card-section-elite">
        <div className="dm-section-header">
          <div className="dm-header-title-group">
            <h3>Content Production Board</h3>
            <p>{filteredPlans.length} item{filteredPlans.length !== 1 ? 's' : ''} {activeFilters > 0 ? '(filtered)' : ''}</p>
          </div>
          <div className="cp-search-wrap">
            <Search size={14} className="cp-search-icon" />
            <input className="cp-search-input" type="text" placeholder="Search by title, product, assignee…"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            {searchQuery && <button className="cp-search-clear" onClick={() => setSearchQuery('')}><X size={12}/></button>}
          </div>
        </div>

        {loading ? (
          <div className="board-loading-container">
            <RefreshCw className="animate-spin" size={30} style={{ color:'var(--dm-accent)' }} />
            <p>Loading content production data…</p>
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="board-empty-state">
            <Layers size={48} className="empty-state-icon" />
            <h3>{plans.length === 0 ? `No content planned for ${selectedMonth}` : 'No items match your filters'}</h3>
            <p>{plans.length === 0 ? 'Start by adding your first content item.' : 'Try adjusting the filters or search query.'}</p>
            {plans.length === 0 && (
              <button className="dm-btn-add-campaign" style={{ marginTop:12 }}
                onClick={() => { setEditItem(null); setShowAddModal(true); }}>
                <Plus size={15} /> Add First Item
              </button>
            )}
          </div>
        ) : (
          <div className="planning-table-wrapper">
            <table className="planning-grid-table cp-production-table">
              <thead>
                <tr>
                  <th className="sticky-col">Product / Title</th>
                  <th>Type</th>
                  <th>Platform</th>
                  <th className="cp-th-center">Qty</th>
                  <th>Model</th>
                  <th>Assigned To</th>
                  <th>Shoot Date</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th className="cp-th-progress">Progress</th>
                  <th className="cp-th-center">Recv</th>
                  <th>Drive</th>
                  <th className="cp-th-right">Cost</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlans.map(plan => {
                  const isOD = isOverdue(plan);
                  const cost = computeCost(plan);
                  return (
                    <tr
                      key={plan.id}
                      className={`cp-table-row ${isOD ? 'cp-row-overdue' : ''} ${drawerItem?.id === plan.id ? 'cp-row-selected' : ''}`}
                      onClick={() => openDrawer(plan)}
                    >
                      {/* Product / Title */}
                      <td className="sticky-col product-cell" style={{ cursor:'pointer' }}>
                        <strong className="cell-product-name">{plan.content_title || plan.product_name}</strong>
                        {plan.content_title && <span className="cp-product-sub">{plan.product_name}</span>}
                        {plan.priority && (
                          <span className="cp-priority-dot" style={{ background: priorityColor(plan.priority) }} title={plan.priority} />
                        )}
                      </td>

                      {/* Type */}
                      <td><span className="cp-type-tag">{plan.content_type || '—'}</span></td>

                      {/* Platform */}
                      <td><span className="cp-platform-tag">{plan.platform || '—'}</span></td>

                      {/* Qty */}
                      <td className="cp-th-center"><span className="cell-value font-bold">{plan.content_needed || 1}</span></td>

                      {/* Model */}
                      <td><span className="cp-crew-tag">{plan.model_creator || '—'}</span></td>

                      {/* Assigned To */}
                      <td>
                        {plan.assigned_to
                          ? <span className="cp-assigned-chip"><User size={10}/> {plan.assigned_to}</span>
                          : <span className="cell-value" style={{ color:'var(--dm-text-muted)' }}>—</span>}
                      </td>

                      {/* Shoot Date */}
                      <td><span className="cp-date-tag">{fmt(plan.shoot_date)}</span></td>

                      {/* Deadline */}
                      <td>
                        <span className={`cp-date-tag ${isOD ? 'cp-date-overdue' : ''}`}>
                          {fmt(plan.delivery_deadline)}
                          {isOD && <Clock size={10} style={{ marginLeft:3 }} />}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td onClick={e => e.stopPropagation()}>
                        <div className="cp-status-cell">
                          <StatusBadge status={plan.workflow_status || 'Planning'} size="sm" />
                          <div className="cp-status-dropdown">
                            <button className="cp-status-arrow"><ChevronDown size={10}/></button>
                            <div className="cp-status-menu">
                              {WORKFLOW_STAGES.map(s => (
                                <button key={s} className={`cp-status-menu-item ${plan.workflow_status === s ? 'active' : ''}`}
                                  style={{ color: STATUS_CONFIG[s]?.color }}
                                  onClick={() => handleStatusChange(plan.id, s)}>{s}</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="cp-th-progress">
                        <MiniProgress status={plan.workflow_status || 'Planning'} />
                      </td>

                      {/* Received */}
                      <td className="cp-th-center">
                        {plan.content_received
                          ? <CheckCircle2 size={16} color="#22c55e" />
                          : <span style={{ color:'var(--dm-text-muted)', fontSize:'0.7rem' }}>No</span>}
                      </td>

                      {/* Drive Link */}
                      <td onClick={e => e.stopPropagation()}>
                        {plan.drive_folder
                          ? <a href={plan.drive_folder} target="_blank" rel="noreferrer" className="cp-drive-link">
                              <ExternalLink size={12}/> Drive
                            </a>
                          : plan.final_export_link
                          ? <a href={plan.final_export_link} target="_blank" rel="noreferrer" className="cp-drive-link cp-drive-export">
                              <ExternalLink size={12}/> Export
                            </a>
                          : <span style={{ color:'var(--dm-text-muted)', fontSize:'0.72rem' }}>—</span>}
                      </td>

                      {/* Cost */}
                      <td className="cp-th-right">
                        <strong className="total-cost-amount">{cost > 0 ? `৳${cost.toLocaleString()}` : '—'}</strong>
                      </td>

                      {/* Actions */}
                      <td className="actions-col" onClick={e => e.stopPropagation()}>
                        <div className="row-action-flex">
                          <button className="btn-action-round edit" title="Edit" onClick={() => openEdit(plan)}><Edit2 size={13}/></button>
                          <button className="btn-action-round delete" title="Delete" onClick={() => handleDelete(plan)}><Trash2 size={13}/></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detail Drawer ── */}
      <AnimatePresence>
        {drawerItem && (
          <ContentDetailDrawer
            item={drawerItem}
            activityLogs={activityLogs[drawerItem.id] || []}
            onClose={() => setDrawerItem(null)}
            onStatusChange={handleStatusChange}
            onEdit={() => openEdit(drawerItem)}
          />
        )}
      </AnimatePresence>

      {/* ── Add / Edit Modal ── */}
      <AnimatePresence>
        {showAddModal && (
          <ContentAddEditModal
            item={editItem}
            inventoryProducts={inventoryProducts}
            onSave={handleSaveItem}
            onClose={() => { setShowAddModal(false); setEditItem(null); }}
            loading={actionLoading}
          />
        )}
      </AnimatePresence>

      {/* ── Risk Confirmation Modal ── */}
      <AnimatePresence>
        {riskModal.isOpen && (
          <div className="risk-modal-overlay">
            <motion.div initial={{ scale:0.95, opacity:0 }} animate={{ scale:1, opacity:1 }} exit={{ scale:0.95, opacity:0 }} className="risk-modal-card">
              <div className="risk-header">
                <AlertTriangle className="risk-icon" size={22} />
                <h3>{riskModal.title}</h3>
              </div>
              <div className="risk-body">
                <p className="risk-desc">{riskModal.message}</p>
              </div>
              <div className="risk-actions">
                <button onClick={riskModal.onCancel}  className="risk-btn cancel">Cancel</button>
                <button onClick={riskModal.onConfirm} className="risk-btn confirm">
                  <Check size={13}/> Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
