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
  ChevronRight, Loader2, MessageSquare, Link2, Bell, Search, Home, MoreHorizontal, ChevronDown
} from 'lucide-react';
import './TaskBoard.css';

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
    <Card className={`daily-task-card liquid-glass ${completed ? 'completed' : ''}`}>
      <div className="task-card-header">
        <div className="task-info">
          <button
            className={`custom-checkbox ${completed ? 'is-checked' : ''}`}
            onClick={() => completed ? onUncomplete(task.id) : onComplete(task.id)}
            disabled={completingId === task.id}
          >
            {completingId === task.id ? (
              <Loader2 size={14} className="spin" />
            ) : completed ? (
              <Check size={14} strokeWidth={3} />
            ) : null}
          </button>
          <div className="title-desc">
            <h4 className={completed ? 'line-through' : ''}>{task.title}</h4>
            {task.description && <p className="task-description">{task.description}</p>}
          </div>
        </div>
        <div className="task-actions-top">
          <span
            className="priority-badge"
            style={{ 
              color: PRIORITY_CONFIG[task.priority]?.color,
              backgroundColor: `${PRIORITY_CONFIG[task.priority]?.color}12`,
              borderColor: `${PRIORITY_CONFIG[task.priority]?.color}25`
            }}
          >
            <PriorityIcon size={12} />
            {PRIORITY_CONFIG[task.priority]?.label}
          </span>
          <button className="premium-nav-arrow" onClick={onView} title="View Details">
            <ChevronRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </div>
      <div className="card-footer">
        <span className="task-meta-item">
          <Users size={12} /> {task.assigned_role}
        </span>
      </div>
    </Card>
  );
};

