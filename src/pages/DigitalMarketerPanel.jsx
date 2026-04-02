import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { usePersistentState } from '../utils/persistentState';
import {
  Megaphone, Plus, Trash2, Send, TrendingUp, DollarSign,
  ShoppingBag, BarChart2, Calendar, ChevronDown, Check,
  Clock, AlertCircle, Eye, Loader2, RefreshCw, Edit2
} from 'lucide-react';
import './DigitalMarketerPanel.css';

const PLATFORMS = ['Facebook', 'Instagram', 'Google', 'TikTok', 'YouTube', 'Twitter', 'LinkedIn', 'Other'];

const PLATFORM_COLORS = {
  Facebook: '#1877f2',
  Instagram: '#e1306c',
  Google: '#4285f4',
  TikTok: '#ff0050',
  YouTube: '#ff0000',
  Twitter: '#1da1f2',
  LinkedIn: '#0a66c2',
  Other: '#6b7280',
};

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val ?? 0);

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

const StatCard = ({ icon: Icon, label, value, color, sub }) => (
  <div className="dm-stat-card">
    <div className="dm-stat-icon" style={{ background: `${color}12`, color }}>
      <Icon size={22} strokeWidth={2.5} />
    </div>
    <div className="dm-stat-content">
      <p className="dm-stat-label">{label}</p>
      <h4 className="dm-stat-value">{value}</h4>
      {sub && <p className="dm-stat-sub">{sub}</p>}
    </div>
  </div>
);

const EmptyState = ({ message }) => (
  <div className="dm-empty-elite">
    <div className="dm-empty-icon"><Megaphone size={32} /></div>
    <p>{message}</p>
  </div>
);

