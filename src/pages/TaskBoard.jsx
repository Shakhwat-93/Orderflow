import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import { CreateTaskOverlay } from '../components/CreateTaskOverlay';
import {
  ClipboardList, CheckCircle2, Check, Circle, Plus, Trash2, Calendar, Clock,
  AlertTriangle, ArrowRight, User, Users, Zap, ListChecks, Target,
  ChevronRight, Loader2, MessageSquare, Link2, Bell, Search, Home, MoreHorizontal, ChevronDown,
  Layout, Kanban, List, TrendingUp, Activity, ShieldCheck
} from 'lucide-react';
import './TaskBoard.css';

// ── Animation & Layout Constants ──
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 100 } }
};

const PRIORITY_CONFIG = {
  urgent: { color: '#ef4444', label: 'Urgent', icon: AlertTriangle },
  high:   { color: '#f97316', label: 'High',   icon: Zap },
  medium: { color: '#3b82f6', label: 'Medium', icon: Target },
  low:    { color: '#94a3b8', label: 'Low',    icon: Circle },
};

const ROLE_OPTIONS = ['Admin', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];

// ── Sub-components for cleaner TaskBoard ──

const DailyTaskCard = ({ task, completed, completingId, onComplete, onUncomplete, onView }) => {
  const PriorityIcon = PRIORITY_CONFIG[task.priority]?.icon || Circle;
  
  return (
    <Card className={`daily-task-card liquid-glass obsidian-glass ${completed ? 'completed' : ''}`}>
      <div className="task-glow-edge" style={{ backgroundColor: PRIORITY_CONFIG[task.priority]?.color }}></div>
      <div className="task-card-header">
        <div className="task-info">
          <button
            className={`custom-checkbox-elite ${completed ? 'is-checked' : ''}`}
            onClick={() => completed ? onUncomplete(task.id) : onComplete(task.id)}
            disabled={completingId === task.id}
          >
            {completingId === task.id ? (
              <Loader2 size={12} className="spin" />
            ) : completed ? (
              <Check size={12} strokeWidth={4} />
            ) : null}
          </button>
          <div className="title-desc">
            <h4 className={completed ? 'line-through' : ''}>{task.title}</h4>
            {task.description && <p className="task-description-limit">{task.description}</p>}
          </div>
        </div>
        <button className="premium-nav-arrow-elite" onClick={onView}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="card-footer-elite">
        <div className="footer-tag">
          <Users size={11} /> <span>{task.assigned_role}</span>
        </div>
        <div className="p-badge-mini" style={{ color: PRIORITY_CONFIG[task.priority]?.color }}>
          <PriorityIcon size={10} />
          <span>{task.priority}</span>
        </div>
      </div>
    </Card>
  );
};

const AssignedTaskCard = ({ task, onView, onStatusUpdate }) => {
  const PriorityIcon = PRIORITY_CONFIG[task.priority]?.icon || Circle;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <Card className={`assigned-task-card-elite obsidian-glass ${task.status} ${isOverdue ? 'overdue' : ''}`}>
      <div className="task-glow-edge" style={{ backgroundColor: PRIORITY_CONFIG[task.priority]?.color }}></div>
      <div className="card-top-elite">
        <div className="priority-group">
          <div className="p-dot" style={{ backgroundColor: PRIORITY_CONFIG[task.priority]?.color }}></div>
          <span className="p-label">{task.priority}</span>
        </div>
        {task.due_date && (
          <div className={`due-label ${isOverdue ? 'crit' : ''}`}>
            <Clock size={12} />
            <span>{new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        )}
      </div>
      
      <div className="card-content-elite">
        <h3 onClick={onView}>{task.title}</h3>
        {task.description && <p className="desc-text">{task.description}</p>}
        {task.status !== 'completed' && (
          <div className="card-progress-bar">
            <div className="progress-bg">
              <div 
                className="progress-fill" 
                style={{ width: task.status === 'in_progress' ? '45%' : '5%', backgroundColor: PRIORITY_CONFIG[task.priority]?.color }}
              ></div>
            </div>
          </div>
        )}
      </div>
      
      <div className="card-footer-elite">
        <div className="assignee-wrap">
          <div className="avatar-placeholder">
            {task.assigned_to_name?.charAt(0) || '?'}
          </div>
          <span className="name">{task.assigned_to_name || 'Unassigned'}</span>
        </div>
        <div className="status-toggle-elite">
          <select 
            value={task.status} 
            onChange={(e) => onStatusUpdate(e.target.value)}
          >
            <option value="pending">Todo</option>
            <option value="in_progress">Doing</option>
            <option value="completed">Done</option>
          </select>
          <ChevronDown size={12} />
        </div>
      </div>
    </Card>
  );
};

