import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { Card } from '../components/Card';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { CreateTaskOverlay } from '../components/CreateTaskOverlay';
import { usePersistentState } from '../utils/persistentState';
import {
  ClipboardList, CheckCircle2, Check, Circle, Plus, Calendar, Clock,
  AlertTriangle, User, Users, Zap, ListChecks, Target, Filter,
  ChevronRight, Loader2, Search, List, Kanban, TrendingUp, Activity,
  ShieldCheck, MoreHorizontal, ChevronDown, ArrowUpRight, Briefcase,
  FileText, FolderOpen, Star, AlertCircle, Award, CheckSquare, Square,
  TrendingDown, Send, X, Mail, Sparkles
} from 'lucide-react';
import './TaskBoard.css';

// ── Priority config ──────────────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  urgent: { color: '#ef4444', label: 'Urgent',  bg: 'rgba(239,68,68,0.1)'  },
  high:   { color: '#f97316', label: 'High',    bg: 'rgba(249,115,22,0.1)' },
  medium: { color: '#6366f1', label: 'Medium',  bg: 'rgba(99,102,241,0.1)' },
  low:    { color: '#94a3b8', label: 'Low',     bg: 'rgba(148,163,184,0.1)'},
};

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: '#f59e0b', bg: 'rgba(245,158,11,0.12)'  },
  in_progress: { label: 'In Progress', color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  completed:   { label: 'Completed',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)'  },
};

// ── Smart date helper for "due" display ──────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

// ── Metric Card ──────────────────────────────────────────────────────────────
const MetricCard = ({ label, value, icon: Icon, accent, trend }) => (
  <div className="tb-metric-card">
    <div className="tb-metric-top">
      <div className="tb-metric-icon" style={{ background: `${accent}18`, color: accent }}>
        <Icon size={18} />
      </div>
      {trend && (
        <span className="tb-metric-trend" style={{ color: accent }}>
          <ArrowUpRight size={13} /> {trend}
        </span>
      )}
    </div>
    <div className="tb-metric-value">{value}</div>
    <div className="tb-metric-label">{label}</div>
  </div>
);

