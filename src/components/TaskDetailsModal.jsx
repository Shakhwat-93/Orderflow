import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { ActivityTimeline } from './ActivityTimeline';
import { User, Calendar, Clock, Target, ListChecks, Hash, Package, ExternalLink } from 'lucide-react';
import './TaskDetailsModal.css';

export const TaskDetailsModal = ({ task, taskType, isOpen, onClose, onOpenOrder }) => {
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  useEffect(() => {
    if (isOpen && task?.id) {
      loadLogs();

      // Subscribe to realtime logs for this specific task
      const logsSubscription = supabase
        .channel(`task-logs-${task.id}`)
        .on(
          'postgres_changes', 
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'task_activity_logs',
            filter: `task_id=eq.${task.id}`
          }, 
          (payload) => {
            const newLog = { ...payload.new, changed_by_user_name: payload.new.user_name };
            setLogs(prev => [newLog, ...prev]);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(logsSubscription);
      };
    }
  }, [isOpen, task?.id]);

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const data = await api.getTaskLogs(task.id);
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

  if (!task) return null;

  const isAssigned = taskType === 'assigned';
  const Icon = isAssigned ? Target : ListChecks;

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
                  <span>{task.title}</span>
                </div>
              </div>
              {task.description && (
                <div className="info-item full-width">
                  <div className="info-content align-left">
                    <label>Description</label>
                    <div className="description-box">
                      {task.description}
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
                      <span>{task.assigned_to_name || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="info-item">
                    <User size={18} />
                    <div className="info-content">
                      <label>Assigned By</label>
                      <span>{task.assigned_by_name || 'System'}</span>
                    </div>
                  </div>
                  <div className="info-item">
                    <Calendar size={18} />
                    <div className="info-content">
                      <label>Due Date</label>
                      <span>{task.due_date && !isNaN(new Date(task.due_date).getTime()) 
                        ? new Date(task.due_date).toLocaleDateString() 
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
                    <span>{task.assigned_role}</span>
                  </div>
                </div>
              )}
              <div className="info-item">
                <Clock size={18} />
                <div className="info-content">
                  <label>Created At</label>
                  <span>{new Date(task.created_at).toLocaleString()}</span>
                </div>
              </div>

              {task.related_order_id && (
                <div className="info-item full-width mt-2">
                  <Package size={18} className="text-accent" />
                  <div className="info-content">
                    <label>Related Reference</label>
                    <button 
                      className="btn outline small" 
                      style={{ marginTop: '4px', display: 'flex', gap: '6px', alignItems: 'center' }}
                      onClick={() => onOpenOrder && onOpenOrder(task.related_order_id)}
                    >
                      View Order #{task.related_order_id} <ExternalLink size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="details-section">
            <h4>Current Status</h4>
            <div className="status-tracking-wrap">
              <Badge variant={isAssigned ? (
                task.status === 'completed' ? 'completed' : 
                task.status === 'in_progress' ? 'factory' : 'default'
              ) : 'primary'}>
                {isAssigned ? task.status.replace('_', ' ').toUpperCase() : 'DAILY ACTIVE'}
              </Badge>
              <Badge variant="warning">
                {task.priority.toUpperCase()} PRIORITY
              </Badge>
            </div>
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
