import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { Bell, AlertTriangle, Calendar, User, Check, Zap, Sparkles, X } from 'lucide-react';
import './TaskAlertManager.css';

export const TaskAlertManager = () => {
  const { assignedTasks, loading } = useTasks();
  const { user } = useAuth();
  
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [currentAlertIndex, setCurrentAlertIndex] = useState(0);

  useEffect(() => {
    if (!user || loading || !assignedTasks) return;

    const userId = user.id;
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Get lists of acknowledged task IDs
    const ackTasksStr = localStorage.getItem(`ack_tasks_${userId}`) || '[]';
    const ackDueStr = localStorage.getItem(`ack_due_${userId}`) || '[]';
    
    let ackTasks = [];
    let ackDue = [];
    try {
      ackTasks = JSON.parse(ackTasksStr);
      ackDue = JSON.parse(ackDueStr);
    } catch (e) {
      ackTasks = [];
      ackDue = [];
    }

    const pendingAlerts = [];

    // Filter tasks assigned to me that are not completed
    const myTasks = assignedTasks.filter(
      t => t.assigned_to === userId && t.status !== 'completed'
    );

    myTasks.forEach(task => {
      // 1. Check for New Assignment Alerts
      if (!ackTasks.includes(task.id)) {
        pendingAlerts.push({
          id: `new_${task.id}`,
          taskId: task.id,
          type: 'new',
          title: 'New Task Assigned',
          taskTitle: task.title,
          priority: task.priority || 'medium',
          dueDate: task.due_date,
          actor: task.assigned_by_name || 'System',
          description: task.description
        });
      }

      // 2. Check for Due Soon / Overdue Alerts
      if (task.due_date) {
        const dueDate = new Date(task.due_date);
        const isOverdue = dueDate < now;
        const isDueSoon = dueDate <= tomorrow && dueDate >= now;

        if ((isOverdue || isDueSoon) && !ackDue.includes(task.id)) {
          pendingAlerts.push({
            id: `due_${task.id}`,
            taskId: task.id,
            type: isOverdue ? 'overdue' : 'due_soon',
            title: isOverdue ? 'Task Overdue Alert' : 'Task Due Soon',
            taskTitle: task.title,
            priority: task.priority || 'medium',
            dueDate: task.due_date,
            actor: task.assigned_by_name || 'System',
            isOverdue
          });
        }
      }
    });

    // Update active alerts queue
    setActiveAlerts(pendingAlerts);
  }, [assignedTasks, loading, user]);

  const handleAcknowledge = (alert) => {
    if (!user) return;
    const userId = user.id;

    if (alert.type === 'new') {
      const ackTasksStr = localStorage.getItem(`ack_tasks_${userId}`) || '[]';
      try {
        const ackTasks = JSON.parse(ackTasksStr);
        if (!ackTasks.includes(alert.taskId)) {
          ackTasks.push(alert.taskId);
          localStorage.setItem(`ack_tasks_${userId}`, JSON.stringify(ackTasks));
        }
      } catch (e) {
        localStorage.setItem(`ack_tasks_${userId}`, JSON.stringify([alert.taskId]));
      }
    } else {
      const ackDueStr = localStorage.getItem(`ack_due_${userId}`) || '[]';
      try {
        const ackDue = JSON.parse(ackDueStr);
        if (!ackDue.includes(alert.taskId)) {
          ackDue.push(alert.taskId);
          localStorage.setItem(`ack_due_${userId}`, JSON.stringify(ackDue));
        }
      } catch (e) {
        localStorage.setItem(`ack_due_${userId}`, JSON.stringify([alert.taskId]));
      }
    }

    // Move to next alert or clear
    if (currentAlertIndex < activeAlerts.length - 1) {
      setCurrentAlertIndex(prev => prev + 1);
    } else {
      setActiveAlerts([]);
      setCurrentAlertIndex(0);
    }
  };

  const currentAlert = activeAlerts[currentAlertIndex];

  return (
    <AnimatePresence>
      {currentAlert && (
        <div className="task-alert-overlay">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`task-alert-card priority-${currentAlert.priority} type-${currentAlert.type}`}
          >
            {/* Background Glow */}
            <div className="task-alert-glow" />

            {/* Close Button (Force acknowledges) */}
            <button 
              className="task-alert-close-btn"
              onClick={() => handleAcknowledge(currentAlert)}
            >
              <X size={18} />
            </button>

            {/* Icon & Title */}
            <div className="task-alert-header">
              <div className="task-alert-icon-wrapper">
                {currentAlert.type === 'new' ? (
                  <Sparkles className="task-alert-icon pulse-animation" size={24} />
                ) : (
                  <AlertTriangle className="task-alert-icon shake-animation" size={24} />
                )}
              </div>
              <div className="task-alert-title-group">
                <span className="task-alert-badge">
                  {currentAlert.type === 'new' ? 'New Assignment' : currentAlert.type === 'overdue' ? 'Overdue' : 'Due Soon'}
                </span>
                <h3 className="task-alert-title">{currentAlert.title}</h3>
              </div>
            </div>

            {/* Task Info Content */}
            <div className="task-alert-body">
              <h4 className="task-alert-task-title">{currentAlert.taskTitle}</h4>
              {currentAlert.description && (
                <p className="task-alert-task-desc">{currentAlert.description}</p>
              )}

              <div className="task-alert-meta-grid">
                <div className="task-alert-meta-item">
                  <User size={14} />
                  <span>By: <strong>{currentAlert.actor}</strong></span>
                </div>
                {currentAlert.dueDate && (
                  <div className="task-alert-meta-item">
                    <Calendar size={14} />
                    <span>
                      Due: <strong>
                        {new Date(currentAlert.dueDate).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </strong>
                    </span>
                  </div>
                )}
                <div className="task-alert-meta-item">
                  <Zap size={14} />
                  <span>Priority: <strong className="priority-text">{currentAlert.priority.toUpperCase()}</strong></span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="task-alert-actions">
              <button 
                type="button"
                className="task-alert-action-btn primary"
                onClick={() => handleAcknowledge(currentAlert)}
              >
                <Check size={16} />
                <span>Acknowledge</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
