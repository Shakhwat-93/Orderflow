import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { ActivityTimeline } from './ActivityTimeline';
import { useTasks } from '../context/TaskContext';
import { User, Calendar, Clock, Target, ListChecks, Hash, Package, ExternalLink } from 'lucide-react';
import './TaskDetailsModal.css';

export const TaskDetailsModal = ({ task, taskType, isOpen, onClose, onOpenOrder }) => {
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const { assignedTasks, dailyTasks, updateAssignedTask } = useTasks();

  const isAssigned = taskType === 'assigned';
  const Icon = isAssigned ? Target : ListChecks;

  // Reactively lookup latest status and details
  const currentTask = task ? (
    isAssigned 
      ? assignedTasks.find(t => t.id === task.id) || task 
      : dailyTasks.find(t => t.id === task.id) || task
  ) : null;

  useEffect(() => {
    if (isOpen && currentTask?.id) {
      loadLogs();
      // OPTIMIZED: Removed realtime subscription for task logs to save DB connections.
      // Users can use the manual "Refresh" button if they need live updates.
    }
  }, [isOpen, currentTask?.id]);

  const loadLogs = async () => {
    if (!currentTask?.id) return;
    setIsLoadingLogs(true);
    try {
      const data = await api.getTaskLogs(currentTask.id);
      // Map properties to match ActivityTimeline expectations
      const mappedLogs = data.map(log => ({
        ...log,
        changed_by_user_name: log.user_name
      }));
      setLogs(mappedLogs);
    } catch (e) {
      console.error('Failed to load task logs', e);
    }
    setIsLoadingLogs(false);
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!isAssigned || !currentTask?.id || isUpdating) return;
    setIsUpdating(true);
    try {
      await updateAssignedTask(currentTask.id, { status: newStatus });
      await loadLogs();
    } catch (e) {
      console.error('Failed to update task status:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!currentTask) return null;

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon size={20} className="text-accent" />
          <span>Task Details</span>
        </div>
      }
      size="large"
    >
      <div className="task-details-grid">
        <div className="details-main">
          {/* Info Section */}
          <section className="details-section">
            <h4>Information</h4>
            <div className="info-grid">
              <div className="info-item full-width">
                <Hash size={18} />
                <div className="info-content">
                  <label>Title</label>
                  <span>{currentTask.title}</span>
                </div>
              </div>
              {currentTask.description && (
                <div className="info-item full-width">
                  <div className="info-content align-left">
                    <label>Description</label>
                    <div className="description-box">
                      {currentTask.description}
                    </div>
                  </div>
                </div>
              )}
              {isAssigned && (
                <>
                  <div className="info-item">
                    <User size={18} />
                    <div className="info-content">
                      <label>Assigned To</label>
                      <span>{currentTask.assigned_to_name || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="info-item">
                    <User size={18} />
                    <div className="info-content">
                      <label>Assigned By</label>
                      <span>{currentTask.assigned_by_name || 'System'}</span>
                    </div>
                  </div>
                  <div className="info-item">
                    <Calendar size={18} />
                    <div className="info-content">
                      <label>Due Date</label>
                      <span>{currentTask.due_date && !isNaN(new Date(currentTask.due_date).getTime()) 
                        ? new Date(currentTask.due_date).toLocaleDateString() 
                        : 'No deadline'}</span>
                    </div>
                  </div>
                </>
              )}
              {!isAssigned && (
                <div className="info-item">
                  <User size={18} />
                  <div className="info-content">
                    <label>Target Role</label>
                    <span>{currentTask.assigned_role}</span>
                  </div>
                </div>
              )}
              <div className="info-item">
                <Clock size={18} />
                <div className="info-content">
                  <label>Created At</label>
                  <span>{new Date(currentTask.created_at).toLocaleString()}</span>
                </div>
              </div>

              {currentTask.related_order_id && (
                <div className="info-item full-width mt-2">
                  <Package size={18} className="text-accent" />
                  <div className="info-content">
                    <label>Related Reference</label>
                    <button 
                      className="btn outline small" 
                      style={{ marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}
                      onClick={() => onOpenOrder && onOpenOrder(currentTask.related_order_id)}
                    >
                      View Order #{currentTask.related_order_id} <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="details-section">
            <h4>Update Status</h4>
            {isAssigned ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn small ${currentTask.status === 'pending' ? 'primary' : 'outline'}`}
                    onClick={() => handleUpdateStatus('pending')}
                    disabled={isUpdating}
                    style={{ minWidth: '90px' }}
                  >
                    Pending
                  </button>
                  <button
                    type="button"
                    className={`btn small ${currentTask.status === 'in_progress' ? 'primary' : 'outline'}`}
                    style={currentTask.status === 'in_progress' ? { backgroundColor: 'var(--tb-accent)', borderColor: 'var(--tb-accent)', color: '#fff', minWidth: '90px' } : { minWidth: '90px' }}
                    onClick={() => handleUpdateStatus('in_progress')}
                    disabled={isUpdating}
                  >
                    In Progress
                  </button>
                  <button
                    type="button"
                    className={`btn small ${currentTask.status === 'completed' ? 'completed' : 'outline'}`}
                    style={currentTask.status === 'completed' ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#fff', minWidth: '90px' } : { minWidth: '90px' }}
                    onClick={() => handleUpdateStatus('completed')}
                    disabled={isUpdating}
                  >
                    Completed
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--tb-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span>Priority:</span>
                  <strong style={{ color: currentTask.priority === 'urgent' ? '#ef4444' : currentTask.priority === 'high' ? '#f97316' : 'inherit' }}>
                    {currentTask.priority.toUpperCase()}
                  </strong>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <Badge variant="primary">DAILY ACTIVE</Badge>
                <Badge variant="warning">{currentTask.priority.toUpperCase()} PRIORITY</Badge>
              </div>
            )}
          </section>
        </div>

        <div className="details-sidebar">
          <div className="sidebar-header">
            <h4>Activity Timeline</h4>
            <button className="refresh-btn" onClick={loadLogs} disabled={isLoadingLogs}>
              {isLoadingLogs ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          <div className="activity-scroll">
            <ActivityTimeline logs={logs} />
          </div>
        </div>
      </div>
    </Modal>
  );
};
