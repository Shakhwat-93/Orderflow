import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
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
  FileText, FolderOpen, Star
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
const TaskRow = ({ task, onView }) => {
  const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const s = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  return (
    <tr className="tb-task-row" onClick={() => onView(task)}>
      <td className="tb-td">
        <div className="tb-task-name-cell">
          <span className="tb-task-color-dot" style={{ background: p.color }} />
          <span className="tb-task-title">{task.title}</span>
        </div>
      </td>
      <td className="tb-td">
        <div className="tb-project-chip">
          <FolderOpen size={13} />
          {task.assigned_role || 'General'}
        </div>
      </td>
      <td className="tb-td">
        <span className="tb-date-text">{fmtDate(task.due_date)}</span>
      </td>
      <td className="tb-td">
        <span className="tb-status-badge" style={{ background: s.bg, color: s.color }}>
          {s.label}
        </span>
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
                <span className="tb-kanban-av">?</span>
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

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export const TaskBoard = () => {
  const {
    myDailyTasks, assignedTasks, todayCompletions, loading,
    isCompletedToday, completeDailyTask, updateAssignedTask
  } = useTasks();
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();

  const [activeTab, setActiveTab] = usePersistentState('panel:tasks:tab', 'overview');
  const [isCreateAssignedOpen, setIsCreateAssignedOpen] = useState(false);
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskType, setSelectedTaskType] = useState('daily');
  const [selectedOrderData, setSelectedOrderData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { updatePresenceContext?.('Managing Tasks'); }, [updatePresenceContext]);

  const handleOpenOrder = async (orderId) => {
    try {
      const order = await api.getOrderById(orderId);
      if (order) setSelectedOrderData(order);
    } catch (e) { console.error('Failed to fetch related order:', e); }
  };

  const stats = {
    backlog:    assignedTasks.filter(t => t.status === 'pending').length,
    inProgress: assignedTasks.filter(t => t.status === 'in_progress').length,
    completed:  assignedTasks.filter(t => t.status === 'completed').length,
    total:      assignedTasks.length,
  };

  const todayTasks = assignedTasks
    .filter(t => t.status !== 'completed')
    .filter(t => !searchQuery || t.title?.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice(0, 8);

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
          <button className="tb-view-toggle" onClick={() => setActiveTab(activeTab === 'kanban' ? 'overview' : 'kanban')}>
            {activeTab === 'kanban' ? <List size={18} /> : <Kanban size={18} />}
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
          <h2>Welcome Back, {profile?.name?.split(' ')[0] || 'James'} 👋</h2>
          <p>
            <span className="tb-badge-pill">{stats.backlog > 0 ? stats.backlog : 0} Tasks Due Today</span>
            <span className="tb-badge-pill warning">{stats.inProgress} Overdue Tasks</span>
            <span className="tb-badge-pill info">{stats.total} Upcoming Deadlines (This Week)</span>
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

      {activeTab === 'overview' ? (
        <>
          {/* ── TODAY'S TASKS TABLE ───────────────────────────────────── */}
          <motion.div
            className="tb-section-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <div className="tb-section-header">
              <h2 className="tb-section-title">Today's Tasks</h2>
              <div className="tb-section-actions">
                <div className="tb-search-box">
                  <Search size={14} />
                  <input
                    placeholder="Search here..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
                <button className="tb-filter-btn">
                  <Filter size={14} /> Filter
                </button>
              </div>
            </div>

            <div className="tb-table-wrapper">
              <table className="tb-table">
                <thead>
                  <tr>
                    <th className="tb-th">Task Name</th>
                    <th className="tb-th">Project</th>
                    <th className="tb-th">Due</th>
                    <th className="tb-th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {todayTasks.length > 0
                    ? todayTasks.map(t => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onView={() => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                        />
                      ))
                    : (
                      <tr>
                        <td colSpan={4} className="tb-empty-row">
                          No tasks found — you're all caught up! 🎉
                        </td>
                      </tr>
                    )
                  }
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ── LIST PROJECTS TABLE ───────────────────────────────────── */}
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
            <div className="tb-table-wrapper">
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
          </motion.div>
        </>
      ) : (
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
    </div>
  );
};