// ── Task Row (Today's Tasks table) ───────────────────────────────────────────
const TaskRow = ({ task, onView, onStatusUpdate }) => {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const s = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const progressPct = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 50 : 0;
  const progressColor = task.status === 'completed' ? '#22c55e' : task.status === 'in_progress' ? '#6366f1' : '#f59e0b';

  return (
    <tr className="tb-task-row" onClick={() => onView(task)}>
      <td className="tb-td">
        <div className="tb-task-name-cell">
          <span className="tb-task-color-dot" style={{ background: p.color }} />
          <span className="tb-task-title">{task.title}</span>
        </div>
      </td>
      <td className="tb-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="tb-owner-av" style={{ width: '22px', height: '22px', fontSize: '0.65rem' }}>
            {task.assigned_to_name ? task.assigned_to_name.charAt(0).toUpperCase() : '?'}
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
            {task.assigned_to_name || 'Unassigned'}
          </span>
        </div>
      </td>
      <td className="tb-td">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="tb-owner-av" style={{ width: '22px', height: '22px', fontSize: '0.65rem', background: '#94a3b8' }}>
            {task.assigned_by_name ? task.assigned_by_name.charAt(0).toUpperCase() : 'S'}
          </div>
          <span style={{ fontSize: '0.8rem', color: 'var(--tb-text-sub)' }}>
            {task.assigned_by_name || 'System'}
          </span>
        </div>
      </td>
      <td className="tb-td">
        <span className="tb-date-text">{fmtDate(task.due_date)}</span>
      </td>
      <td className="tb-td" onClick={(e) => e.stopPropagation()}>
        <select
          className="tb-kanban-status-select"
          value={task.status}
          onChange={(e) => onStatusUpdate(task.id, e.target.value)}
          style={{
            background: s.bg,
            color: s.color,
            border: 'none',
            borderRadius: '6px',
            padding: '4px 8px',
            fontWeight: 'bold',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="pending" style={{ background: 'var(--tb-card)', color: 'var(--tb-text)' }}>Pending</option>
          <option value="in_progress" style={{ background: 'var(--tb-card)', color: 'var(--tb-text)' }}>In Progress</option>
          <option value="completed" style={{ background: 'var(--tb-card)', color: 'var(--tb-text)' }}>Completed</option>
        </select>
      </td>
      <td className="tb-td">
        <div className="tb-progress-wrap" style={{ minWidth: '90px' }}>
          <div className="tb-progress-bar" style={{ height: '4px' }}>
            <div className="tb-progress-fill" style={{ width: `${progressPct}%`, background: progressColor }} />
          </div>
          <span className="tb-progress-pct" style={{ fontSize: '0.7rem' }}>{progressPct}%</span>
        </div>
      </td>
    </tr>
  );
};

// ── Project Row (List Projects table) ───────────────────────────────────────
const ProjectRow = ({ project }) => {
  const s = STATUS_CONFIG[project.status] || STATUS_CONFIG.pending;
  const pct = project.progress ?? 0;
  return (
    <tr className="tb-task-row">
      <td className="tb-td">
        <div className="tb-task-name-cell">
          <div className="tb-proj-icon"><Briefcase size={13} /></div>
          <span className="tb-task-title">{project.name}</span>
        </div>
      </td>
      <td className="tb-td">
        <span className="tb-status-badge" style={{ background: s.bg, color: s.color }}>
          {s.label}
        </span>
      </td>
      <td className="tb-td">
        <div className="tb-progress-wrap">
          <div className="tb-progress-bar">
            <div className="tb-progress-fill" style={{ width: `${pct}%`, background: s.color }} />
          </div>
          <span className="tb-progress-pct">{pct}%</span>
        </div>
      </td>
      <td className="tb-td"><span className="tb-date-text">{project.tasks ?? '—'}</span></td>
      <td className="tb-td"><span className="tb-date-text">{fmtDate(project.due_date)}</span></td>
      <td className="tb-td">
        <div className="tb-owner-chip">
          <div className="tb-owner-av">{(project.owner ?? 'U').charAt(0)}</div>
          <span>{project.owner ?? 'Unassigned'}</span>
        </div>
      </td>
    </tr>
  );
};

// ── Kanban Column ────────────────────────────────────────────────────────────
const KanbanColumn = ({ title, tasks, color, onView, onStatusUpdate }) => (
  <div className="tb-kanban-col">
    <div className="tb-kanban-col-header">
      <span className="tb-kanban-col-dot" style={{ background: color }} />
      <span className="tb-kanban-col-title">{title}</span>
      <span className="tb-kanban-col-count">{tasks.length}</span>
    </div>
    <div className="tb-kanban-col-body">
      <AnimatePresence mode="popLayout">
        {tasks.map((task) => {
          const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
          const assignedInitials = task.assigned_to_name ? task.assigned_to_name.charAt(0).toUpperCase() : '?';
          return (
            <motion.div
              key={task.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="tb-kanban-card"
              onClick={() => onView(task)}
            >
              <div className="tb-kanban-card-priority" style={{ color: p.color, background: p.bg }}>
                {p.label}
              </div>
              <div className="tb-kanban-card-title">{task.title}</div>
              <div className="tb-kanban-card-meta">
                <span className="tb-kanban-av" title={`Assigned to: ${task.assigned_to_name || 'Unassigned'}`}>
                  {assignedInitials}
                </span>
                <select
                  className="tb-kanban-status-select"
                  value={task.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onStatusUpdate(task.id, e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">Active</option>
                  <option value="completed">Done</option>
                </select>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  </div>
);

// ── Avatar color palette ──────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#6366f1','#f97316','#22c55e','#06b6d4','#ec4899','#a855f7','#eab308','#14b8a6'
];
const getAvatarColor = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

// ── UserCard ──────────────────────────────────────────────────────────────
const UserCard = ({ member, onClick }) => {
  const color = getAvatarColor(member.name);
  const completionPct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
  const primaryRole = member.roles?.[0] || 'Staff';
  const activeTasks = member.pending + member.inProgress;

  return (
    <motion.div
      className="uc-card"
      onClick={() => onClick(member)}
      whileHover={{ y: -6, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
    >
      {/* Glow blob */}
      <div className="uc-card-glow" style={{ background: color }} />

      {/* Avatar */}
      <div className="uc-avatar-wrap">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="uc-avatar-img" />
        ) : (
          <div className="uc-avatar" style={{ background: color }}>
            {member.name.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Online dot */}
        <span className="uc-online-dot" />
      </div>

      {/* Name + role */}
      <div className="uc-name">{member.name}</div>
      <div className="uc-role">{primaryRole}</div>

      {/* Stats row */}
      <div className="uc-stats">
        <div className="uc-stat">
          <span className="uc-stat-val" style={{ color: '#f59e0b' }}>{activeTasks}</span>
          <span className="uc-stat-lbl">Active</span>
        </div>
        <div className="uc-stat-divider" />
        <div className="uc-stat">
          <span className="uc-stat-val" style={{ color: '#22c55e' }}>{member.completed}</span>
          <span className="uc-stat-lbl">Done</span>
        </div>
        <div className="uc-stat-divider" />
        <div className="uc-stat">
          <span className="uc-stat-val" style={{ color }}>{member.total}</span>
          <span className="uc-stat-lbl">Total</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="uc-progress-track">
        <div className="uc-progress-fill" style={{ width: `${completionPct}%`, background: color }} />
      </div>
      <div className="uc-progress-label">{completionPct}% completed</div>
    </motion.div>
  );
};

// ── UserProfileModal ──────────────────────────────────────────────────────
const UserProfileModal = ({ member, onClose, assignedTasks, currentUser, createAssignedTask, users }) => {
  const [modalTab, setModalTab] = useState('tasks'); // 'tasks' | 'assign'
  const [taskFilter, setTaskFilter] = useState('all');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignPriority, setAssignPriority] = useState('medium');
  const [assignDue, setAssignDue] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState(false);

  const color = getAvatarColor(member.name);
  const primaryRole = member.roles?.[0] || 'Staff';
  const completionPct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;

  // All tasks for this member from global assignedTasks
  const memberTasks = assignedTasks.filter(t => t.assigned_to === member.id);
  const filtered = taskFilter === 'all' ? memberTasks
    : taskFilter === 'active' ? memberTasks.filter(t => t.status !== 'completed')
    : memberTasks.filter(t => t.status === 'completed');

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignTitle.trim() || isAssigning) return;
    setIsAssigning(true);
    try {
      await createAssignedTask({
        title: assignTitle.trim(),
        description: assignDesc.trim(),
        assigned_to: member.id,
        assigned_to_name: member.name,
        priority: assignPriority,
        due_date: assignDue ? new Date(assignDue).toISOString() : null,
      });
      setAssignTitle(''); setAssignDesc(''); setAssignDue(''); setAssignPriority('medium');
      setAssignSuccess(true);
      setTimeout(() => setAssignSuccess(false), 3000);
      setModalTab('tasks');
    } catch (err) {
      console.error('Assign failed:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="upm-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          className="upm-panel"
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        >
          {/* Close */}
          <button className="upm-close" onClick={onClose}><X size={18} /></button>

          {/* Hero header */}
          <div className="upm-hero" style={{ '--upm-color': color }}>
            <div className="upm-hero-blur" style={{ background: color }} />
            <div className="upm-hero-content">
              {member.avatar_url ? (
                <img src={member.avatar_url} alt="" className="upm-hero-avatar" />
              ) : (
                <div className="upm-hero-avatar" style={{ background: color }}>
                  {member.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="upm-hero-info">
                <h2 className="upm-hero-name">{member.name}</h2>
                <div className="upm-hero-role">{primaryRole}</div>
                {member.email && (
                  <div className="upm-hero-email">
                    <Mail size={12} /> {member.email}
                  </div>
                )}
              </div>
              {/* Completion ring */}
              <div className="upm-ring-wrap">
                <svg viewBox="0 0 60 60" className="upm-ring-svg">
                  <circle cx="30" cy="30" r="24" className="upm-ring-bg" />
                  <circle
                    cx="30" cy="30" r="24"
                    className="upm-ring-fill"
                    style={{
                      stroke: color,
                      strokeDasharray: 150.8,
                      strokeDashoffset: 150.8 - (150.8 * completionPct / 100)
                    }}
                  />
                </svg>
                <div className="upm-ring-label">
                  <span className="rate">{completionPct}%</span>
                  <span className="cap">done</span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div className="upm-quick-stats">
              <div className="upm-qs-item">
                <span className="upm-qs-val">{member.total}</span>
                <span className="upm-qs-lbl">Total Tasks</span>
              </div>
              <div className="upm-qs-item">
                <span className="upm-qs-val" style={{ color: '#f59e0b' }}>{member.pending}</span>
                <span className="upm-qs-lbl">Pending</span>
              </div>
              <div className="upm-qs-item">
                <span className="upm-qs-val" style={{ color: '#6366f1' }}>{member.inProgress}</span>
                <span className="upm-qs-lbl">In Progress</span>
              </div>
              <div className="upm-qs-item">
                <span className="upm-qs-val" style={{ color: '#22c55e' }}>{member.completed}</span>
                <span className="upm-qs-lbl">Completed</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="upm-tabs">
            {[{id:'tasks',label:'Tasks',icon:ClipboardList},{id:'assign',label:'Assign Task',icon:Plus}].map(t => (
              <button
                key={t.id}
                className={`upm-tab ${modalTab === t.id ? 'active' : ''}`}
                onClick={() => setModalTab(t.id)}
                style={modalTab === t.id ? { color, borderColor: color, background: `${color}14` } : {}}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="upm-body">
            {modalTab === 'tasks' && (
              <div className="upm-tasks-view">
                {/* Filter chips */}
                <div className="upm-task-filters">
                  {[['all','All'],['active','Active'],['completed','Completed']].map(([v,l]) => (
                    <button
                      key={v}
                      className={`upm-chip ${taskFilter === v ? 'active' : ''}`}
                      onClick={() => setTaskFilter(v)}
                      style={taskFilter === v ? { background: color, color: '#fff', borderColor: color } : {}}
                    >{l}</button>
                  ))}
                </div>

                {assignSuccess && (
                  <div className="upm-success-banner">
                    <CheckCircle2 size={16} /> Task assigned successfully!
                  </div>
                )}

                <div className="upm-task-list">
                  {filtered.length === 0 ? (
                    <div className="upm-empty">
                      <ClipboardList size={28} />
                      <p>No tasks found</p>
                    </div>
                  ) : filtered.map(t => {
                    const p = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                    const s = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
                    return (
                      <div key={t.id} className="upm-task-item">
                        <div className="upm-task-dot" style={{ background: p.color }} />
                        <div className="upm-task-content">
                          <div className="upm-task-title">{t.title}</div>
                          <div className="upm-task-meta">
                            <span className="upm-task-pri" style={{ color: p.color, background: p.bg }}>{p.label}</span>
                            <span className="upm-task-due"><Clock size={11}/> {fmtDate(t.due_date)}</span>
                          </div>
                        </div>
                        <span className="upm-task-status" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {modalTab === 'assign' && (
              <form className="upm-assign-form" onSubmit={handleAssign}>
                <div className="upm-assign-header">
                  <Sparkles size={16} style={{ color }} />
                  <span>Assign a new task to <strong>{member.name}</strong></span>
                </div>

                <div className="upm-field">
                  <label className="upm-label">Task Title *</label>
                  <input
                    className="upm-input"
                    placeholder="e.g., Review campaign analytics report"
                    value={assignTitle}
                    onChange={e => setAssignTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="upm-field">
                  <label className="upm-label">Description</label>
                  <textarea
                    className="upm-textarea"
                    placeholder="Optional details, links, or instructions..."
                    value={assignDesc}
                    onChange={e => setAssignDesc(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="upm-field-row">
                  <div className="upm-field">
                    <label className="upm-label">Priority</label>
                    <select className="upm-select" value={assignPriority} onChange={e => setAssignPriority(e.target.value)}>
                      <option value="urgent">🔴 Urgent</option>
                      <option value="high">🟠 High</option>
                      <option value="medium">🔵 Medium</option>
                      <option value="low">⚪ Low</option>
                    </select>
                  </div>
                  <div className="upm-field">
                    <label className="upm-label">Due Date</label>
                    <input
                      type="date"
                      className="upm-input"
                      value={assignDue}
                      onChange={e => setAssignDue(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="upm-assign-btn"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}
                  disabled={!assignTitle.trim() || isAssigning}
                >
                  {isAssigning ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {isAssigning ? 'Assigning...' : 'Assign Task'}
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export const TaskBoard = () => {
  const {
    myDailyTasks, assignedTasks, todayCompletions, loading,
    isCompletedToday, completeDailyTask, uncompleteDailyTask, updateAssignedTask,
    createAssignedTask
  } = useTasks();
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();

  const [activeTab, setActiveTab] = usePersistentState('panel:tasks:tab', 'overview');
  const [assignmentFilter, setAssignmentFilter] = useState('all'); // 'all', 'assigned_to_me', 'assigned_by_me'
  const [isCreateAssignedOpen, setIsCreateAssignedOpen] = useState(false);
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskType, setSelectedTaskType] = useState('daily');
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedMemberModal, setSelectedMemberModal] = useState(null);

  // Daily report submission state
  const [reportText, setReportText] = useState('');
  const [reportAssignee, setReportAssignee] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Alerts logic state
  const [showOverdueAlert, setShowOverdueAlert] = useState(false);
  const [showReminderAlert, setShowReminderAlert] = useState(false);

  useEffect(() => { updatePresenceContext?.('Managing Tasks'); }, [updatePresenceContext]);

  // Handle submission of daily report task
  const handleCreateDailyReport = async (e) => {
    e.preventDefault();
    if (!reportText.trim() || !reportAssignee || isSubmittingReport) return;
    
    setIsSubmittingReport(true);
    try {
      const selectedUser = users.find(u => u.id === reportAssignee);
      const reportTitle = `[Daily Report] Daily Submission`;
      
      await createAssignedTask({
        title: reportTitle,
        description: reportText.trim(),
        assigned_to: reportAssignee,
        assigned_to_name: selectedUser?.name || selectedUser?.full_name || 'Supervisor',
        priority: 'high',
        due_date: new Date().toISOString(), // due today
      });

      setReportText('');
      setReportAssignee('');
    } catch (err) {
      console.error('Failed to submit daily report:', err);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Alert check for 10:00 PM daily task submission
  useEffect(() => {
    if (!user || loading) return;

    const todayStr = new Date().toDateString();
    const submitted = assignedTasks.some(t => 
      t.assigned_by === user?.id && 
      t.title?.startsWith('[Daily Report]') && 
      new Date(t.created_at).toDateString() === todayStr
    );

    if (submitted) {
      setShowOverdueAlert(false);
      setShowReminderAlert(false);
      return;
    }

    const checkTime = () => {
      const now = new Date();
      const hours = now.getHours();
      const todayStr = now.toDateString();
      
      if (hours >= 22) { // Past 10:00 PM (22:00)
        const dismissedOverdue = sessionStorage.getItem(`dismissed_overdue_${todayStr}`);
        if (!dismissedOverdue) {
          setShowOverdueAlert(true);
          setShowReminderAlert(false);
        }
      } else if (hours >= 20) { // Past 8:00 PM (20:00 to 22:00)
        const dismissedReminder = sessionStorage.getItem(`dismissed_reminder_${todayStr}`);
        if (!dismissedReminder) {
          setShowReminderAlert(true);
          setShowOverdueAlert(false);
        }
      }
    };

    checkTime();
    const interval = setInterval(checkTime, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [assignedTasks, user, loading]);

  useEffect(() => {
    const fetchUsersData = async () => {
      setLoadingUsers(true);
      try {
        const [{ data: usersData }, { data: rolesData }] = await Promise.all([
          supabase.from('users').select('*'),
          supabase.from('user_roles').select('*')
        ]);
        setUsers(usersData || []);
        
        const rolesMap = {};
        rolesData?.forEach(mapping => {
          if (!rolesMap[mapping.user_id]) rolesMap[mapping.user_id] = [];
          rolesMap[mapping.user_id].push(mapping.role_id);
        });
        setUserRoles(rolesMap);
      } catch (error) {
        console.error('Error fetching users for task board:', error);
      } finally {
        setLoadingUsers(false);
      }
    };
    fetchUsersData();
  }, []);

  const handleOpenOrder = async (orderId) => {
    try {
      const order = await api.getOrderById(orderId);
      if (order) setSelectedOrderData(order);
    } catch (e) { console.error('Failed to fetch related order:', e); }
  };

  // Group tasks by assignee (user)
  const userStatsList = useMemo(() => {
    const statsMap = {};
    
    // Seed with all users loaded from DB
    users.forEach(u => {
      statsMap[u.id] = {
        id: u.id,
        name: u.name || u.full_name || 'Unnamed User',
        email: u.email,
        avatar_url: u.avatar_url,
        roles: userRoles[u.id] || [],
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        assignedByMeCount: 0,
        assignedByMeTasks: [],
        allTasks: []
      };
    });

    // Populate stats from assignedTasks
    assignedTasks.forEach(task => {
      if (task.assigned_to) {
        const uid = task.assigned_to;
        if (!statsMap[uid]) {
          statsMap[uid] = {
            id: uid,
            name: task.assigned_to_name || 'Unknown User',
            email: '',
            avatar_url: null,
            roles: [],
            total: 0,
            completed: 0,
            inProgress: 0,
            pending: 0,
            assignedByMeCount: 0,
            assignedByMeTasks: [],
            allTasks: []
          };
        }

        const userStat = statsMap[uid];
        userStat.total += 1;
        userStat.allTasks.push(task);

        if (task.status === 'completed') {
          userStat.completed += 1;
        } else if (task.status === 'in_progress') {
          userStat.inProgress += 1;
        } else {
          userStat.pending += 1;
        }

        if (task.assigned_by === user?.id) {
          userStat.assignedByMeCount += 1;
          userStat.assignedByMeTasks.push(task);
        }
      }
    });

    return Object.values(statsMap).sort((a, b) => b.total - a.total);
  }, [users, userRoles, assignedTasks, user?.id]);

  // Calculate counts for filters
  const assignedToMeCount = assignedTasks.filter(t => t.assigned_to === user?.id).length;
  const assignedByMeCount = assignedTasks.filter(t => t.assigned_by === user?.id).length;

  const stats = {
    backlog:    assignedTasks.filter(t => t.status === 'pending').length,
    inProgress: assignedTasks.filter(t => t.status === 'in_progress').length,
    completed:  assignedTasks.filter(t => t.status === 'completed').length,
    total:      assignedTasks.length,
    assignedToMe: assignedToMeCount,
    assignedByMe: assignedByMeCount,
  };

  const filteredTasks = assignedTasks.filter(t => {
    // Apply search filter
    if (searchQuery && !t.title?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Apply tab filter
    if (assignmentFilter === 'assigned_to_me') {
      return t.assigned_to === user?.id;
    } else if (assignmentFilter === 'assigned_by_me') {
      return t.assigned_by === user?.id;
    }
    return true; // 'all'
  });

  // Fake "projects" by grouping tasks by assigned_role
  const roleGroups = [...new Set(assignedTasks.map(t => t.assigned_role).filter(Boolean))];
  const listProjects = roleGroups.slice(0, 6).map((role, i) => {
    const roleTasks = assignedTasks.filter(t => t.assigned_role === role);
    const done = roleTasks.filter(t => t.status === 'completed').length;
    const pct = roleTasks.length ? Math.round((done / roleTasks.length) * 100) : 0;
    const status = pct === 100 ? 'completed' : pct > 0 ? 'in_progress' : 'pending';
    return { name: role, status, progress: pct, tasks: `${done} / ${roleTasks.length}`, due_date: null, owner: profile?.name || 'You' };
  });

  const completionRate = stats.total
    ? Math.round((stats.completed / stats.total) * 100)
    : 0;

  const myCompletedTodayCount = todayCompletions.length;

  // ── Proactive & Real-time KPIs ──────────────────────────────────────────────
  const urgentTasksCount = useMemo(() => {
    return assignedTasks.filter(t => t.priority === 'urgent' && t.status !== 'completed' && t.assigned_to === user?.id).length;
  }, [assignedTasks, user?.id]);

  const overdueTasksCount = useMemo(() => {
    const now = new Date();
    return assignedTasks.filter(t => t.status !== 'completed' && t.due_date && new Date(t.due_date) < now && t.assigned_to === user?.id).length;
  }, [assignedTasks, user?.id]);

  const pendingExtensionRequestsCount = useMemo(() => {
    return assignedTasks.filter(t => t.status !== 'completed' && t.extension_request_status === 'pending' && (t.assigned_by === user?.id || isAdmin)).length;
  }, [assignedTasks, user?.id, isAdmin]);

  // Urgent Task Queue
  const urgentTaskQueue = useMemo(() => {
    return assignedTasks
      .filter(t => t.status !== 'completed' && (t.priority === 'urgent' || t.priority === 'high') && t.assigned_to === user?.id)
      .sort((a, b) => {
        // Urgent first, then high
        if (a.priority === b.priority) {
          return new Date(a.due_date || 0) - new Date(b.due_date || 0);
        }
        return a.priority === 'urgent' ? -1 : 1;
      });
  }, [assignedTasks, user?.id]);

  // Team Leaderboard Podium calculation
  const leaderboardPodium = useMemo(() => {
    return userStatsList
      .filter(u => u.total > 0)
      .map(u => ({
        ...u,
        completionRate: Math.round((u.completed / u.total) * 100)
      }))
      .sort((a, b) => b.completionRate - a.completionRate || b.completed - a.completed)
      .slice(0, 3);
  }, [userStatsList]);

  // Handle checking/unchecking a daily task
  const handleToggleDailyTask = async (taskId) => {
    const isCompleted = isCompletedToday(taskId);
    try {
      if (isCompleted) {
        await uncompleteDailyTask(taskId);
      } else {
        await completeDailyTask(taskId);
      }
    } catch (err) {
      console.error('Failed to toggle daily task completion:', err);
    }
  };

  // Calculate if daily report has been submitted today
  const hasSubmittedToday = useMemo(() => {
    const todayStr = new Date().toDateString();
    return assignedTasks.some(t => 
      t.assigned_by === user?.id && 
      t.title?.startsWith('[Daily Report]') && 
      new Date(t.created_at).toDateString() === todayStr
    );
  }, [assignedTasks, user?.id]);

  // Determine deadline status
  const deadlineStatus = useMemo(() => {
    if (hasSubmittedToday) return 'submitted';
    const now = new Date();
    const hours = now.getHours();
    return hours >= 22 ? 'overdue' : 'pending';
  }, [hasSubmittedToday]);

  if (loading) return <div className="tb-loading">Preparing Workspace…</div>;

  return (
    <div className="tb-wrapper">

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <motion.div
        className="tb-page-header"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="tb-page-header-left">
          <div className="tb-breadcrumbs">
            <span>Workspace</span>
            <ChevronRight size={14} />
            <span className="tb-breadcrumb-active">Task Board</span>
          </div>
          <h1 className="tb-page-title">Dashboard</h1>
        </div>

        <div className="tb-page-header-right">
          <div className="tb-header-meta">
            <Clock size={14} />
            <span>Last updated {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="tb-header-avatars">
            {['J', 'M', 'D'].map((l, i) => (
              <div key={i} className="tb-header-av" style={{ zIndex: 3 - i }}>{l}</div>
            ))}
          </div>
          <button className="tb-export-btn" onClick={() => setIsCreateAssignedOpen(true)}>
            <Plus size={15} /> New Task
          </button>
        </div>
      </motion.div>

      {/* ── WELCOME BANNER ──────────────────────────────────────────────── */}
      <motion.div
        className="tb-welcome-banner"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        <div className="tb-welcome-text">
          <h2>Welcome Back, {profile?.name?.split(' ')[0] || 'User'} 👋</h2>
          <p>
            <span className="tb-badge-pill">{stats.assignedToMe} Assigned to Me</span>
            <span className="tb-badge-pill warning">{stats.assignedByMe} Assigned to Others</span>
            <span className="tb-badge-pill info">{stats.total} Total System Tasks</span>
          </p>
        </div>
        <button className="tb-export-subtle-btn">
          Export <ChevronDown size={14} />
        </button>
      </motion.div>

      {/* ── METRIC CARDS ────────────────────────────────────────────────── */}
      <motion.div
        className="tb-metrics-row"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <MetricCard label="Total Projects"   value={roleGroups.length || 3} icon={Briefcase}     accent="#6366f1" trend="+5%" />
        <MetricCard label="Total Tasks"      value={stats.total}            icon={ClipboardList}  accent="#f97316" trend="+2%" />
        <MetricCard label="In Progress"      value={stats.inProgress}       icon={Activity}       accent="#22c55e" trend={`+${stats.inProgress}`} />
        <MetricCard label="Completed Tasks"  value={stats.completed}        icon={CheckCircle2}   accent="#06b6d4" trend={`+${myCompletedTodayCount}`} />
      </motion.div>

      {/* ── DAILY REPORT SUBMISSION CENTER ──────────────────────────────── */}
      <motion.div
        className="tb-daily-submission-widget"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.4 }}
      >
        <div className="tb-daily-widget-left">
          <div>
            <h3 className="tb-daily-widget-title">
              <FileText size={20} style={{ color: 'var(--tb-accent)' }} />
              <span>Daily Submission Center</span>
            </h3>
            <p className="tb-daily-widget-desc">
              Submit a details-wise summary of what you have worked on today. 
              Only the assignee/supervisor you select will have access to this report on their Task Board.
            </p>
          </div>
          <div className="tb-daily-status-container">
            {deadlineStatus === 'submitted' && (
              <span className="tb-daily-status-banner submitted">
                <CheckCircle2 size={15} /> Submitted Today
              </span>
            )}
            {deadlineStatus === 'pending' && (
              <span className="tb-daily-status-banner pending">
                <Clock size={15} /> Pending Today (10:00 PM Deadline)
              </span>
            )}
            {deadlineStatus === 'overdue' && (
              <span className="tb-daily-status-banner overdue">
                <AlertCircle size={15} /> Overdue! 10:00 PM Deadline Missed
              </span>
            )}
          </div>
        </div>

        <div className="tb-daily-widget-right">
          <form onSubmit={handleCreateDailyReport}>
            <textarea
              id="tb-daily-textarea-input"
              className="tb-daily-textarea"
              placeholder="Provide a detailed list of tasks completed today (e.g., - Fixed 3 responsive bugs, - Met with client...)"
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              required
            />
            <div className="tb-daily-form-row">
              <div className="tb-daily-select-wrapper">
                <select
                  className="tb-daily-select"
                  value={reportAssignee}
                  onChange={(e) => setReportAssignee(e.target.value)}
                  required
                >
                  <option value="">-- Submit to Supervisor --</option>
                  {users
                    .filter(u => u.id !== user?.id)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.full_name || u.email}
                      </option>
                    ))}
                </select>
              </div>
              <button
                type="submit"
                className="tb-daily-submit-btn"
                disabled={!reportText.trim() || !reportAssignee || isSubmittingReport}
              >
                {isSubmittingReport ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        </div>
      </motion.div>

      {/* ── PREMIUM USER CARDS STRIP (PERMANENTLY AT THE TOP) ─── */}
      <div className="uc-section" style={{ marginBottom: '20px' }}>
        <div className="uc-section-header">
          <div>
            <h3 className="uc-section-title">
              <Users size={18} style={{ color: 'var(--tb-accent)' }} /> Team Members
            </h3>
            <p className="uc-section-sub">Click any member to view tasks & assign work directly</p>
          </div>
          <span className="uc-count-badge">{userStatsList.length} members</span>
        </div>

        {loadingUsers ? (
          <div className="uc-loading">
            <Loader2 className="animate-spin" size={28} />
            <span>Loading team...</span>
          </div>
        ) : userStatsList.length === 0 ? (
          <div className="uc-loading"><Users size={28} /><span>No members found.</span></div>
        ) : (
          <div className="uc-grid-horizontal">
            {userStatsList.map((member, i) => (
              <motion.div
                key={member.id}
                className="uc-card-wrapper"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03, duration: 0.25 }}
              >
                <UserCard member={member} onClick={setSelectedMemberModal} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── VIEW TAB SELECTOR ─────────────────────────────────────────── */}
      <div className="tb-view-selector" style={{
        display: 'flex',
        gap: '12px',
        borderBottom: '1px solid var(--tb-border)',
        paddingBottom: '8px',
        marginBottom: '10px'
      }}>
        {[
          { id: 'overview', label: 'Overview', icon: ClipboardList },
          { id: 'kanban', label: 'Kanban Board', icon: Kanban },
          { id: 'team', label: 'Team Performance', icon: Users }
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              className={`tb-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                background: isActive ? 'var(--tb-accent-bg)' : 'transparent',
                color: isActive ? 'var(--tb-accent)' : 'var(--tb-text-sub)',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: isActive ? 'inset 0 0 0 1px rgba(99,102,241,0.1)' : 'none'
              }}
            >
              <Icon size={16} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="tb-overview-layout">
          {/* Main Dashboard Section */}
          <div className="tb-overview-main">
            {/* Assigned Tasks Tracker */}
            <motion.div
              className="tb-section-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
            >
              <div className="tb-section-header" style={{ paddingBottom: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h2 className="tb-section-title">Assigned Tasks Tracker</h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                    Monitor progress and update task statuses in real-time.
                  </span>
                </div>
                <div className="tb-section-actions">
                  <div className="tb-search-box">
                    <Search size={14} />
                    <input
                      placeholder="Search by title..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className="tb-filter-btn" onClick={() => setIsCreateAssignedOpen(true)}>
                    <Plus size={14} /> Assign Task
                  </button>
                </div>

                {/* Tab Filters for User Assignments */}
                <div className="tb-filter-tabs">
                  <button
                    type="button"
                    className={`tb-filter-tab ${assignmentFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setAssignmentFilter('all')}
                  >
                    All Tasks ({stats.total})
                  </button>
                  <button
                    type="button"
                    className={`tb-filter-tab ${assignmentFilter === 'assigned_to_me' ? 'active' : ''}`}
                    onClick={() => setAssignmentFilter('assigned_to_me')}
                  >
                    Assigned to Me ({stats.assignedToMe})
                  </button>
                  <button
                    type="button"
                    className={`tb-filter-tab ${assignmentFilter === 'assigned_by_me' ? 'active' : ''}`}
                    onClick={() => setAssignmentFilter('assigned_by_me')}
                  >
                    Assigned by Me ({stats.assignedByMe})
                  </button>
                </div>
              </div>

              <div className="tb-table-wrapper desktop-only">
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th className="tb-th">Task Name</th>
                      <th className="tb-th">Assigned To</th>
                      <th className="tb-th">Assigned By</th>
                      <th className="tb-th">Due Date</th>
                      <th className="tb-th">Status</th>
                      <th className="tb-th">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.length > 0
                      ? filteredTasks.map(t => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            onView={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                            onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                          />
                        ))
                      : (
                        <tr>
                          <td colSpan={6} className="tb-empty-row">
                            No tasks found matching your filter criteria. 🎉
                          </td>
                        </tr>
                      )
                    }
                  </tbody>
                </table>
              </div>

              <div className="tb-mobile-tasks-list mobile-only">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map(t => (
                    <div 
                      key={t.id} 
                      className="tb-mobile-task-card" 
                      onClick={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                    >
                      <div className="tb-mobile-task-header">
                        <div className="tb-mobile-task-title-group">
                          <span className={`tb-priority-dot ${t.priority || 'medium'}`} />
                          <span className="tb-mobile-task-title">{t.title}</span>
                        </div>
                        <span className={`tb-status-badge status-${t.status || 'pending'}`}>
                          {t.status === 'in_progress' ? 'Active' : t.status === 'completed' ? 'Done' : 'Pending'}
                        </span>
                      </div>
                      
                      <div className="tb-mobile-task-body">
                        <div className="tb-mobile-task-meta">
                          <div className="meta-item">
                            <span className="meta-label">Due:</span>
                            <span className={`meta-value ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? 'overdue' : ''}`}>
                              {fmtDate(t.due_date)}
                            </span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">To:</span>
                            <span className="meta-value">{t.assigned_to_name || 'Unassigned'}</span>
                          </div>
                        </div>
                        {t.progress !== undefined && (
                          <div className="tb-mobile-task-progress-bar">
                            <div className="progress-fill" style={{ width: `${t.progress}%` }} />
                            <span className="progress-text">{t.progress}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="tb-empty-mobile">No tasks found matching your filter criteria. 🎉</div>
                )}
              </div>
            </motion.div>

            {/* List Projects */}
            <motion.div
              className="tb-section-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <div className="tb-section-header">
                <h2 className="tb-section-title">List Projects</h2>
                <div className="tb-section-actions">
                  <div className="tb-search-box">
                    <Search size={14} />
                    <input placeholder="Search here..." />
                  </div>
                  <button className="tb-filter-btn">
                    <Filter size={14} /> Filter
                  </button>
                </div>
              </div>
              <div className="tb-table-wrapper desktop-only">
                <table className="tb-table">
                  <thead>
                    <tr>
                      <th className="tb-th">Project Name</th>
                      <th className="tb-th">Status</th>
                      <th className="tb-th">Progress</th>
                      <th className="tb-th">Total Tasks</th>
                      <th className="tb-th">Due Date</th>
                      <th className="tb-th">Owner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listProjects.length > 0
                      ? listProjects.map((p, i) => <ProjectRow key={i} project={p} />)
                      : (
                        <tr>
                          <td colSpan={6} className="tb-empty-row">No project data yet.</td>
                        </tr>
                      )
                    }
                  </tbody>
                </table>
              </div>

              <div className="tb-mobile-projects-list mobile-only">
                {listProjects.length > 0 ? (
                  listProjects.map((p, i) => (
                    <div key={i} className="tb-mobile-project-card">
                      <div className="tb-mobile-project-header">
                        <span className="tb-mobile-project-name">{p.name}</span>
                        <span className={`tb-status-badge status-${p.status}`}>
                          {p.status === 'completed' ? 'Done' : p.status === 'in_progress' ? 'Active' : 'Pending'}
                        </span>
                      </div>
                      <div className="tb-mobile-project-body">
                        <div className="tb-mobile-project-meta">
                          <div className="meta-item">
                            <span className="meta-label">Tasks:</span>
                            <span className="meta-value">{p.tasks}</span>
                          </div>
                          <div className="meta-item">
                            <span className="meta-label">Owner:</span>
                            <span className="meta-value">{p.owner}</span>
                          </div>
                        </div>
                        <div className="tb-mobile-task-progress-bar">
                          <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                          <span className="progress-text">{p.progress}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="tb-empty-mobile">No project data yet.</div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar widgets */}
          <div className="tb-overview-sidebar">
            
            {/* KPI Performance Dial Widget */}
            <div className="tb-sidebar-widget kpi-dial-widget">
              <h3 className="tb-widget-title">
                <Activity size={16} className="text-accent" />
                <span>My Performance KPIs</span>
              </h3>
              <div className="kpi-ring-wrapper">
                <svg className="kpi-circle-svg" viewBox="0 0 100 100">
                  <circle className="ring-bg" cx="50" cy="50" r="42" />
                  <circle 
                    className="ring-progress" 
                    cx="50" 
                    cy="50" 
                    r="42" 
                    strokeDasharray="264" 
                    strokeDashoffset={264 - (264 * completionRate) / 100}
                  />
                </svg>
                <div className="kpi-ring-label">
                  <span className="rate">{completionRate}%</span>
                  <span className="caption">Completion</span>
                </div>
              </div>

              <div className="kpi-metrics-list">
                <div className="kpi-metric-row-item text-danger">
                  <div className="label-wrap">
                    <AlertTriangle size={14} />
                    <span>Overdue Tasks</span>
                  </div>
                  <strong>{overdueTasksCount}</strong>
                </div>
                <div className="kpi-metric-row-item text-warning">
                  <div className="label-wrap">
                    <Zap size={14} />
                    <span>Urgent Tasks</span>
                  </div>
                  <strong>{urgentTasksCount}</strong>
                </div>
                {pendingExtensionRequestsCount > 0 && (
                  <div className="kpi-metric-row-item text-info">
                    <div className="label-wrap">
                      <Clock size={14} />
                      <span>Extension Requests</span>
                    </div>
                    <strong>{pendingExtensionRequestsCount}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Daily Tasks Checklist Widget */}
            <div className="tb-sidebar-widget daily-tasks-widget">
              <div className="widget-header-row">
                <h3 className="tb-widget-title">
                  <ListChecks size={16} className="text-success" />
                  <span>Daily Checklist</span>
                </h3>
                {isAdmin && (
                  <button 
                    className="create-daily-btn"
                    onClick={() => setIsCreateDailyOpen(true)}
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>

              <div className="daily-checklist-scroll">
                {myDailyTasks.length > 0 ? (
                  myDailyTasks.map(task => {
                    const completed = isCompletedToday(task.id);
                    return (
                      <div 
                        key={task.id} 
                        className={`daily-task-item ${completed ? 'completed' : ''}`}
                        onClick={() => handleToggleDailyTask(task.id)}
                      >
                        <div className="checkbox-wrap">
                          {completed ? (
                            <CheckSquare size={18} className="checkbox-icon checked" />
                          ) : (
                            <Square size={18} className="checkbox-icon" />
                          )}
                        </div>
                        <div className="daily-task-info">
                          <span className="daily-title">{task.title}</span>
                          <span className="daily-role">{task.assigned_role}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="daily-empty">
                    <CheckSquare size={20} />
                    <p>No active daily tasks for your role.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Urgent Priority Queue */}
            <div className="tb-sidebar-widget priority-queue-widget">
              <h3 className="tb-widget-title">
                <AlertCircle size={16} style={{ color: '#ef4444' }} />
                <span>Urgent & High Queue</span>
              </h3>
              <div className="queue-list">
                {urgentTaskQueue.length > 0 ? (
                  urgentTaskQueue.map(task => {
                    const isUrgent = task.priority === 'urgent';
                    const dueDateObj = task.due_date ? new Date(task.due_date) : null;
                    const isOverdue = dueDateObj && dueDateObj < new Date();
                    
                    return (
                      <div 
                        key={task.id} 
                        className={`queue-item ${isUrgent ? 'urgent' : 'high'}`}
                        onClick={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }}
                      >
                        <div className="queue-header">
                          <span className={`queue-badge ${task.priority}`}>
                            {task.priority.toUpperCase()}
                          </span>
                          {isOverdue && <span className="overdue-badge">OVERDUE</span>}
                        </div>
                        <div className="queue-body">
                          <span className="queue-title">{task.title}</span>
                        </div>
                        <div className="queue-footer">
                          <Clock size={12} />
                          <span>Due: {fmtDate(task.due_date)}</span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="queue-empty">
                    <Check size={20} />
                    <p>All clear! No pending urgent tasks.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'kanban' && (
        /* ── KANBAN VIEW ──────────────────────────────────────────────── */
        <motion.div
          className="tb-kanban-board"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <KanbanColumn
            title="Backlog"
            tasks={assignedTasks.filter(t => t.status === 'pending')}
            color="#f59e0b"
            onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
            onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
          />
          <KanbanColumn
            title="In Progress"
            tasks={assignedTasks.filter(t => t.status === 'in_progress')}
            color="#6366f1"
            onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
            onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
          />
          <KanbanColumn
            title="Completed"
            tasks={assignedTasks.filter(t => t.status === 'completed')}
            color="#22c55e"
            onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
            onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
          />
        </motion.div>
      )}

      {activeTab === 'team' && (
        /* ── TEAM PERFORMANCE VIEW WITH LEADERBOARD ──────────────────── */
        <div className="tb-team-layout">
          
          {/* TOP Leaderboard Podiums */}
          <div className="tb-leaderboard-podium-container">
            <h3 className="podium-section-title">
              <Award size={18} className="text-warning" />
              <span>Team Performance Leaderboard</span>
            </h3>

            <div className="leaderboard-podium-row">
              {leaderboardPodium.length > 0 ? (
                // Order layout: Rank 2 (index 1), Rank 1 (index 0), Rank 3 (index 2)
                [1, 0, 2].map(posIndex => {
                  const m = leaderboardPodium[posIndex];
                  if (!m) return null;
                  const ranks = [
                    { label: '1st', badge: '🥇', class: 'first' },
                    { label: '2nd', badge: '🥈', class: 'second' },
                    { label: '3rd', badge: '🥉', class: 'third' }
                  ];
                  const r = ranks[posIndex];

                  return (
                    <div key={m.id} className={`podium-column ${r.class}`}>
                      <div className="podium-badge">{r.badge}</div>
                      <div className="podium-avatar">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" />
                        ) : (
                          m.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="podium-name">{m.name}</span>
                      <span className="podium-completion">{m.completionRate}% Done</span>
                      <span className="podium-count">{m.completed} / {m.total} Tasks</span>
                      <div className="podium-bar-visual">
                        <span className="label">{r.label}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="leaderboard-empty">
                  No task completions logged yet. Keep going team!
                </div>
              )}
            </div>
          </div>

          {/* ── PREMIUM USER CARDS GRID ─── */}
          <div className="uc-section">
            <div className="uc-section-header">
              <div>
                <h3 className="uc-section-title">
                  <Users size={18} /> Team Members
                </h3>
                <p className="uc-section-sub">Click any card to view tasks & assign work</p>
              </div>
              <span className="uc-count-badge">{userStatsList.length} members</span>
            </div>

            {loadingUsers ? (
              <div className="uc-loading">
                <Loader2 className="animate-spin" size={28} />
                <span>Loading team...</span>
              </div>
            ) : userStatsList.length === 0 ? (
              <div className="uc-loading"><Users size={28} /><span>No members found.</span></div>
            ) : (
              <div className="uc-grid">
                {userStatsList.map((member, i) => (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.35 }}
                  >
                    <UserCard member={member} onClick={setSelectedMemberModal} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Detailed tasks panel for selected user — kept for fallback */}
          <div style={{ display: 'none' }}>

            {/* Right Column: Detailed Tasks for Selected User */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(() => {
                const selectedMember = userStatsList.find(m => m.id === selectedUserId) || userStatsList[0];
                if (!selectedMember) {
                  return (
                    <div className="tb-section-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--tb-text-muted)' }}>
                      Select a team member to view their assigned tasks.
                    </div>
                  );
                }

                const assignedByMeTasks = selectedMember.assignedByMeTasks || [];
                const otherTasks = (selectedMember.allTasks || []).filter(t => t.assigned_by !== user?.id);

                return (
                  <>
                    {/* Header Card */}
                    <div className="tb-section-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="tb-owner-av" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
                          {selectedMember.avatar_url ? (
                            <img src={selectedMember.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            selectedMember.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--tb-text)', margin: 0 }}>
                            {selectedMember.name}
                          </h2>
                          <p style={{ fontSize: '0.8rem', color: 'var(--tb-text-muted)', margin: '2px 0 0' }}>
                            {selectedMember.email} • {selectedMember.roles[0] || 'Staff'}
                          </p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <div className="tb-metric-badge" style={{ padding: '6px 12px', background: 'var(--tb-bg)', borderRadius: '8px', fontSize: '0.78rem', border: '1px solid var(--tb-border)' }}>
                          Total: <strong>{selectedMember.total}</strong>
                        </div>
                        <div className="tb-metric-badge" style={{ padding: '6px 12px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', borderRadius: '8px', fontSize: '0.78rem', border: '1px solid rgba(34,197,94,0.15)' }}>
                          Done: <strong>{selectedMember.completed}</strong>
                        </div>
                        <div className="tb-metric-badge" style={{ padding: '6px 12px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', borderRadius: '8px', fontSize: '0.78rem', border: '1px solid rgba(245,158,11,0.15)' }}>
                          Pending: <strong>{selectedMember.pending}</strong>
                        </div>
                        <div className="tb-metric-badge" style={{ padding: '6px 12px', background: 'var(--tb-accent-bg)', color: 'var(--tb-accent)', borderRadius: '8px', fontSize: '0.78rem', border: '1px solid rgba(99,102,241,0.15)' }}>
                          By Me: <strong>{selectedMember.assignedByMeCount}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Section 1: Assigned By Me Tasks */}
                    <div className="tb-section-card">
                      <div className="tb-section-header" style={{ borderBottom: '1px solid var(--tb-border)' }}>
                        <div>
                          <h3 className="tb-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShieldCheck size={16} style={{ color: 'var(--tb-accent)' }} />
                            <span>Assigned By Me ({assignedByMeTasks.length})</span>
                          </h3>
                          <span style={{ fontSize: '0.72rem', color: 'var(--tb-text-muted)' }}>
                            Tasks you created and assigned to this user. You can modify their status or details.
                          </span>
                        </div>
                        <button
                          className="tb-filter-btn"
                          onClick={() => {
                            setIsCreateAssignedOpen(true);
                          }}
                        >
                          <Plus size={14} /> Assign New Task
                        </button>
                      </div>

                      <div className="tb-table-wrapper desktop-only">
                        <table className="tb-table">
                          <thead>
                            <tr>
                              <th className="tb-th">Task Name</th>
                              <th className="tb-th">Assigned To</th>
                              <th className="tb-th">Assigned By</th>
                              <th className="tb-th">Due Date</th>
                              <th className="tb-th">Status</th>
                              <th className="tb-th">Progress</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assignedByMeTasks.length > 0 ? (
                              assignedByMeTasks.map(t => (
                                <TaskRow
                                  key={t.id}
                                  task={t}
                                  onView={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                                  onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                                />
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="tb-empty-row">
                                  You have not assigned any tasks to this user yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="tb-mobile-tasks-list mobile-only">
                        {assignedByMeTasks.length > 0 ? (
                          assignedByMeTasks.map(t => (
                            <div 
                              key={t.id} 
                              className="tb-mobile-task-card" 
                              onClick={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                            >
                              <div className="tb-mobile-task-header">
                                <div className="tb-mobile-task-title-group">
                                  <span className={`tb-priority-dot ${t.priority || 'medium'}`} />
                                  <span className="tb-mobile-task-title">{t.title}</span>
                                </div>
                                <span className={`tb-status-badge status-${t.status || 'pending'}`}>
                                  {t.status === 'in_progress' ? 'Active' : t.status === 'completed' ? 'Done' : 'Pending'}
                                </span>
                              </div>
                              
                              <div className="tb-mobile-task-body">
                                <div className="tb-mobile-task-meta">
                                  <div className="meta-item">
                                    <span className="meta-label">Due:</span>
                                    <span className={`meta-value ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? 'overdue' : ''}`}>
                                      {fmtDate(t.due_date)}
                                    </span>
                                  </div>
                                </div>
                                {t.progress !== undefined && (
                                  <div className="tb-mobile-task-progress-bar">
                                    <div className="progress-fill" style={{ width: `${t.progress}%` }} />
                                    <span className="progress-text">{t.progress}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="tb-empty-mobile">You have not assigned any tasks to this user yet.</div>
                        )}
                      </div>
                    </div>

                    {/* Section 2: Other Assigned Tasks */}
                    <div className="tb-section-card">
                      <div className="tb-section-header">
                        <div>
                          <h3 className="tb-section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Users size={16} />
                            <span>Other Assigned Tasks ({otherTasks.length})</span>
                          </h3>
                          <span style={{ fontSize: '0.72rem', color: 'var(--tb-text-muted)' }}>
                            Tasks assigned to this user by the system or other administrators.
                          </span>
                        </div>
                      </div>

                      <div className="tb-table-wrapper desktop-only">
                        <table className="tb-table">
                          <thead>
                            <tr>
                              <th className="tb-th">Task Name</th>
                              <th className="tb-th">Assigned To</th>
                              <th className="tb-th">Assigned By</th>
                              <th className="tb-th">Due Date</th>
                              <th className="tb-th">Status</th>
                              <th className="tb-th">Progress</th>
                            </tr>
                          </thead>
                          <tbody>
                            {otherTasks.length > 0 ? (
                              otherTasks.map(t => (
                                <TaskRow
                                  key={t.id}
                                  task={t}
                                  onView={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                                  onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                                />
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="tb-empty-row">
                                  No other tasks assigned to this user.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <div className="tb-mobile-tasks-list mobile-only">
                        {otherTasks.length > 0 ? (
                          otherTasks.map(t => (
                            <div 
                              key={t.id} 
                              className="tb-mobile-task-card" 
                              onClick={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                            >
                              <div className="tb-mobile-task-header">
                                <div className="tb-mobile-task-title-group">
                                  <span className={`tb-priority-dot ${t.priority || 'medium'}`} />
                                  <span className="tb-mobile-task-title">{t.title}</span>
                                </div>
                                <span className={`tb-status-badge status-${t.status || 'pending'}`}>
                                  {t.status === 'in_progress' ? 'Active' : t.status === 'completed' ? 'Done' : 'Pending'}
                                </span>
                              </div>
                              
                              <div className="tb-mobile-task-body">
                                <div className="tb-mobile-task-meta">
                                  <div className="meta-item">
                                    <span className="meta-label">Due:</span>
                                    <span className={`meta-value ${t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed' ? 'overdue' : ''}`}>
                                      {fmtDate(t.due_date)}
                                    </span>
                                  </div>
                                  <div className="meta-item">
                                    <span className="meta-label">By:</span>
                                    <span className="meta-value">{t.assigned_by_name || 'System'}</span>
                                  </div>
                                </div>
                                {t.progress !== undefined && (
                                  <div className="tb-mobile-task-progress-bar">
                                    <div className="progress-fill" style={{ width: `${t.progress}%` }} />
                                    <span className="progress-text">{t.progress}%</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="tb-empty-mobile">No other tasks assigned to this user.</div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>{/* end hidden fallback div */}
        </div>
      )}

      {/* ── USER PROFILE MODAL */}
      {selectedMemberModal && (
        <UserProfileModal
          member={selectedMemberModal}
          onClose={() => setSelectedMemberModal(null)}
          assignedTasks={assignedTasks}
          currentUser={user}
          createAssignedTask={createAssignedTask}
          users={users}
        />
      )}

      {/* Mobile Floating Action Button (FAB) */}
      <button 
        type="button" 
        className="tb-mobile-fab mobile-only" 
        onClick={() => setIsCreateAssignedOpen(true)}
        aria-label="Assign Task"
      >
        <Plus size={24} />
      </button>

      {/* ── MODALS ────────────────────────────────────────────────────── */}
      <CreateTaskOverlay
        isOpen={isCreateDailyOpen || isCreateAssignedOpen}
        onClose={() => { setIsCreateDailyOpen(false); setIsCreateAssignedOpen(false); }}
        defaultType={isCreateAssignedOpen ? 'assigned' : 'daily'}
      />
      <TaskDetailsModal
        task={selectedTask}
        taskType={selectedTaskType}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onOpenOrder={handleOpenOrder}
      />
      <OrderDetailsModal
        order={selectedOrderData}
        isOpen={!!selectedOrderData}
        onClose={() => setSelectedOrderData(null)}
      />

      {/* ── DAILY REPORT REMINDER ALERT ─────────────────────────────────── */}
      <AnimatePresence>
        {showReminderAlert && (
          <div className="tb-daily-alert-overlay">
            <motion.div
              className="tb-daily-alert-card reminder"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', padding: '10px', borderRadius: '50%' }}>
                  <Clock size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>Daily Report Reminder</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--tb-text-sub)' }}>
                    Submission deadline is 10:00 PM tonight.
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--tb-text)', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                Please write a summary of what you worked on today and submit it to your supervisor. 
                Submissions are secure and strictly visible only to your supervisor.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  className="tb-filter-btn"
                  onClick={() => {
                    setShowReminderAlert(false);
                    const todayStr = new Date().toDateString();
                    sessionStorage.setItem(`dismissed_reminder_${todayStr}`, 'true');
                  }}
                >
                  Later
                </button>
                <button
                  className="tb-daily-submit-btn"
                  onClick={() => {
                    setShowReminderAlert(false);
                    const todayStr = new Date().toDateString();
                    sessionStorage.setItem(`dismissed_reminder_${todayStr}`, 'true');
                    document.getElementById('tb-daily-textarea-input')?.focus();
                  }}
                >
                  Submit Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DAILY REPORT OVERDUE ALERT ──────────────────────────────────── */}
      <AnimatePresence>
        {showOverdueAlert && (
          <div className="tb-daily-alert-overlay">
            <motion.div
              className="tb-daily-alert-card overdue"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{ borderLeft: '4px solid #ef4444' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '10px', borderRadius: '50%' }}>
                  <AlertTriangle className="shake-animation" size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#ef4444' }}>Submission Overdue!</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--tb-text-sub)' }}>
                    The 10:00 PM deadline has passed.
                  </p>
                </div>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--tb-text)', margin: '8px 0 0 0', lineHeight: '1.4' }}>
                You have not submitted your daily task report for today. 
                Please write and submit your daily highlights immediately to keep your KPIs updated.
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button
                  className="tb-filter-btn"
                  onClick={() => {
                    setShowOverdueAlert(false);
                    const todayStr = new Date().toDateString();
                    sessionStorage.setItem(`dismissed_overdue_${todayStr}`, 'true');
                  }}
                >
                  Dismiss
                </button>
                <button
                  className="tb-daily-submit-btn"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                  onClick={() => {
                    setShowOverdueAlert(false);
                    const todayStr = new Date().toDateString();
                    sessionStorage.setItem(`dismissed_overdue_${todayStr}`, 'true');
                    document.getElementById('tb-daily-textarea-input')?.focus();
                  }}
                >
                  Submit Report Now
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