// ── Kanban Implementation ──
const KanbanColumn = ({ title, tasks, status, icon: Icon, color, onView, onStatusUpdate }) => (
  <div className="kanban-column-elite">
    <div className="column-header-elite">
      <div className="header-left">
        <div className="icon-box" style={{ backgroundColor: `${color}15`, color: color }}>
          <Icon size={16} />
        </div>
        <h3>{title}</h3>
        <span className="count-pill">{tasks.length}</span>
      </div>
      <button className="col-action"><MoreHorizontal size={16} /></button>
    </div>
    <div className="column-scroll-area">
      <AnimatePresence mode="popLayout">
        {tasks.map((task, idx) => (
          <motion.div
            key={task.id}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
          >
            <AssignedTaskCard 
              task={task} 
              onView={onView} 
              onStatusUpdate={onStatusUpdate} 
            />
          </motion.div>
        ))}
      </AnimatePresence>
      {tasks.length === 0 && (
        <div className="column-empty-state">
          <p>No {title.toLowerCase()} tasks</p>
        </div>
      )}
    </div>
  </div>
);

// ── Mobile Specific Components ──

const MobileTaskCard = ({ task, type = 'today', onView, onStatusUpdate }) => {
  const isToday = type === 'today';
  const progress = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 45 : 0;
  const config = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  
  return (
    <motion.div 
      className={`mobile-task-card-elite obsidian-glass ${type}`}
      whileTap={{ scale: 0.96 }}
      onClick={onView}
    >
      <div className="task-glow-edge" style={{ backgroundColor: config.color }}></div>
      <div className="card-top-m">
        <span className="task-time">{isToday ? 'Live Sync' : task.assigned_role || 'General'}</span>
        <div className="p-dot-m" style={{ backgroundColor: config.color }}></div>
      </div>
      
      <h3>{task.title}</h3>
      
      <div className="card-footer-m">
        <div className="meta-l">
          <div className="status-pill-m" style={{ color: config.color, backgroundColor: `${config.color}15` }}>
            {task.priority || 'Normal'}
          </div>
        </div>
        
        <div className="meta-r">
          <div className="avatar-stack-m">
             <div className="av-circle">{task.assigned_to_name?.charAt(0) || 'U'}</div>
             {task.status === 'in_progress' && <div className="live-ring"></div>}
          </div>
        </div>
      </div>
      
      {!isToday && task.status !== 'completed' && (
        <div className="task-progress-m">
           <div className="track-bg">
              <div 
                className="track-fill" 
                style={{ width: `${progress}%`, backgroundColor: config.color }}
              ></div>
           </div>
        </div>
      )}
    </motion.div>
  );
};

const BottomNav = () => (
  <nav className="mobile_bottom_nav">
    <div className="nav_dock">
      <button className="nav_item active"><Home size={22} /><span className="nav_dot"></span></button>
      <button className="nav_item"><ClipboardList size={22} /></button>
      <button className="nav_item"><Search size={22} /></button>
      <button className="nav_item"><MessageSquare size={22} /></button>
      <button className="nav_item"><User size={22} /></button>
    </div>
  </nav>
);

