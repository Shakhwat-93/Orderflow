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
  AlertTriangle, User, Users, Zap, ListChecks, Target,
  ChevronRight, Loader2, Search, List, Kanban, TrendingUp, Activity, ShieldCheck, MoreHorizontal, ChevronDown
} from 'lucide-react';
import {
  hoverLift,
  motionTransition,
  pageVariants,
  scaleItemVariants,
} from '../lib/motion';
import './TaskBoard.css';

// ── Animation Constants ──
const PRIORITY_CONFIG = {
  urgent: { color: '#ef4444', label: 'Urgent', icon: AlertTriangle },
  high:   { color: '#f97316', label: 'High',   icon: Zap },
  medium: { color: '#3b82f6', label: 'Medium', icon: Target },
  low:    { color: '#94a3b8', label: 'Low',    icon: Circle },
};

// ── Sub-components for Elite Dashboard ──

const StatusCard = ({ title, count, total, color, progress }) => (
  <Card className="status-highlight-card" style={{ backgroundColor: color }}>
    <div className="card-top">
       <div className="card-info">
          <h3>{title}</h3>
          <p>Task Portfolio</p>
       </div>
       <button className="premium-nav-arrow-elite"><ChevronRight size={14} /></button>
    </div>
    
    <div className="card-middle">
       <div className="avatar-stack-lite">
          {[1, 2, 3].map(i => (
             <div key={i} className="stack-av">?</div>
          ))}
          <div className="stack-count">+{count > 3 ? count - 3 : 0}</div>
       </div>
    </div>

    <div className="card-bottom">
       <div className="tasks-meta">
          <span className="count-num">{count}</span>
          <span className="count-label">Tasks</span>
       </div>
       <div className="progress-container-lite">
          <div className="progress-track-lite">
             <motion.div 
               className="progress-fill-lite"
               style={{ backgroundColor: 'white' }}
               initial={{ width: 0 }}
               animate={{ width: `${progress}%` }}
               transition={motionTransition.page}
             />
          </div>
       </div>
    </div>
  </Card>
);

const SummaryWidget = ({ label, value, icon: Icon, trend, trendType = 'up' }) => (
  <Card className="summary-widget-lite">
     <div className="widget-row">
        <div className="widget-icon">
           <Icon size={18} />
        </div>
        {trend && (
          <div className={`widget-trend ${trendType}`}>
             {trendType === 'up' ? '▲' : '▼'} {trend}
          </div>
        )}
     </div>
     <div className="widget-content">
        <h3>{value}</h3>
        <p>{label}</p>
     </div>
  </Card>
);

const HorizontalTaskItem = ({ task, onView }) => {
  const config = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  return (
    <motion.div 
      className="horizontal-task-lite"
      whileHover={hoverLift}
      onClick={onView}
    >
      <div className="accent-bar" style={{ backgroundColor: config.color }}></div>
      <div className="task-main">
         <h4>{task.title}</h4>
         <p>{task.assigned_to_name || 'General Operation'}</p>
      </div>
      <div className="task-status-indicator">
         {task.status === 'completed' ? <CheckCircle2 size={18} className="text-success" /> : <div className="status-ring"></div>}
      </div>
    </motion.div>
  );
};

const TimelineItem = ({ time, task, color }) => (
  <div className="timeline-item-elite">
     <div className="time-col">
        <span className="time-text">{time}</span>
        <span className="label-text">Entry</span>
     </div>
     <div className="connector-col">
        <div className="marker" style={{ backgroundColor: color }}></div>
        <div className="line"></div>
     </div>
     <div className="content-col">
        <div className="timeline-task-preview">
           <h4>{task.title}</h4>
           <div className="preview-meta">
              <span>{task.assigned_role || 'Member'}</span>
              <ChevronRight size={12} />
           </div>
        </div>
     </div>
  </div>
);