// ── Campaign Row Component ──
const CampaignRow = ({ row, index, onChange, onDelete, disabled }) => {
  const [platformOpen, setPlatformOpen] = useState(false);

  return (
    <div className="dm-campaign-row">
      <div className="dm-row-index">{index + 1}</div>

      <input
        className="dm-input"
        placeholder="Campaign Title"
        value={row.campaign_name}
        onChange={(e) => onChange('campaign_name', e.target.value)}
        disabled={disabled}
      />

      {/* Platform custom dropdown */}
      <div className="dm-platform-select-wrapper">
        <button
          type="button"
          className="dm-platform-btn shadow-sm"
          onClick={() => setPlatformOpen(p => !p)}
          disabled={disabled}
          style={{ borderLeft: `3px solid ${PLATFORM_COLORS[row.platform] || '#6b7280'}` }}
        >
          <span>{row.platform || 'Platform'}</span>
          <ChevronDown size={14} />
        </button>
        <AnimatePresence>
          {platformOpen && (
            <motion.div 
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="dm-platform-dropdown-elite"
            >
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`dm-platform-option-elite ${row.platform === p ? 'active' : ''}`}
                  onClick={() => { onChange('platform', p); setPlatformOpen(false); }}
                >
                  <span className="dm-platform-dot" style={{ background: PLATFORM_COLORS[p] }}></span>
                  {p}
                  {row.platform === p && <Check size={12} className="dm-check-icon" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input
        className="dm-input"
        placeholder="Focus Product"
        value={row.product_name}
        onChange={(e) => onChange('product_name', e.target.value)}
        disabled={disabled}
      />

      <input
        className="dm-input"
        type="number"
        min="0"
        step="0.01"
        placeholder="0.00"
        value={row.spend}
        onChange={(e) => onChange('spend', parseFloat(e.target.value) || 0)}
        disabled={disabled}
      />

      <input
        className="dm-input"
        type="number"
        min="0"
        placeholder="Orders"
        value={row.orders_received}
        onChange={(e) => onChange('orders_received', parseInt(e.target.value) || 0)}
        disabled={disabled}
      />

      <input
        className="dm-input"
        type="number"
        min="0"
        placeholder="Impressions"
        value={row.impressions}
        onChange={(e) => onChange('impressions', parseInt(e.target.value) || 0)}
        disabled={disabled}
      />

      {/* Auto CPO */}
      <div className="dm-cpo-badge">
        <span className="dm-cpo-label">CPO</span>
        <span className="dm-cpo-value">
          {row.orders_received > 0 ? formatCurrency(row.spend / row.orders_received) : '—'}
        </span>
      </div>

      {!disabled && (
        <button type="button" className="dm-delete-row-btn" onClick={onDelete}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
};

// ── Main Component ──
export const DigitalMarketerPanel = () => {
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();
  const userId = user?.id ?? null;

  const [activeTab, setActiveTab] = usePersistentState('panel:digital-marketer:tab', 'daily');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [todayReport, setTodayReport] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [notes, setNotes] = useState('');
  const [historyReports, setHistoryReports] = useState([]);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [historyCampaigns, setHistoryCampaigns] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isEditingSubmitted, setIsEditingSubmitted] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  
  // ── Locking Logic ──
  const reportCreatedAt = todayReport?.created_at ? new Date(todayReport.created_at) : null;
  const hoursSinceCreation = reportCreatedAt ? (new Date() - reportCreatedAt) / (1000 * 60 * 60) : 0;
  const isWithinGracePeriod = hoursSinceCreation < 24;
  const isSubmitted = todayReport?.status === 'submitted';
  const isLocked = isSubmitted && !isWithinGracePeriod;
  const canEdit = !isSubmitted || (isSubmitted && isWithinGracePeriod && isEditingSubmitted);

  // ── Fetch today's report ──
  const fetchTodayReport = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: report } = await supabase
        .from('ads_reports')
        .select('*')
        .eq('report_date', todayStr)
        .eq('submitted_by', userId)
        .maybeSingle();

      if (report) {
        setTodayReport(report);
        setNotes(report.notes || '');
        const { data: camps } = await supabase
          .from('ads_campaigns')
          .select('*')
          .eq('report_id', report.id)
          .order('created_at');
        setCampaigns(camps || []);
      } else {
        setTodayReport(null);
        setCampaigns([]);
        setNotes('');
      }
    } finally {
      setLoading(false);
    }
  }, [todayStr, userId]);

  // ── Fetch history ──
  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const query = supabase
        .from('ads_reports')
        .select('*')
        .eq('status', 'submitted')
        .order('report_date', { ascending: false })
        .limit(30);

      if (!isAdmin) query.eq('submitted_by', userId);

      const { data } = await query;
      setHistoryReports(data || []);
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    fetchTodayReport();
    updatePresenceContext?.('Digital Marketing Dashboard');
  }, [fetchTodayReport, updatePresenceContext]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
  }, [activeTab, fetchHistory]);

  // ── Live totals ──
  const totalSpend = campaigns.reduce((s, c) => s + (parseFloat(c.spend) || 0), 0);
  const totalOrders = campaigns.reduce((s, c) => s + (parseInt(c.orders_received) || 0), 0);
  const avgCPO = totalOrders > 0 ? totalSpend / totalOrders : 0;

  // ── Add empty campaign row ──
  const addRow = () => {
    setCampaigns(prev => [...prev, {
      _new: true,
      id: `new-${Date.now()}`,
      campaign_name: '',
      platform: 'Facebook',
      product_name: '',
      spend: 0,
      orders_received: 0,
      impressions: 0,
    }]);
  };

  // ── Update row field ──
  const updateRow = (index, field, value) => {
    setCampaigns(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  };

  // ── Delete row ──
  const deleteRow = async (index) => {
    const row = campaigns[index];
    if (!row._new && row.id) {
      await supabase.from('ads_campaigns').delete().eq('id', row.id);
    }
    setCampaigns(prev => prev.filter((_, i) => i !== index));
  };

  // ── Save (upsert) report & campaigns ──
  const saveReport = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let reportId = todayReport?.id;

      if (!reportId) {
        // Create the report
        const { data: newReport, error } = await supabase
          .from('ads_reports')
          .insert({
            report_date: todayStr,
            submitted_by: user.id,
            submitted_by_name: profile?.name || user.email,
            status: 'draft',
            notes,
            total_spend: totalSpend,
            total_orders: totalOrders,
          })
          .select()
          .single();
        if (error) throw error;
        reportId = newReport.id;
        setTodayReport(newReport);
      } else {
        // Update
        await supabase
          .from('ads_reports')
          .update({ notes, total_spend: totalSpend, total_orders: totalOrders })
          .eq('id', reportId);
      }

      // Upsert campaigns
      for (const camp of campaigns) {
        if (camp._new) {
          const { data: saved } = await supabase
            .from('ads_campaigns')
            .insert({
              report_id: reportId,
              campaign_name: camp.campaign_name || 'Unnamed',
              platform: camp.platform,
              product_name: camp.product_name || 'Unknown',
              spend: camp.spend,
              orders_received: camp.orders_received,
              impressions: camp.impressions,
            })
            .select()
            .single();
          // Replace temp row
          setCampaigns(prev => prev.map(c => c.id === camp.id ? saved : c));
        } else {
          await supabase
            .from('ads_campaigns')
            .update({
              campaign_name: camp.campaign_name,
              platform: camp.platform,
              product_name: camp.product_name,
              spend: camp.spend,
              orders_received: camp.orders_received,
              impressions: camp.impressions,
            })
            .eq('id', camp.id);
        }
      }
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Submit report ──
  const submitReport = async () => {
    if (!todayReport?.id) return;
    setSubmitting(true);
    try {
      await supabase
        .from('ads_reports')
        .update({ 
          status: 'submitted', 
          total_spend: totalSpend, 
          total_orders: totalOrders,
          updated_at: new Date().toISOString() 
        })
        .eq('id', todayReport.id);
      setTodayReport(prev => ({ ...prev, status: 'submitted' }));
      setIsEditingSubmitted(false);
    } catch (err) {
      console.error('Submit error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Load campaigns for a history report ──
  const loadHistoryCampaigns = async (reportId) => {
    if (historyCampaigns[reportId]) {
      setExpandedHistory(prev => prev === reportId ? null : reportId);
      return;
    }
    const { data } = await supabase.from('ads_campaigns').select('*').eq('report_id', reportId).order('created_at');
    setHistoryCampaigns(prev => ({ ...prev, [reportId]: data || [] }));
    setExpandedHistory(prev => prev === reportId ? null : reportId);
  };

  return (
    <div className="dm-panel">
      {/* ── Header ── */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="dm-header-elite"
      >
        <div className="dm-header-left">
          <div className="dm-header-icon-premium">
            <Megaphone size={22} strokeWidth={2.5} />
          </div>
          <div className="dm-header-text">
            <h1 className="dm-title-elite">Marketing Intelligence</h1>
            <p className="dm-subtitle-elite">Operational insights, daily spend and campaign ROI</p>
          </div>
        </div>
        <div className="dm-header-right-elite">
          <div className="dm-date-pill">
            <Calendar size={14} />
            <span>{formatDate(todayStr)}</span>
          </div>
          <motion.div 
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className={`dm-status-tag ${isSubmitted ? 'submitted' : 'draft'}`}
          >
            {isSubmitted ? <Check size={12} /> : <Clock size={12} />}
            {isSubmitted ? 'FINALIZED' : 'DRAFT'}
          </motion.div>
        </div>
      </motion.div>

      {/* ── Dashboard Stats Grid ── */}
      <motion.div 
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: { staggerChildren: 0.08 }
          }
        }}
        initial="hidden"
        animate="show"
        className="dm-stats-grid-elite"
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
          <StatCard
            icon={DollarSign}
            label="Total Spend Today"
            value={formatCurrency(totalSpend)}
            color="#6366f1"
            sub={`${campaigns.length} active campaigns`}
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
          <StatCard
            icon={ShoppingBag}
            label="Orders Generated"
            value={totalOrders.toLocaleString()}
            color="#10b981"
            sub="Across all channels"
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
          <StatCard
            icon={TrendingUp}
            label="Avg. Cost Per Order"
            value={avgCPO > 0 ? formatCurrency(avgCPO) : '—'}
            color="#f59e0b"
            sub="Direct ROI Efficiency"
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
          <StatCard
            icon={BarChart2}
            label="Daily Impressions"
            value={campaigns.reduce((s, c) => s + (parseInt(c.impressions) || 0), 0).toLocaleString()}
            color="#a855f7"
            sub="Organic & Paid Reach"
          />
        </motion.div>
      </motion.div>

      {/* ── Elite Tabs ── */}
      <div className="dm-tabs-container">
        {[
          { key: 'daily', label: "Daily Intelligence", icon: Calendar },
          { key: 'summary', label: 'ROI Analysis', icon: BarChart2 },
          ...(isAdmin ? [{ key: 'history', label: 'Global Archives', icon: Eye }] : [{ key: 'history', label: 'Personal History', icon: Eye }]),
        ].map(tab => (
          <button
            key={tab.key}
            className={`dm-premium-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Dashboard Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'daily' && (
          <motion.div
            key="daily"
            initial={{ opacity: 0, scale: 0.99 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.01 }}
            transition={{ duration: 0.25, ease: "circOut" }}
            className="dm-content-wrap"
          >
            {loading ? (
              <div className="dm-loading-state">
                <Loader2 size={24} className="dm-loader-spin" />
                <span>Aggregating daily metrics...</span>
              </div>
            ) : (
              <>
                <div className="dm-card-section-elite">
                  <div className="dm-section-header">
                    <div className="dm-header-title-group">
                      <h3>Campaign Entries</h3>
                      <p>Capture real-time performance data</p>
                    </div>
                    {canEdit && (
                      <button className="dm-btn-add-campaign" onClick={addRow}>
                        <Plus size={16} /> New Entry
                      </button>
                    )}
                  </div>

                  {campaigns.length > 0 ? (
                    <div className="dm-table-container-elite">
                      <div className="dm-table-header-elite">
                        <span className="col-idx">#</span>
                        <span className="col-camp">Campaign Title</span>
                        <span className="col-platform">Platform</span>
                        <span className="col-product">Product Focus</span>
                        <span className="col-metrics">Spend ($)</span>
                        <span className="col-metrics">Orders</span>
                        <span className="col-metrics">Reach</span>
                        <span className="col-cpo">CPO</span>
                      </div>

                      <div className="dm-campaigns-list">
                        <AnimatePresence initial={false}>
                          {campaigns.map((row, i) => (
                            <motion.div
                              key={row.id}
                              layout
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.2 }}
                            >
                              <CampaignRow
                                key={row.id}
                                row={row}
                                index={i}
                                onChange={(field, val) => updateRow(i, field, val)}
                                onDelete={() => deleteRow(i)}
                                disabled={!canEdit}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    <EmptyState message={isSubmitted ? "No records entered for today." : "System ready. Start logging your campaign data."} />
                  )}
                </div>

                <div className="dm-dual-section-grid">
                  <div className="dm-card-section-elite dm-notes-section">
                    <div className="dm-section-header">
                      <h3>Strategic Observations</h3>
                    </div>
                    <textarea
                      className="dm-elite-textarea"
                      placeholder="Input anomalies, strategies, or tomorrow's scaling plans..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      disabled={!canEdit}
                    />
                  </div>

                    <div className="dm-card-section-elite dm-actions-section">
                      <div className="dm-section-header">
                        <h3>Report Actions</h3>
                      </div>
                      <div className="dm-action-stack">
                        {(!isSubmitted || isEditingSubmitted) ? (
                          <>
                            <button
                              className="dm-btn-save-draft"
                              onClick={saveReport}
                              disabled={saving || campaigns.length === 0}
                            >
                              {saving ? <Loader2 size={16} className="dm-loader-spin" /> : <RefreshCw size={16} />}
                              {saving ? 'Syncing...' : 'Save Work Snapshot'}
                            </button>

                            <button
                              className="dm-btn-submit-final"
                              onClick={async () => { await saveReport(); await submitReport(); }}
                              disabled={submitting || saving || campaigns.length === 0}
                            >
                              {submitting ? <Loader2 size={16} className="dm-loader-spin" /> : <Send size={16} />}
                              {submitting ? 'Finalizing...' : isSubmitted ? 'Re-Submit Report' : 'Submit Final Intelligence'}
                            </button>
                          </>
                        ) : (
                          <div className="dm-edit-lock-info">
                            <Clock size={14} />
                            <span>Edit window active for {Math.max(0, (24 - hoursSinceCreation).toFixed(1))}h</span>
                          </div>
                        )}
                      </div>
                    </div>
                </div>

                {isSubmitted && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="dm-finalized-banner-elite"
                  >
                    <div className={`dm-banner-icon ${isLocked ? 'locked' : ''}`}>
                      {isLocked ? <AlertCircle size={20} /> : <Check size={20} />}
                    </div>
                    <div className="dm-banner-text">
                      <strong>Report {isLocked ? 'Locked' : 'Synchronized'}</strong>
                      <span>
                        {isLocked 
                          ? `Archives for ${formatDate(todayStr)} are permanently locked.` 
                          : `Campaign intel for ${formatDate(todayStr)} is archived.`}
                      </span>
                    </div>
                    {isWithinGracePeriod && !isEditingSubmitted && (
                      <button className="dm-btn-unlock-edit" onClick={() => setIsEditingSubmitted(true)}>
                        <Edit2 size={14} /> Unlock for Modification
                      </button>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── SUMMARY & HISTORY TABS TBD ── */}
        {activeTab === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="dm-content-wrap"
          >
            {campaigns.length === 0 ? (
              <EmptyState message="ROI Data unavailable. Populate the daily report to proceed." />
            ) : (
              <div className="dm-card-section-elite">
                <div className="dm-section-header">
                  <h3>ROI Performance Breakdown</h3>
                </div>
                <div className="dm-summary-table-elite">
                  <div className="dm-summary-thead">
                    <span>Performance Name</span>
                    <span>Platform</span>
                    <span>Focus</span>
                    <span>Allocation</span>
                    <span>Conversions</span>
                    <span>CPO Rank</span>
                    <span>RoS %</span>
                  </div>
                  {campaigns.map((c) => {
                    const cpo = c.orders_received > 0 ? c.spend / c.orders_received : 0;
                    const roi = c.spend > 0 ? ((c.orders_received * 1) / c.spend * 100) : 0;
                    return (
                      <div key={c.id} className="dm-summary-row-elite">
                        <span className="col-name">{c.campaign_name}</span>
                        <span className="col-pf">
                          <span className="dm-pf-pill" style={{ background: `${PLATFORM_COLORS[c.platform]}18`, color: PLATFORM_COLORS[c.platform] }}>
                            {c.platform}
                          </span>
                        </span>
                        <span className="col-prod">{c.product_name}</span>
                        <span className="col-spend-val">{formatCurrency(c.spend)}</span>
                        <span className="col-conv-val">{c.orders_received}</span>
                        <span className={`col-cpo-val ${cpo > 12 ? 'poor' : 'elite'}`}>{cpo > 0 ? formatCurrency(cpo) : '—'}</span>
                        <span className="col-roi-val">{roi.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                  <div className="dm-summary-footer-elite">
                    <span>Total Intelligence Aggregate</span>
                    <span></span>
                    <span></span>
                    <span>{formatCurrency(totalSpend)}</span>
                    <span>{totalOrders}</span>
                    <span>{avgCPO > 0 ? formatCurrency(avgCPO) : '—'}</span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="dm-content-wrap"
          >
            {historyLoading ? (
              <div className="dm-loading-state"><Loader2 size={24} className="dm-loader-spin" /><span>Fetching historical archives...</span></div>
            ) : historyReports.length === 0 ? (
              <EmptyState message="No archived reports found." />
            ) : (
              <div className="dm-card-section-elite">
                <div className="dm-section-header">
                  <h3>{isAdmin ? 'Global Campaign Archives' : 'Strategic Activity History'}</h3>
                </div>
                <div className="dm-history-timeline">
                  {historyReports.map((report) => (
                    <div key={report.id} className="dm-history-item-elite">
                      <div
                        className={`dm-history-item-header ${expandedHistory === report.id ? 'active' : ''}`}
                        onClick={() => loadHistoryCampaigns(report.id)}
                      >
                        <div className="dm-history-item-meta">
                          <div className="dm-calendar-box"><Calendar size={14} /></div>
                          <span className="dm-h-date">{formatDate(report.report_date)}</span>
                          {isAdmin && <span className="dm-h-author">{report.submitted_by_name}</span>}
                        </div>
                        <div className="dm-history-item-stats">
                          <span className="stat-pill"><DollarSign size={11} /> {formatCurrency(report.total_spend)}</span>
                          <span className="stat-pill"><ShoppingBag size={11} /> {report.total_orders} Orders</span>
                          <ChevronDown size={16} className={`dm-h-chevron ${expandedHistory === report.id ? 'open' : ''}`} />
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedHistory === report.id && historyCampaigns[report.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="dm-history-item-details"
                          >
                            <table className="dm-history-table-elite">
                              <thead>
                                <tr>
                                  <th>Campaign Title</th>
                                  <th>Platform</th>
                                  <th>Spend</th>
                                  <th>Orders</th>
                                  <th>CPO Rank</th>
                                </tr>
                              </thead>
                              <tbody>
                                {historyCampaigns[report.id].map(c => (
                                  <tr key={c.id}>
                                    <td>{c.campaign_name}</td>
                                    <td>
                                      <span className="dm-pf-mini" style={{ color: PLATFORM_COLORS[c.platform] }}>{c.platform}</span>
                                    </td>
                                    <td>{formatCurrency(c.spend)}</td>
                                    <td>{c.orders_received}</td>
                                    <td>{c.orders_received > 0 ? formatCurrency(c.spend / c.orders_received) : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {report.notes && (
                              <div className="dm-history-item-notes">
                                <AlertCircle size={13} />
                                <span>{report.notes}</span>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