const AssignedTaskCard = ({ task, onView, onStatusUpdate }) => {
  const PriorityIcon = PRIORITY_CONFIG[task.priority]?.icon || Circle;
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

  return (
    <Card className={`assigned-task-card liquid-glass ${task.status} ${isOverdue ? 'overdue' : ''}`}>
      <div className="task-card-header">
        <Badge 
          className="priority-badge"
          style={{ 
            color: PRIORITY_CONFIG[task.priority]?.color,
            backgroundColor: `${PRIORITY_CONFIG[task.priority]?.color}12`,
            borderColor: `${PRIORITY_CONFIG[task.priority]?.color}25`
          }}
        >
          <PriorityIcon size={12} />
          <span>{PRIORITY_CONFIG[task.priority]?.label}</span>
        </Badge>
        {task.due_date && !isNaN(new Date(task.due_date).getTime()) && (
          <span className={`due-date ${isOverdue ? 'overdue-text' : ''}`}>
            <Calendar size={14} />
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      
      <div className="assigned-task-content">
        <h3>{task.title}</h3>
        {task.description && <p className="task-description">{task.description}</p>}
      </div>
      
      <div className="card-footer">
        <div className="task-meta-item">
          <User size={14} />
          <span>{task.assigned_to_name || 'Unassigned'}</span>
        </div>
        <div className="task-actions">
          <div className="elite-select-wrapper">
            <select 
              value={task.status} 
              onChange={(e) => onStatusUpdate(e.target.value)}
              className="elite-select"
            >
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
            <ChevronDown size={14} className="elite-select-chevron" />
          </div>
          <Button variant="ghost" size="small" onClick={onView} className="details-btn">
            Details
          </Button>
        </div>
      </div>
    </Card>
  );
};

// ── Mobile Specific Components ──

const MobileTaskCard = ({ task, type = 'today', onView, onStatusUpdate }) => {
  const isToday = type === 'today';
  const progress = task.status === 'completed' ? 100 : task.status === 'in_progress' ? 45 : 0;
  
  return (
    <motion.div 
      className={`mobile_task_card ${type}`}
      whileTap={{ scale: 0.98 }}
      onClick={onView}
    >
      <div className="card_top_info">
        <span className="task_time">{isToday ? '01:00-02:00 PM' : task.assigned_role || 'General'}</span>
        <button className="more_btn" onClick={(e) => { e.stopPropagation(); }}><MoreHorizontal size={16} /></button>
      </div>
      
      <h3>{task.title}</h3>
      
      <div className="card_footer_mobile">
        <div className="meta_left">
          {isToday ? (
            <span className="duration_pill">1 hour</span>
          ) : (
            <div className="active_meta">
              <span className={`priority_tag ${task.priority}`}>{task.priority}</span>
              <span className="estimate_text">12 hours</span>
            </div>
          )}
        </div>
        
        <div className="meta_right">
          <div className="avatar_stack_mini">
            <div className="avatar_s">JD</div>
            <div className="avatar_s">AS</div>
            <div className="avatar_s more">+3</div>
          </div>
        </div>
      </div>
      
      {!isToday && (
        <div className="active_task_progress">
           <div className="progress_header">
             <span className="subtasks_text">3 sub tasks</span>
             <span className="percent_text">{progress}%</span>
           </div>
           <div className="progress_bar_container">
             <div className="progress_bar_fill" style={{ width: `${progress}%` }}>
                <div className="progress_knob"></div>
             </div>
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
    <div className="task-board">
      {/* ── Header (Desktop) ── */}
      <div className="page-header">
        <div>
          <h1>Task Board</h1>
          <p>Manage daily operations and assigned responsibilities across your team.</p>
        </div>
        {isAdmin && (
          <Button
            variant="primary"
            onClick={() => activeTab === 'daily' ? setIsCreateDailyOpen(true) : setIsCreateAssignedOpen(true)}
          >
            <Plus size={18} />
            <span>{activeTab === 'daily' ? 'New Daily Task' : 'Assign Task'}</span>
          </Button>
        )}
      </div>

      {/* ... (rest of the desktop jsx remains the same) */}
      <div className="task-tabs-container">
        <div className="task-tabs">
            <button
              className={`task-tab ${activeTab === 'my-tasks' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('my-tasks')}
            >
              <User size={16} />
              <span>My Tasks</span>
              <span className="tab-count">{myPendingAssignedCount + myIncompleteDailyCount}</span>
            </button>
            <button
              className={`task-tab ${activeTab === 'daily' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('daily')}
            >
              <ListChecks size={16} />
              <span>Daily Tasks</span>
              <span className="tab-count">{isAdmin ? dailyTasks.length : myDailyTasks.length}</span>
            </button>
            <button
              className={`task-tab ${activeTab === 'assigned' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('assigned')}
            >
              <Target size={16} />
              <span>{isAdmin ? 'Team Tasks' : 'Assigned Tasks'}</span>
              <span className="tab-count">{assignedTasks.length}</span>
            </button>
        </div>
      </div>

      {/* ── Admin Metrics ── */}
      {isAdmin && (activeTab === 'assigned' || activeTab === 'daily') && (
        <motion.div 
          className="admin-task-metrics"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <Card className="metric-card liquid-glass">
            <span className="label">Total Tasks</span>
            <span className="value">{adminStats.total}</span>
          </Card>
          <Card className="metric-card liquid-glass success">
            <span className="label">Completed</span>
            <span className="value">{adminStats.completed}</span>
          </Card>
          <Card className="metric-card liquid-glass warning">
            <span className="label">Pending</span>
            <span className="value">{adminStats.pending}</span>
          </Card>
          <Card className="metric-card liquid-glass info">
            <span className="label">Completion Rate</span>
            <span className="value">{adminStats.rate}%</span>
          </Card>
        </motion.div>
      )}

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

      {/* ── Admin Filter Bar ── */}
      {isAdmin && activeTab === 'assigned' && (
        <motion.div 
          className="admin-filter-bar liquid-glass"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="filter-group">
            <label>Assigned To</label>
            <div className="elite-select-wrapper mini">
              <select 
                value={adminFilters.user} 
                onChange={(e) => setAdminFilters(prev => ({ ...prev, user: e.target.value }))}
                className="elite-select"
              >
                <option value="all">All Team Members</option>
                {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <ChevronDown size={14} className="elite-select-chevron" />
            </div>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <div className="elite-select-wrapper mini">
              <select 
                value={adminFilters.status} 
                onChange={(e) => setAdminFilters(prev => ({ ...prev, status: e.target.value }))}
                className="elite-select"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown size={14} className="elite-select-chevron" />
            </div>
          </div>
          <div className="filter-group">
            <label>Priority</label>
            <div className="elite-select-wrapper mini">
              <select 
                value={adminFilters.priority} 
                onChange={(e) => setAdminFilters(prev => ({ ...prev, priority: e.target.value }))}
                className="elite-select"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <ChevronDown size={14} className="elite-select-chevron" />
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

      {/* ── Assigned Tasks Tab ── */}
      {activeTab === 'assigned' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="assigned-tasks-grid">
            <AnimatePresence>
              {filteredAssigned.map((task, idx) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <AssignedTaskCard 
                    task={task}
                    onView={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }}
                    onStatusUpdate={(s) => updateAssignedTask(task.id, { status: s })}
                  />
                </motion.div>
              ))}
            </AnimatePresence>

            {filteredAssigned.length === 0 && (
              <Card className="empty-card liquid-glass">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1.1 }}
                  transition={{ repeat: Infinity, duration: 2, repeatType: 'reverse' }}
                >
                  <Target size={48} className="empty-icon text-accent" />
                </motion.div>
                <h3>No Tasks Found</h3>
                <p>{isAdmin ? 'Assign a task to a team member to begin.' : 'No assigned tasks found for the current filters.'}</p>
              </Card>
            )}
          </div>
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
    </div>
  );
};
