import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { ActivityTimeline } from './ActivityTimeline';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { 
  User, Calendar, Clock, Target, ListChecks, Hash, 
  Package, ExternalLink, MessageSquare, Send, CheckCircle, 
  XCircle, History, AlertCircle, FileText
} from 'lucide-react';
import './TaskDetailsModal.css';

export const TaskDetailsModal = ({ task, taskType, isOpen, onClose, onOpenOrder }) => {
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Comments & Extension Request states
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [requestingExtension, setRequestingExtension] = useState(false);
  const [extDate, setExtDate] = useState('');
  const [extReason, setExtReason] = useState('');
  const [isSubmittingExtension, setIsSubmittingExtension] = useState(false);
  const [extensionError, setExtensionError] = useState('');
  const [sidebarTab, setSidebarTab] = useState('comments'); // 'comments' | 'activity'

  const { user, isAdmin } = useAuth();
  const { 
    assignedTasks, 
    dailyTasks, 
    updateAssignedTask,
    addCommentToTask,
    requestTaskExtension,
    evaluateTaskExtension
  } = useTasks();

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
      setRequestingExtension(false);
      setNewComment('');
      setExtDate('');
      setExtReason('');
      setExtensionError('');
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

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || isAddingComment || !currentTask?.id) return;
    setIsAddingComment(true);
    try {
      await addCommentToTask(currentTask.id, newComment.trim());
      setNewComment('');
      await loadLogs();
    } catch (err) {
      console.error('Failed to add comment:', err);
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleRequestExtension = async (e) => {
    e.preventDefault();
    if (!extDate || !extReason.trim() || isSubmittingExtension || !currentTask?.id) return;

    if (new Date(extDate) <= new Date()) {
      setExtensionError('Requested date must be in the future');
      return;
    }

    setIsSubmittingExtension(true);
    setExtensionError('');
    try {
      await requestTaskExtension(currentTask.id, extDate, extReason.trim());
      setRequestingExtension(false);
      setExtDate('');
      setExtReason('');
      await loadLogs();
    } catch (err) {
      console.error('Failed to submit extension request:', err);
      setExtensionError('Failed to submit request');
    } finally {
      setIsSubmittingExtension(false);
    }
  };

  const handleEvaluateExtension = async (approve) => {
    if (isUpdating || !currentTask?.id) return;
    setIsUpdating(true);
    try {
      await evaluateTaskExtension(currentTask.id, approve);
      await loadLogs();
    } catch (err) {
      console.error('Failed to evaluate extension request:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!currentTask) return null;

  // Determine permissions
  const isAssignee = user && currentTask.assigned_to === user.id;
  const isAssigner = user && currentTask.assigned_by === user.id;
  const canApproveExtension = (isAssigner || isAdmin) && currentTask.extension_request_status === 'pending';

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
                        ? new Date(currentTask.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) 
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

          {/* Extension Request Workflows */}
          {isAssigned && (
            <section className="details-section extension-section">
              <h4>Due Date Extension Request</h4>
              
              {/* Active Extension Request Display */}
              {currentTask.extension_request_status === 'pending' && (
                <div className="extension-banner pending">
                  <div className="extension-banner-info">
                    <AlertCircle size={18} className="text-warning animate-pulse" />
                    <div>
                      <h5>Extension Request Pending</h5>
                      <p>
                        Requested Date: <strong>{new Date(currentTask.extension_requested_date).toLocaleDateString()}</strong>
                      </p>
                      <p className="reason">Reason: "{currentTask.extension_request_reason}"</p>
                    </div>
                  </div>

                  {canApproveExtension && (
                    <div className="extension-banner-actions">
                      <button 
                        className="btn small success" 
                        onClick={() => handleEvaluateExtension(true)}
                        disabled={isUpdating}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button 
                        className="btn small danger" 
                        onClick={() => handleEvaluateExtension(false)}
                        disabled={isUpdating}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}

              {currentTask.extension_request_status === 'approved' && (
                <div className="extension-banner approved">
                  <CheckCircle size={18} />
                  <span>The extension request was approved.</span>
                </div>
              )}

              {currentTask.extension_request_status === 'rejected' && (
                <div className="extension-banner rejected">
                  <XCircle size={18} />
                  <span>The extension request was rejected.</span>
                  {isAssignee && (
                    <button 
                      className="btn small link ml-2" 
                      onClick={() => setRequestingExtension(true)}
                    >
                      Request Again
                    </button>
                  )}
                </div>
              )}

              {/* Request form toggle */}
              {!currentTask.extension_request_status && isAssignee && !requestingExtension && (
                <button 
                  className="btn outline small"
                  onClick={() => setRequestingExtension(true)}
                >
                  Request Due Date Extension
                </button>
              )}

              {/* Form to request extension */}
              {requestingExtension && (
                <form onSubmit={handleRequestExtension} className="extension-form">
                  <div className="form-group">
                    <label>New Proposed Date</label>
                    <input 
                      type="date" 
                      required 
                      className="form-control"
                      value={extDate}
                      onChange={e => setExtDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reason for Extension</label>
                    <textarea 
                      required 
                      className="form-control"
                      rows={3}
                      placeholder="Explain why more time is needed..."
                      value={extReason}
                      onChange={e => setExtReason(e.target.value)}
                    />
                  </div>
                  {extensionError && (
                    <div className="error-text text-danger" style={{ fontSize: '0.8rem', marginBottom: '8px' }}>
                      {extensionError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      type="submit" 
                      className="btn primary small"
                      disabled={isSubmittingExtension}
                    >
                      {isSubmittingExtension ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button 
                      type="button" 
                      className="btn outline small"
                      onClick={() => setRequestingExtension(false)}
                      disabled={isSubmittingExtension}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

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

        {/* Sidebar Tabs (Comments / Audit Logs) */}
        <div className="details-sidebar">
          <div className="sidebar-tabs">
            <button 
              className={`sidebar-tab-btn ${sidebarTab === 'comments' ? 'active' : ''}`}
              onClick={() => setSidebarTab('comments')}
            >
              <MessageSquare size={14} />
              <span>Notes & Comments ({currentTask.comments?.length || 0})</span>
            </button>
            <button 
              className={`sidebar-tab-btn ${sidebarTab === 'activity' ? 'active' : ''}`}
              onClick={() => setSidebarTab('activity')}
            >
              <History size={14} />
              <span>Activity Log</span>
            </button>
          </div>

          <div className="sidebar-tab-content">
            {sidebarTab === 'comments' ? (
              <div className="comments-tab-wrapper">
                {/* Comments List */}
                <div className="comments-scroll">
                  {currentTask.comments && currentTask.comments.length > 0 ? (
                    currentTask.comments.map(c => (
                      <div key={c.id || Math.random()} className="comment-bubble">
                        <div className="comment-header">
                          <span className="comment-author">{c.user_name}</span>
                          <span className="comment-time">
                            {new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="comment-text">{c.text}</div>
                      </div>
                    ))
                  ) : (
                    <div className="comments-empty">
                      <MessageSquare size={24} />
                      <p>No comments or notes yet.</p>
                      <span>Add a note to log updates or reference details.</span>
                    </div>
                  )}
                </div>

                {/* Comment Input */}
                {isAssigned && (
                  <form onSubmit={handleAddComment} className="comment-input-form">
                    <input 
                      className="comment-textarea"
                      placeholder="Write a note/comment..."
                      value={newComment}
                      onChange={e => setNewComment(e.target.value)}
                      disabled={isAddingComment}
                      required
                    />
                    <button 
                      type="submit" 
                      className="comment-send-btn" 
                      disabled={isAddingComment || !newComment.trim()}
                    >
                      <Send size={14} />
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <div className="activity-tab-wrapper">
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
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
