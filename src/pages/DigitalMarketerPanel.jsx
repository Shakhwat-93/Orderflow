import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Megaphone, Plus, Trash2, Send, TrendingUp, DollarSign,
  ShoppingBag, BarChart2, Calendar, ChevronDown, Check,
  Clock, AlertCircle, Eye, Loader2, RefreshCw
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
    <div className="dm-stat-icon" style={{ background: `${color}15`, color }}>
      <Icon size={20} />
    </div>
    <div className="dm-stat-content">
      <p className="dm-stat-label">{label}</p>
      <p className="dm-stat-value">{value}</p>
      {sub && <p className="dm-stat-sub">{sub}</p>}
    </div>
  </div>
);

const EmptyState = ({ message }) => (
  <div className="dm-empty">
    <Megaphone size={40} />
    <p>{message}</p>
  </div>
);

// ── Campaign Row Component ──
const CampaignRow = ({ row, index, onChange, onDelete, disabled }) => {
  const [platformOpen, setPlatformOpen] = useState(false);

  return (
    <div className="dm-campaign-row">
      <div className="dm-row-index">{index + 1}</div>

      <div className="dm-row-fields">
        <input
          className="dm-input"
          placeholder="Campaign Name"
          value={row.campaign_name}
          onChange={(e) => onChange('campaign_name', e.target.value)}
          disabled={disabled}
        />

        {/* Platform custom dropdown */}
        <div className="dm-platform-select-wrapper">
          <button
            type="button"
            className="dm-platform-btn"
            onClick={() => setPlatformOpen(p => !p)}
            disabled={disabled}
            style={{ borderLeft: `3px solid ${PLATFORM_COLORS[row.platform] || '#6b7280'}` }}
          >
            <span>{row.platform || 'Platform'}</span>
            <ChevronDown size={14} />
          </button>
          {platformOpen && (
            <div className="dm-platform-dropdown">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={`dm-platform-option ${row.platform === p ? 'active' : ''}`}
                  style={{ '--p-color': PLATFORM_COLORS[p] }}
                  onClick={() => { onChange('platform', p); setPlatformOpen(false); }}
                >
                  <span className="dm-platform-dot" style={{ background: PLATFORM_COLORS[p] }}></span>
                  {p}
                  {row.platform === p && <Check size={12} className="dm-check" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          className="dm-input"
          placeholder="Product Name"
          value={row.product_name}
          onChange={(e) => onChange('product_name', e.target.value)}
          disabled={disabled}
        />

        <div className="dm-input dm-input-prefix">
          <span>$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={row.spend}
            onChange={(e) => onChange('spend', parseFloat(e.target.value) || 0)}
            disabled={disabled}
          />
        </div>

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
      </div>

      {!disabled && (
        <button type="button" className="dm-delete-row-btn" onClick={onDelete}>
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};

// ── Main Component ──
export const DigitalMarketerPanel = () => {
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();

  const [activeTab, setActiveTab] = useState('daily');
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

  const todayStr = new Date().toISOString().split('T')[0];
  const isSubmitted = todayReport?.status === 'submitted';

  // ── Fetch today's report ──
  const fetchTodayReport = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: report } = await supabase
        .from('ads_reports')
        .select('*')
        .eq('report_date', todayStr)
        .eq('submitted_by', user.id)
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
  }, [user, todayStr]);

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

      if (!isAdmin) query.eq('submitted_by', user.id);

      const { data } = await query;
      setHistoryReports(data || []);
    } finally {
      setHistoryLoading(false);
    }
  }, [isAdmin, user]);

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
        .update({ status: 'submitted', total_spend: totalSpend, total_orders: totalOrders })
        .eq('id', todayReport.id);
      setTodayReport(prev => ({ ...prev, status: 'submitted' }));
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
      <div className="dm-header">
        <div className="dm-header-left">
          <div className="dm-header-icon">
            <Megaphone size={24} />
          </div>
          <div>
            <h1>Digital Marketing Hub</h1>
            <p>Track daily ad spend, campaigns, and performance</p>
          </div>
        </div>
        <div className="dm-header-right">
          <div className="dm-date-badge">
            <Calendar size={14} />
            {formatDate(todayStr)}
          </div>
          {isSubmitted ? (
            <div className="dm-status-submitted"><Check size={14} /> Submitted</div>
          ) : (
            <div className="dm-status-draft"><Clock size={14} /> Draft</div>
          )}
        </div>
      </div>

      {/* ── Live Summary Stats ── */}
      <div className="dm-top-stats">
        <StatCard
          icon={DollarSign}
          label="Total Spend Today"
          value={formatCurrency(totalSpend)}
          color="#124af0"
          sub={`${campaigns.length} campaign${campaigns.length !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={ShoppingBag}
          label="Orders Generated"
          value={totalOrders.toLocaleString()}
          color="#10b981"
          sub="Across all campaigns"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg. Cost Per Order"
          value={avgCPO > 0 ? formatCurrency(avgCPO) : '—'}
          color="#f59e0b"
          sub="Spend ÷ Orders"
        />
        <StatCard
          icon={BarChart2}
          label="Total Impressions"
          value={campaigns.reduce((s, c) => s + (parseInt(c.impressions) || 0), 0).toLocaleString()}
          color="#8b5cf6"
          sub="Across all campaigns"
        />
      </div>

      {/* ── Tabs ── */}
      <div className="dm-tabs-bar">
        {[
          { key: 'daily', label: "Today's Report", icon: Calendar },
          { key: 'summary', label: 'Campaign Summary', icon: BarChart2 },
          ...(isAdmin ? [{ key: 'history', label: 'All Reports', icon: Eye }] : [{ key: 'history', label: 'My History', icon: Eye }]),
        ].map(tab => (
          <button
            key={tab.key}
            className={`dm-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {/* ── DAILY REPORT TAB ── */}
        {activeTab === 'daily' && (
          <motion.div
            key="daily"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <div className="dm-loading"><Loader2 size={24} className="dm-spinner" /> Loading today's report...</div>
            ) : (
              <>
                {/* Campaign Table */}
                <div className="dm-section">
                  <div className="dm-section-header">
                    <h3>Campaign Entries</h3>
                    {!isSubmitted && (
                      <button className="dm-add-row-btn" onClick={addRow}>
                        <Plus size={16} /> Add Campaign
                      </button>
                    )}
                  </div>

                  {/* Column Headers */}
                  {campaigns.length > 0 && (
                    <div className="dm-table-header">
                      <span>#</span>
                      <span>Campaign</span>
                      <span>Platform</span>
                      <span>Product</span>
                      <span>Spend</span>
                      <span>Orders</span>
                      <span>Impressions</span>
                      <span>CPO</span>
                    </div>
                  )}

                  <div className="dm-campaigns-list">
                    <AnimatePresence>
                      {campaigns.map((row, i) => (
                        <motion.div
                          key={row.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ delay: i * 0.03 }}
                        >
                          <CampaignRow
                            key={row.id}
                            row={row}
                            index={i}
                            onChange={(field, val) => updateRow(i, field, val)}
                            onDelete={() => deleteRow(i)}
                            disabled={isSubmitted}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {campaigns.length === 0 && (
                      <EmptyState message={isSubmitted ? "No campaigns were entered for today." : "Click 'Add Campaign' to start logging your ad spend."} />
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="dm-section">
                  <h3>Daily Notes</h3>
                  <textarea
                    className="dm-notes-textarea"
                    placeholder="Add notes about today's campaigns, anomalies, strategies..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    disabled={isSubmitted}
                  />
                </div>

                {/* Action Buttons */}
                {!isSubmitted && (
                  <div className="dm-actions">
                    <button
                      className="dm-save-btn"
                      onClick={saveReport}
                      disabled={saving || campaigns.length === 0}
                    >
                      {saving ? <Loader2 size={16} className="dm-spinner" /> : <RefreshCw size={16} />}
                      {saving ? 'Saving...' : 'Save Draft'}
                    </button>

                    <button
                      className="dm-submit-btn"
                      onClick={async () => { await saveReport(); await submitReport(); }}
                      disabled={submitting || saving || campaigns.length === 0}
                    >
                      {submitting ? <Loader2 size={16} className="dm-spinner" /> : <Send size={16} />}
                      {submitting ? 'Submitting...' : 'Submit Day\'s Report'}
                    </button>
                  </div>
                )}

                {isSubmitted && (
                  <div className="dm-submitted-banner">
                    <Check size={18} />
                    <span>This report has been submitted for <strong>{formatDate(todayStr)}</strong>. No further changes can be made.</span>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* ── SUMMARY TAB ── */}
        {activeTab === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {campaigns.length === 0 ? (
              <EmptyState message="No campaign data yet. Add campaigns in Today's Report tab." />
            ) : (
              <div className="dm-section">
                <h3>Campaign Performance Breakdown</h3>
                <div className="dm-summary-table">
                  <div className="dm-summary-header">
                    <span>Campaign</span>
                    <span>Platform</span>
                    <span>Product</span>
                    <span>Spend</span>
                    <span>Orders</span>
                    <span>CPO</span>
                    <span>Impressions</span>
                    <span>ROI %</span>
                  </div>
                  {campaigns.map((c) => {
                    const cpo = c.orders_received > 0 ? c.spend / c.orders_received : 0;
                    const roi = c.spend > 0 ? ((c.orders_received * 1) / c.spend * 100) : 0; // simplified ROI
                    return (
                      <div key={c.id} className="dm-summary-row">
                        <span className="dm-summary-name">{c.campaign_name}</span>
                        <span>
                          <span className="dm-platform-pill" style={{ background: `${PLATFORM_COLORS[c.platform]}15`, color: PLATFORM_COLORS[c.platform] }}>
                            {c.platform}
                          </span>
                        </span>
                        <span>{c.product_name}</span>
                        <span className="dm-summary-spend">{formatCurrency(c.spend)}</span>
                        <span>{c.orders_received}</span>
                        <span className={`dm-cpo-cell ${cpo > 10 ? 'high' : 'ok'}`}>{cpo > 0 ? formatCurrency(cpo) : '—'}</span>
                        <span>{(c.impressions || 0).toLocaleString()}</span>
                        <span className="dm-roi">{roi.toFixed(1)}%</span>
                      </div>
                    );
                  })}

                  {/* Totals row */}
                  <div className="dm-summary-totals">
                    <span>Total</span>
                    <span></span>
                    <span></span>
                    <span>{formatCurrency(totalSpend)}</span>
                    <span>{totalOrders}</span>
                    <span>{avgCPO > 0 ? formatCurrency(avgCPO) : '—'}</span>
                    <span>{campaigns.reduce((s, c) => s + (c.impressions || 0), 0).toLocaleString()}</span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {historyLoading ? (
              <div className="dm-loading"><Loader2 size={24} className="dm-spinner" /> Loading reports...</div>
            ) : historyReports.length === 0 ? (
              <EmptyState message="No submitted reports found." />
            ) : (
              <div className="dm-section">
                <h3>{isAdmin ? 'All Submitted Reports' : 'My Submitted Reports'}</h3>
                <div className="dm-history-list">
                  {historyReports.map((report) => (
                    <div key={report.id} className="dm-history-card">
                      <div
                        className="dm-history-card-header"
                        onClick={() => loadHistoryCampaigns(report.id)}
                      >
                        <div className="dm-history-left">
                          <Calendar size={16} />
                          <span className="dm-history-date">{formatDate(report.report_date)}</span>
                          {isAdmin && (
                            <span className="dm-history-author">{report.submitted_by_name}</span>
                          )}
                        </div>
                        <div className="dm-history-right">
                          <span className="dm-history-stat"><DollarSign size={12} /> {formatCurrency(report.total_spend)}</span>
                          <span className="dm-history-stat"><ShoppingBag size={12} /> {report.total_orders} orders</span>
                          <span className={`dm-history-status ${report.status}`}>{report.status}</span>
                          <ChevronDown
                            size={16}
                            className={`dm-history-chevron ${expandedHistory === report.id ? 'open' : ''}`}
                          />
                        </div>
                      </div>

                      <AnimatePresence>
                        {expandedHistory === report.id && historyCampaigns[report.id] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="dm-history-campaigns"
                          >
                            {historyCampaigns[report.id].length === 0 ? (
                              <p className="dm-history-empty">No campaign entries found.</p>
                            ) : (
                              <table className="dm-history-table">
                                <thead>
                                  <tr>
                                    <th>Campaign</th>
                                    <th>Platform</th>
                                    <th>Product</th>
                                    <th>Spend</th>
                                    <th>Orders</th>
                                    <th>CPO</th>
                                    <th>Impressions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {historyCampaigns[report.id].map(c => (
                                    <tr key={c.id}>
                                      <td>{c.campaign_name}</td>
                                      <td>
                                        <span className="dm-platform-pill" style={{ background: `${PLATFORM_COLORS[c.platform]}15`, color: PLATFORM_COLORS[c.platform] }}>
                                          {c.platform}
                                        </span>
                                      </td>
                                      <td>{c.product_name}</td>
                                      <td>{formatCurrency(c.spend)}</td>
                                      <td>{c.orders_received}</td>
                                      <td>{c.orders_received > 0 ? formatCurrency(c.spend / c.orders_received) : '—'}</td>
                                      <td>{(c.impressions || 0).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {report.notes && (
                              <div className="dm-history-notes">
                                <AlertCircle size={14} /> <em>{report.notes}</em>
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