const KanbanColumn = ({ title, tasks, status, icon: Icon, color, onView, onStatusUpdate }) => (
  <div className="kanban-column-lite">
    <div className="column-header-lite">
      <div className="header-left">
        <div className="icon-box" style={{ backgroundColor: `${color}15`, color: color }}>
          <Icon size={16} />
        </div>
        <h3>{title}</h3>
        <span className="count-pill">{tasks.length}</span>
      </div>
    </div>
    <div className="column-scroll-area">
      <AnimatePresence mode="popLayout">
        {tasks.map((task) => (
          <motion.div
            key={task.id}
            layout
            variants={scaleItemVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
             <Card className="kanban-task-card-lite" onClick={() => onView(task)}>
                <div className="priority-label" style={{ color }}>{task.priority}</div>
                <h4>{task.title}</h4>
                <div className="card-footer-lite">
                   <div className="av">?</div>
                   <div className="status-dropdown">
                      <select 
                         value={task.status} 
                         onClick={(e) => e.stopPropagation()}
                         onChange={(e) => onStatusUpdate(task.id, e.target.value)}
                      >
                         <option value="pending">Pending</option>
                         <option value="in_progress">Active</option>
                         <option value="completed">Done</option>
                      </select>
                   </div>
                </div>
             </Card>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  </div>
);

export const TaskBoard = () => {
  const {
    myDailyTasks, assignedTasks, todayCompletions, loading,
    isCompletedToday,
    completeDailyTask,
    updateAssignedTask
  } = useTasks();
  const { user, profile, isAdmin, updatePresenceContext } = useAuth();

  const [activeTab, setActiveTab] = usePersistentState('panel:tasks:tab', 'overview'); 
  const [isCreateDailyOpen, setIsCreateDailyOpen] = useState(false);
  const [isCreateAssignedOpen, setIsCreateAssignedOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTaskType, setSelectedTaskType] = useState('daily');
  const [selectedOrderData, setSelectedOrderData] = useState(null);

  useEffect(() => {
    updatePresenceContext?.('Managing Tasks');
  }, [updatePresenceContext]);

  const handleOpenOrder = async (orderId) => {
    try {
      const order = await api.getOrderById(orderId);
      if (order) setSelectedOrderData(order);
    } catch (e) {
      console.error('Failed to fetch related order:', e);
    }
  };

  // Stats Calculations
  const stats = {
     backlog: assignedTasks.filter(t => t.status === 'pending').length,
     inProgress: assignedTasks.filter(t => t.status === 'in_progress').length,
     completed: assignedTasks.filter(t => t.status === 'completed').length,
     total: assignedTasks.length
  };

  const myAssignedTasks = assignedTasks.filter(t => t.assigned_to === user?.id);
  const myCompletedTodayCount = todayCompletions.length;

  if (loading) {
    return <div className="loading-screen">Preparing Workspace...</div>;
  }

  return (
    <div className="task-board-wrapper-lite">
       <motion.header 
          className="elite-dashboard-header"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
       >
          <div className="header-left">
             <span className="date-display">{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
             <h1>Hello, {profile?.name?.split(' ')[0] || 'James'}</h1>
          </div>
          <div className="header-right">
             <div className="elite-search-bar">
                <Search size={18} />
                <input type="text" placeholder="Search tasks..." />
             </div>
             <button className="add-task-btn-lite" onClick={() => setIsCreateAssignedOpen(true)}>
                Add New Task
             </button>
             <button className="view-toggle-lite" onClick={() => setActiveTab(activeTab === 'kanban' ? 'overview' : 'kanban')}>
                {activeTab === 'kanban' ? <List size={20} /> : <Kanban size={20} />}
             </button>
          </div>
       </motion.header>

       <div className="dashboard-content-layout">
          <main className="dashboard-main-area">
             {activeTab === 'overview' ? (
                <div className="overview-scrolling-view">
                   {/* 🧊 Status Category Highlights */}
                   <section className="status-highlight-section">
                      <StatusCard 
                         title="Completed" 
                         count={stats.completed} 
                         color="#1d5c5e" 
                         progress={(stats.completed / (stats.total || 1)) * 100}
                      />
                      <StatusCard 
                         title="In Progress" 
                         count={stats.inProgress} 
                         color="#f46d43" 
                         progress={(stats.inProgress / (stats.total || 1)) * 100}
                      />
                      <StatusCard 
                         title="Backlog" 
                         count={stats.backlog} 
                         color="#8b80e8" 
                         progress={(stats.backlog / (stats.total || 1)) * 100}
                      />
                   </section>

                   <div className="summary-upcoming-grid">
                      <section className="task-summary-section">
                         <h2>Task Summary</h2>
                         <div className="summary-grid-lite">
                            <SummaryWidget label="Active Tasks" value={stats.inProgress} icon={Activity} trend="4%" />
                            <SummaryWidget label="Completed" value={stats.completed} icon={CheckCircle2} />
                            <SummaryWidget label="Daily Focus" value={myDailyTasks.length} icon={Zap} />
                            <SummaryWidget label="Finished Today" value={myCompletedTodayCount} icon={ShieldCheck} trend="8%" />
                            <SummaryWidget label="Efficiency" value="94%" icon={TrendingUp} />
                            <SummaryWidget label="Waitlist" value={stats.backlog} icon={ClipboardList} trendType="down" />
                         </div>
                      </section>

                      <section className="upcoming-tasks-section">
                         <h2>Upcoming Task</h2>
                         <div className="upcoming-list-lite">
                            {assignedTasks.filter(t => t.status !== 'completed').slice(0, 4).map(task => (
                               <HorizontalTaskItem 
                                  key={task.id} 
                                  task={task} 
                                  onView={() => { setSelectedTask(task); setSelectedTaskType('assigned'); }} 
                               />
                            ))}
                            {assignedTasks.length === 0 && <p className="empty-state">No upcoming tasks.</p>}
                         </div>
                      </section>
                   </div>
                </div>
             ) : (
                <div className="kanban-view-container">
                   <div className="kanban-board-lite">
                      <KanbanColumn 
                        title="Backlog" 
                        status="pending"
                        tasks={assignedTasks.filter(t => t.status === 'pending')}
                        icon={ClipboardList}
                        color="#8b80e8"
                        onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                        onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                      />
                      <KanbanColumn 
                        title="In Progress" 
                        status="in_progress"
                        tasks={assignedTasks.filter(t => t.status === 'in_progress')}
                        icon={Activity}
                        color="#f46d43"
                        onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                        onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                      />
                      <KanbanColumn 
                        title="Completed" 
                        status="completed"
                        tasks={assignedTasks.filter(t => t.status === 'completed')}
                        icon={CheckCircle2}
                        color="#1d5c5e"
                        onView={(t) => { setSelectedTask(t); setSelectedTaskType('assigned'); }}
                        onStatusUpdate={(id, s) => updateAssignedTask(id, { status: s })}
                      />
                   </div>
                </div>
             )}
          </main>

          <aside className="dashboard-timeline-sidebar">
             <div className="sidebar-calendar-box">
                <div className="cal-header">
                   <Calendar size={18} />
                   <h3>{new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
                </div>
                <div className="cal-grid-mini">
                   {[14, 15, 16, 17, 18, 19, 20].map(d => (
                      <div key={d} className={`cal-date ${d === 18 ? 'active' : ''}`}>
                         {d}
                      </div>
                   ))}
                </div>
             </div>

             <div className="daily-schedule-timeline">
                <div className="timeline-date-label">Today's Schedule</div>
                <div className="timeline-scroll-area">
                   <TimelineItem time="09:00" task={{ title: 'Workflow Setup' }} color="#1d5c5e" />
                   <TimelineItem time="10:30" task={{ title: 'Factory Coordination' }} color="#f46d43" />
                   {myAssignedTasks.slice(0, 3).map((t, idx) => (
                      <TimelineItem 
                         key={t.id} 
                         time={`${14 + idx}:00`} 
                         task={t} 
                         color={idx % 2 === 0 ? '#8b80e8' : '#1d5c5e'} 
                      />
                   ))}
                </div>
             </div>
          </aside>
       </div>

       <CreateTaskOverlay
         isOpen={isCreateDailyOpen || isCreateAssignedOpen}
         onClose={() => {
           setIsCreateDailyOpen(false);
           setIsCreateAssignedOpen(false);
         }}
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