export const TaskBoard = () => {
  const {
    myDailyTasks, dailyTasks, assignedTasks, todayCompletions, loading,
    isCompletedToday, getCompletionFor,
    completeDailyTask, uncompleteDailyTask,
    createDailyTask, deleteDailyTask,
    createAssignedTask, updateAssignedTask, deleteAssignedTask
  } = useTasks();
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();

  const [activeTab, setActiveTab] = useState('my-tasks');
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [isCreateAssignedOpen, setIsCreateAssignedOpen] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [noteTaskId, setNoteTaskId] = useState(null);

  // Task details modal state
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskType, setSelectedTaskType] = useState('daily');

  // Admin Filters
  const [adminFilters, setAdminFilters] = useState({
    user: 'all',
    status: 'all',
    priority: 'all'
  });

  // Assigned task filter (compatibility for simple view)
  const [assignedFilter, setAssignedFilter] = useState('all'); 

  // Users list for assignment
  const [allUsers, setAllUsers] = useState([]);

  // Related order modal state
  const [selectedOrderData, setSelectedOrderData] = useState(null);

  const handleOpenOrder = async (orderId) => {
    try {
      const order = await api.getOrderById(orderId);
      if (order) setSelectedOrderData(order);
    } catch (e) {
      console.error('Failed to fetch related order:', e);
    }
  };

  useEffect(() => {
    updatePresenceContext?.('Managing Tasks');
  }, [updatePresenceContext]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('id, name, email');
      setAllUsers(data || []);
    };
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  // ── Stats Calculations ──
  const myAssignedTasks = assignedTasks.filter(t => t.assigned_to === user?.id);
  const myPendingAssignedCount = myAssignedTasks.filter(t => t.status !== 'completed').length;
  const myIncompleteDailyCount = myDailyTasks.filter(t => !isCompletedToday(t.id)).length;

  const adminStats = isAdmin ? {
    total: assignedTasks.length + dailyTasks.length,
    completed: assignedTasks.filter(t => t.status === 'completed').length + todayCompletions.length,
    pending: assignedTasks.filter(t => t.status !== 'completed').length + (dailyTasks.length - todayCompletions.length),
    rate: Math.round(((assignedTasks.filter(t => t.status === 'completed').length + todayCompletions.length) / (assignedTasks.length + dailyTasks.length || 1)) * 100)
  } : null;

  // ── Filter daily tasks ──
  const filteredDaily = isAdmin && activeTab === 'daily' ? dailyTasks : myDailyTasks;

  // ── Filter assigned tasks (Advanced for Admin, simple for user) ──
  const filteredAssigned = assignedTasks.filter(t => {
    if (isAdmin && activeTab === 'assigned') {
      const matchUser = adminFilters.user === 'all' || t.assigned_to === adminFilters.user;
      const matchStatus = adminFilters.status === 'all' || t.status === adminFilters.status;
      const matchPriority = adminFilters.priority === 'all' || t.priority === adminFilters.priority;
      return matchUser && matchStatus && matchPriority;
    }
    if (activeTab === 'my-tasks') return t.assigned_to === user?.id;
    
    // Default fallback
    if (assignedFilter === 'all') return true;
    return t.status === assignedFilter;
  });

  const dailyCompletedCount = myDailyTasks.filter(t => isCompletedToday(t.id)).length;

  // ── Handlers ──
  const [dailyForm, setDailyForm] = useState({
    title: '', description: '', assigned_role: 'Admin', priority: 'medium', recurrence: 'daily'
  });

  const handleCreateDaily = async (e) => {
    e.preventDefault();
    await createDailyTask(dailyForm);
    setDailyForm({ title: '', description: '', assigned_role: 'Admin', priority: 'medium', recurrence: 'daily' });
    setIsCreateDailyOpen(false);
  };

  const [assignedForm, setAssignedForm] = useState({
    title: '', description: '', assigned_to: '', assigned_to_name: '', priority: 'medium', due_date: '', related_order_id: ''
  });

  const handleCreateAssigned = async (e) => {
    e.preventDefault();
    const selectedUser = allUsers.find(u => u.id === assignedForm.assigned_to);
    await createAssignedTask({
      ...assignedForm,
      assigned_to_name: selectedUser?.name || '',
      due_date: assignedForm.due_date || null,
      related_order_id: assignedForm.related_order_id || null
    });
    setAssignedForm({ title: '', description: '', assigned_to: '', assigned_to_name: '', priority: 'medium', due_date: '', related_order_id: '' });
    setIsCreateAssignedOpen(false);
  };

  const handleComplete = async (taskId) => {
    setCompletingId(taskId);
    try {
      await completeDailyTask(taskId, noteInput);
      setNoteInput('');
      setNoteTaskId(null);
    } finally {
      setCompletingId(null);
    }
  };

  // ── View Logic ──
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (loading) {
// (rest of the loading screen logic)
    return (
      <div className="task-board">
        <div className="loading-screen">Loading tasks...</div>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="mobile-task-board-container">
        {/* Header */}
        <header className="mobile-header">
          <div className="header-left">
            <div className="profile-img-container">
              <img src={profile?.avatar_url || "https://i.pravatar.cc/150?u=12"} alt="avatar" />
            </div>
            <div className="greeting-text">
              <h2>Hi, {profile?.name?.split(' ')[0] || 'User'}</h2>
              <p>Good Morning</p>
            </div>
          </div>
          <button className="notif-btn"><Bell size={20} /></button>
        </header>

        <section className="mobile-scroll-content">
          {/* Action Bar */}
          <button className="mobile-qab" onClick={() => setIsCreateDailyOpen(true)}>
            Add new task +
          </button>

          {/* Date Selector */}
          <div className="mobile-date-selector">
            {[22, 23, 24, 25, 26, 27, 28].map((d, i) => (
              <div key={d} className={`date-item ${d === 25 ? 'active' : ''}`}>
                <span className="day-name">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
                <span className="day-number">{d}</span>
                {d === 25 && <div className="active-dot"></div>}
              </div>
            ))}
          </div>

          {/* Today Calls/Tasks */}
          <div className="mobile-section">
            <h4 className="section-title">Today Tasks</h4>
            <div className="mobile-cards-list">
              {myDailyTasks.slice(0, 2).map(task => (
                <MobileTaskCard 
                  key={task.id} 
                  task={task} 
                  type="today"
                  onView={() => { setSelectedTask(task); setSelectedTaskType('daily'); }}
                />
              ))}
              {myDailyTasks.length === 0 && <p className="empty-mini">No tasks for today.</p>}
            </div>
          </div>

          {/* Active Tasks */}
          <div className="mobile-section">
            <h4 className="section-title">Active Task</h4>
            <div className="mobile-cards-list">
              {myAssignedTasks.slice(0, 2).map(task => (
                <MobileTaskCard 
                  key={task.id} 
                  task={task} 
                  type="active"
                  onView={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }}
                />
              ))}
              {myAssignedTasks.length === 0 && <p className="empty-mini">No active tasks.</p>}
            </div>
          </div>
        </section>

        <BottomNav />

        {/* Modals from Desktop view are still needed */}
        <Modal isOpen={isCreateDailyOpen} onClose={() => setIsCreateDailyOpen(false)} title="Create Daily Task">
          {/* (Same form content) */}
          <form onSubmit={handleCreateDaily} className="task-form">
            <Input
              label="Task Title"
              value={dailyForm.title}
              onChange={e => setDailyForm({ ...dailyForm, title: e.target.value })}
              placeholder="e.g., Check factory stock levels"
              required
            />
             <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setIsCreateDailyOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary"><Plus size={16} /> Create Task</Button>
            </div>
          </form>
        </Modal>

        <TaskDetailsModal
          task={selectedTask}
          taskType={selectedTaskType}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onOpenOrder={handleOpenOrder}
        />
      </div>
    );
  }

  return (
    <motion.div 
      className="task-board-elite"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Header Command Center ── */}
      <motion.div className="task-header-hub" variants={itemVariants}>
        <div className="header-main-group">
          <div className="hub-heading">
            <div className="icon-box">
              <ClipboardList size={28} />
            </div>
            <div>
              <h1>Workspace Commands</h1>
              <p>Orchestrate team operations and daily focus</p>
            </div>
          </div>
          <div className="header-stats-hub">
            <div className="hub-metric">
              <span className="lv">Efficiency</span>
              <div className="vv-row">
                <TrendingUp size={14} className="text-success" />
                <span className="vv">{isAdmin ? adminStats.rate : Math.round((dailyCompletedCount / (myDailyTasks.length || 1)) * 100)}%</span>
              </div>
            </div>
            <div className="hub-metric">
              <span className="lv">Velocity</span>
              <div className="vv-row">
                <Activity size={14} className="text-accent" />
                <span className="vv">{isAdmin ? adminStats.completed : dailyCompletedCount}</span>
              </div>
            </div>
            <div className="hub-metric">
              <span className="lv">Security</span>
              <div className="vv-row">
                <ShieldCheck size={14} className="text-primary" />
                <span className="vv">Active</span>
              </div>
            </div>
          </div>
        </div>

        <div className="header-action-row">
          <div className="view-toggle-hub">
            <button 
              className={`toggle-btn ${activeTab === 'my-tasks' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-tasks')}
            >
              <User size={16} /> <span>Focus</span>
            </button>
            <button 
              className={`toggle-btn ${activeTab === 'daily' ? 'active' : ''}`}
              onClick={() => setActiveTab('daily')}
            >
              <ListChecks size={16} /> <span>Daily</span>
            </button>
            <button 
              className={`toggle-btn ${activeTab === 'assigned' ? 'active' : ''}`}
              onClick={() => setActiveTab('assigned')}
            >
               {isAdmin ? <Kanban size={16} /> : <Target size={16} />} 
               <span>{isAdmin ? 'Kanban' : 'Assigned'}</span>
            </button>
          </div>

          {isAdmin && (
            <button
              className="hub-primary-btn"
              onClick={() => activeTab === 'daily' ? setIsCreateDailyOpen(true) : setIsCreateAssignedOpen(true)}
            >
              <Plus size={18} />
              <span>{activeTab === 'daily' ? 'Sync Daily' : 'Launch Task'}</span>
            </button>
          )}
        </div>
      </motion.div>


      {/* ── My Tasks Tab ── */}
      {activeTab === 'my-tasks' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="personal-focus-section"
        >
          <div className="section-header">
            <div className="header-label-group">
                <Clock size={20} />
                <h2>Personal Focus</h2>
            </div>
            <p className="section-desc">Tasks currently assigned to you or required by your role.</p>
          </div>

          <div className="my-tasks-container">
            <div className="my-tasks-column">
              <h4>Daily Tasks</h4>
              <div className="daily-tasks-grid">
                {myDailyTasks.map(task => (
                   <DailyTaskCard 
                      key={task.id} 
                      task={task} 
                      completed={isCompletedToday(task.id)}
                      completingId={completingId}
                      onComplete={handleComplete}
                      onUncomplete={uncompleteDailyTask}
                      onView={() => { setSelectedTask(task); setSelectedTaskType('daily'); }}
                    />
                ))}
                {myDailyTasks.length === 0 && <p className="empty-msg">No daily tasks for your role.</p>}
              </div>
            </div>

            <div className="my-tasks-column">
              <h4>Assigned Tasks</h4>
              <div className="assigned-tasks-grid">
                {myAssignedTasks.map(task => (
                  <AssignedTaskCard 
                    key={task.id} 
                    task={task} 
                    onView={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }}
                    onStatusUpdate={(s) => updateAssignedTask(task.id, { status: s })}
                  />
                ))}
                {myAssignedTasks.length === 0 && <p className="empty-msg">No tasks assigned to you.</p>}
              </div>
            </div>
          </div>
        </motion.div>
      )}


      {/* ── Daily Tasks Tab ── */}
      {activeTab === 'daily' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="daily-tasks-grid">
            <AnimatePresence>
              {filteredDaily.map((task, idx) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <DailyTaskCard 
                    task={task}
                    completed={isCompletedToday(task.id)}
                    completingId={completingId}
                    onComplete={handleComplete}
                    onUncomplete={uncompleteDailyTask}
                    onView={() => { setSelectedTask(task); setSelectedTaskType('daily'); }}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredDaily.length === 0 && (
              <Card className="empty-card liquid-glass">
                <motion.div
                  initial={{ rotate: -10 }}
                  animate={{ rotate: 10 }}
                  transition={{ repeat: Infinity, duration: 2, repeatType: 'reverse' }}
                >
                  <ListChecks size={48} className="empty-icon text-accent" />
                </motion.div>
                <h3>No Daily Tasks</h3>
                <p>{isAdmin ? 'Create your first daily task to get started.' : 'No tasks assigned to your role yet.'}</p>
              </Card>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Assigned / Kanban Tab ── */}
      {activeTab === 'assigned' && (
        <motion.div
          className="kanban-wrapper-elite"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {isAdmin ? (
            <div className="kanban-board-elite">
              <KanbanColumn 
                title="Backlog" 
                status="pending"
                tasks={filteredAssigned.filter(t => t.status === 'pending')}
                icon={ClipboardList}
                color="var(--text-tertiary)"
                onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
              />
              <KanbanColumn 
                title="Active Execution" 
                status="in_progress"
                tasks={filteredAssigned.filter(t => t.status === 'in_progress')}
                icon={Activity}
                color="var(--accent)"
                onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
              />
              <KanbanColumn 
                title="Finalized" 
                status="completed"
                tasks={filteredAssigned.filter(t => t.status === 'completed')}
                icon={CheckCircle2}
                color="var(--color-success)"
                onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
              />
            </div>
          ) : (
            <div className="assigned-tasks-grid-elite">
              <AnimatePresence>
                {filteredAssigned.map((task, idx) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <AssignedTaskCard 
                      task={task}
                      onView={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }}
                      onStatusUpdate={(s) => updateAssignedTask(task.id, { status: s })}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      <CreateTaskOverlay
        isOpen={isCreateDailyOpen || isCreateAssignedOpen}
        onClose={() => {
          setIsCreateDailyOpen(false);
          setIsCreateAssignedOpen(false);
        }}
        defaultType={isCreateAssignedOpen ? 'assigned' : 'daily'}
      />

      {/* ── Task Details & History Modal ── */}
      <TaskDetailsModal
        task={selectedTask}
        taskType={selectedTaskType}
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        onOpenOrder={handleOpenOrder}
      />

      {/* ── Related Order Details Modal ── */}
      <OrderDetailsModal
        order={selectedOrderData}
        isOpen={!!selectedOrderData}
        onClose={() => setSelectedOrderData(null)}
      />
    </motion.div>
  );
};
