import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Modal } from '../components/Modal';
import { Input } from '../components/Input';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { OrderDetailsModal } from '../components/OrderDetailsModal';
import {
  ClipboardList, CheckCircle2, Circle, Plus, Trash2, Calendar, Clock,
  AlertTriangle, ArrowRight, User, Users, Zap, ListChecks, Target,
  ChevronRight, Loader2, MessageSquare, Link2
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
      <div className="daily-task-header">
        <button
          className={`check-btn ${completed ? 'checked' : ''}`}
          onClick={() => completed ? onUncomplete(task.id) : onComplete(task.id)}
          disabled={completingId === task.id}
        >
          {completingId === task.id ? (
            <Loader2 size={18} className="spin" />
          ) : completed ? (
            <CheckCircle2 size={18} />
          ) : (
            <Circle size={18} />
          )}
        </button>
        <div className="daily-task-info">
          <h4 className={completed ? 'line-through' : ''}>{task.title}</h4>
          {task.description && <p className="task-desc">{task.description}</p>}
        </div>
        <div className="daily-task-meta">
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
          <button className="view-btn-icon" onClick={onView}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="daily-task-footer">
        <span className="role-tag">
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
      <div className="card-top">
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
        {task.due_date && (
          <span className={`due-date ${isOverdue ? 'overdue-text' : ''}`}>
            <Calendar size={14} />
            {new Date(task.due_date).toLocaleDateString()}
          </span>
        )}
      </div>
      
      <div className="assigned-task-content">
        <h3>{task.title}</h3>
        {task.description && <p className="task-desc">{task.description}</p>}
      </div>
      
      <div className="card-footer">
        <div className="user-assignee">
          <User size={14} />
          <span>{task.assigned_to_name || 'Unassigned'}</span>
        </div>
        <div className="status-selector">
          <select 
            value={task.status} 
            onChange={(e) => onStatusUpdate(e.target.value)}
            className={`status-pill ${task.status}`}
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <Button variant="ghost" size="small" onClick={onView}>
          Details
        </Button>
      </div>
    </Card>
  );
};

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

  if (loading) {
    return (
      <div className="task-board">
        <div className="loading-screen">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="task-board">
      {/* ── Header ── */}
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

      {/* ── Tab Toggle ── */}
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
          className="task-section"
        >
          <div className="section-header">
            <h3><Clock size={20} /> Personal Focus</h3>
            <p>Tasks currently assigned to you or required by your role.</p>
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
            <select 
              value={adminFilters.user} 
              onChange={(e) => setAdminFilters(prev => ({ ...prev, user: e.target.value }))}
            >
              <option value="all">All Team Members</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Status</label>
            <select 
              value={adminFilters.status} 
              onChange={(e) => setAdminFilters(prev => ({ ...prev, status: e.target.value }))}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="filter-group">
            <label>Priority</label>
            <select 
              value={adminFilters.priority} 
              onChange={(e) => setAdminFilters(prev => ({ ...prev, priority: e.target.value }))}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
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

      {/* ── Create Daily Task Modal ── */}
      <Modal isOpen={isCreateDailyOpen} onClose={() => setIsCreateDailyOpen(false)} title="Create Daily Task">
        <form onSubmit={handleCreateDaily} className="task-form">
          <Input
            label="Task Title"
            value={dailyForm.title}
            onChange={e => setDailyForm({ ...dailyForm, title: e.target.value })}
            placeholder="e.g., Check factory stock levels"
            required
          />
          <div className="form-group">
            <label className="input-label">Description</label>
            <textarea
              className="glass-input task-textarea"
              value={dailyForm.description}
              onChange={e => setDailyForm({ ...dailyForm, description: e.target.value })}
              placeholder="Optional details..."
              rows={3}
            />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Assigned Role</label>
              <select
                className="premium-select"
                value={dailyForm.assigned_role}
                onChange={e => setDailyForm({ ...dailyForm, assigned_role: e.target.value })}
              >
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Priority</label>
              <select
                className="premium-select"
                value={dailyForm.priority}
                onChange={e => setDailyForm({ ...dailyForm, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsCreateDailyOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary"><Plus size={16} /> Create Task</Button>
          </div>
        </form>
      </Modal>

      {/* ── Create Assigned Task Modal ── */}
      <Modal isOpen={isCreateAssignedOpen} onClose={() => setIsCreateAssignedOpen(false)} title="Assign Task">
        <form onSubmit={handleCreateAssigned} className="task-form">
          <Input
            label="Task Title"
            value={assignedForm.title}
            onChange={e => setAssignedForm({ ...assignedForm, title: e.target.value })}
            placeholder="e.g., Follow up Order #ORD-001"
            required
          />
          <div className="form-group">
            <label className="input-label">Description</label>
            <textarea
              className="glass-input task-textarea"
              value={assignedForm.description}
              onChange={e => setAssignedForm({ ...assignedForm, description: e.target.value })}
              placeholder="Task details and instructions..."
              rows={3}
            />
          </div>
          <div className="form-group">
            <label className="input-label">Assign To</label>
            <select
              className="premium-select"
              value={assignedForm.assigned_to}
              onChange={e => setAssignedForm({ ...assignedForm, assigned_to: e.target.value })}
              required
            >
              <option value="">Select team member...</option>
              {allUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="input-label">Priority</label>
              <select
                className="premium-select"
                value={assignedForm.priority}
                onChange={e => setAssignedForm({ ...assignedForm, priority: e.target.value })}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="form-group">
              <label className="input-label">Due Date</label>
              <input
                type="date"
                className="glass-input"
                value={assignedForm.due_date}
                onChange={e => setAssignedForm({ ...assignedForm, due_date: e.target.value })}
              />
            </div>
          </div>
          <Input
            label="Related Order ID (optional)"
            value={assignedForm.related_order_id}
            onChange={e => setAssignedForm({ ...assignedForm, related_order_id: e.target.value })}
            placeholder="e.g., ORD-12345"
          />
          <div className="modal-actions">
            <Button type="button" variant="ghost" onClick={() => setIsCreateAssignedOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary"><Plus size={16} /> Assign Task</Button>
          </div>
        </form>
      </Modal>

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
