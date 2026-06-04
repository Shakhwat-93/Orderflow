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

  useEffect(() => { updatePresenceContext?.('Managing Tasks'); }, [updatePresenceContext]);

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
        // If the user wasn't in the DB list for some reason, seed them
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
        <>
          {/* ── TODAY'S TASKS TABLE ───────────────────────────────────── */}
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

            <div className="tb-table-wrapper">
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
        /* ── TEAM PERFORMANCE VIEW ──────────────────────────────────── */
        <div className="tb-team-view-container">
          {/* Left Column: Team List & Stats */}
          <div className="tb-section-card" style={{ height: '100%' }}>
            <div className="tb-section-header" style={{ padding: '16px 20px' }}>
              <div>
                <h2 className="tb-section-title">Team Members</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)' }}>
                  Select a member to view tasks
                </span>
              </div>
            </div>
            
            <div style={{
              maxHeight: '600px',
              overflowY: 'auto',
              padding: '8px'
            }}>
              {loadingUsers ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--tb-text-muted)' }}>
                  <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 8px' }} />
                  <span>Loading members...</span>
                </div>
              ) : userStatsList.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--tb-text-muted)' }}>
                  No members found.
                </div>
              ) : (
                userStatsList.map(member => {
                  const isSelected = selectedUserId === member.id || (!selectedUserId && userStatsList[0]?.id === member.id);
                  // Set selected user ID if not already selected
                  if (!selectedUserId && isSelected) {
                    setSelectedUserId(member.id);
                  }
                  
                  const primaryRole = member.roles[0] || 'Staff';
                  const completionPct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
                  
                  return (
                    <div
                      key={member.id}
                      onClick={() => setSelectedUserId(member.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        padding: '14px',
                        borderRadius: '12px',
                        background: isSelected ? 'var(--tb-accent-bg)' : 'transparent',
                        border: `1px solid ${isSelected ? 'var(--tb-accent)' : 'transparent'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        marginBottom: '6px'
                      }}
                      className="tb-team-member-item"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="tb-owner-av" style={{
                          width: '36px',
                          height: '36px',
                          fontSize: '0.9rem',
                          flexShrink: 0
                        }}>
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            member.name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontWeight: '700', fontSize: '0.88rem', color: 'var(--tb-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {member.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--tb-text-muted)', textTransform: 'capitalize' }}>
                            {primaryRole}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--tb-text-sub)' }}>
                        <span>Done: <strong>{member.completed}/{member.total}</strong></span>
                        <span>Assigned by me: <strong>{member.assignedByMeCount}</strong></span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="tb-progress-bar" style={{ height: '4px' }}>
                          <div className="tb-progress-fill" style={{ width: `${completionPct}%`, background: 'var(--tb-accent)' }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--tb-text-sub)' }}>{completionPct}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

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

                    <div className="tb-table-wrapper">
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

                    <div className="tb-table-wrapper">
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
                  </div>
                </>
              );
            })()}
          </div>
        </div>
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
