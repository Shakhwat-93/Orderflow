import { useEffect, useState } from 'react';
import { AlertCircle, Calendar, ClipboardList, Plus, UserRound, Users } from 'lucide-react';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';
import './CreateTaskOverlay.css';

const ROLE_OPTIONS = ['Admin', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];
const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

export const CreateTaskOverlay = ({ isOpen, onClose, defaultType = 'daily' }) => {
  const { createDailyTask, createAssignedTask } = useTasks();
  const { isAdmin } = useAuth();
  const resolvedDefaultType = isAdmin ? defaultType : 'daily';

  const [allUsers, setAllUsers] = useState([]);
  const [taskType, setTaskType] = useState(defaultType);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedRole, setAssignedRole] = useState('Moderator');
  const [assignedTo, setAssignedTo] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name, email')
        .order('name', { ascending: true });

      setAllUsers(data || []);
    };

    if (isOpen) {
      setTaskType(resolvedDefaultType);
    }

    if (isAdmin && isOpen) {
      fetchUsers();
    }
  }, [defaultType, isAdmin, isOpen, resolvedDefaultType]);

  const resetForm = () => {
    setTaskType(resolvedDefaultType);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setAssignedRole('Moderator');
    setAssignedTo('');
    setRelatedOrderId('');
    setIsSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!title.trim() || isSaving) return;
    if (taskType === 'assigned' && !assignedTo) return;

    setIsSaving(true);

    try {
      if (taskType === 'assigned') {
        const selectedUser = allUsers.find((user) => user.id === assignedTo);

        await createAssignedTask({
          title: title.trim(),
          description: description.trim(),
          assigned_to: assignedTo,
          assigned_to_name: selectedUser?.name || '',
          priority,
          due_date: dueDate || null,
          related_order_id: relatedOrderId.trim() || null,
        });
      } else {
        await createDailyTask({
          title: title.trim(),
          description: description.trim(),
          assigned_role: assignedRole,
          priority,
          recurrence: 'daily',
        });
      }

      handleClose();
    } catch (error) {
      console.error('Failed to create task:', error);
      setIsSaving(false);
    }
  };

  const isAssignedTask = taskType === 'assigned';
  const selectedUser = allUsers.find((user) => user.id === assignedTo);
  const submitDisabled = !title.trim() || isSaving || (isAssignedTask && !assignedTo);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Task"
      subtitle="A clean composer for assigning work without leaving the board."
    >
      <form className="ct-sheet" onSubmit={handleSubmit}>
        {isAdmin && (
          <div className="ct-mode-switch" role="tablist" aria-label="Task type">
            <button
              type="button"
              className={`ct-mode-btn ${taskType === 'daily' ? 'active' : ''}`}
              onClick={() => setTaskType('daily')}
            >
              <Users size={16} />
              Role Task
            </button>
            <button
              type="button"
              className={`ct-mode-btn ${taskType === 'assigned' ? 'active' : ''}`}
              onClick={() => setTaskType('assigned')}
            >
              <UserRound size={16} />
              Person Task
            </button>
          </div>
        )}

        <div className="ct-layout">
          <section className="ct-panel ct-panel-main">
            <div className="ct-panel-header">
              <div>
                <p className="ct-eyebrow">Task brief</p>
                <h3>Define the work clearly</h3>
              </div>
            </div>

            <label className="ct-field">
              <span className="ct-label">Task title</span>
              <input
                type="text"
                className="ct-input"
                placeholder="Write a clear outcome..."
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>

            <label className="ct-field">
              <span className="ct-label">Description</span>
              <textarea
                className="ct-textarea"
                placeholder="Add the context, expected result, or blockers..."
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="ct-grid">
              <label className="ct-field ct-info-card">
                <span className="ct-card-label">
                  <Calendar size={16} />
                  Due date
                </span>
                <input
                  type="date"
                  className="ct-input ct-input-plain"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </label>

              <div className="ct-field ct-info-card">
                <span className="ct-card-label">
                  <AlertCircle size={16} />
                  Priority
                </span>
                <div className="ct-priority-group">
                  {PRIORITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`ct-priority-btn ${priority === option.value ? 'active' : ''}`}
                      data-priority={option.value}
                      onClick={() => setPriority(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isAssignedTask && (
              <label className="ct-field">
                <span className="ct-label">Related order ID</span>
                <input
                  type="text"
                  className="ct-input"
                  placeholder="Optional order reference"
                  value={relatedOrderId}
                  onChange={(event) => setRelatedOrderId(event.target.value)}
                />
              </label>
            )}
          </section>

          <aside className="ct-panel ct-panel-side">
            <div className="ct-panel-header">
              <div>
                <p className="ct-eyebrow">Assignment</p>
                <h3>{isAssignedTask ? 'Choose a teammate' : 'Choose a role'}</h3>
              </div>
            </div>

            <div className="ct-assignee-summary">
              <div className="ct-assignee-icon">
                {isAssignedTask ? <UserRound size={18} /> : <ClipboardList size={18} />}
              </div>
              <div className="ct-assignee-copy">
                <strong>
                  {isAssignedTask
                    ? selectedUser?.name || 'No teammate selected'
                    : assignedRole}
                </strong>
                <span>
                  {isAssignedTask
                    ? selectedUser?.email || 'Select one person for ownership.'
                    : 'Daily recurring work for this operational role.'}
                </span>
              </div>
            </div>

            <div className="ct-chip-grid">
              {isAssignedTask ? (
                allUsers.length > 0 ? (
                  allUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`ct-chip ${assignedTo === user.id ? 'active' : ''}`}
                      onClick={() => setAssignedTo(user.id)}
                    >
                      <span>{user.name}</span>
                      <small>{user.email}</small>
                    </button>
                  ))
                ) : (
                  <div className="ct-empty-state">Loading team members...</div>
                )
              ) : (
                ROLE_OPTIONS.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={`ct-chip ${assignedRole === role ? 'active' : ''}`}
                    onClick={() => setAssignedRole(role)}
                  >
                    <span>{role}</span>
                    <small>Daily responsibility</small>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>

        <div className="ct-actions">
          <button type="button" className="ct-secondary-btn" onClick={handleClose}>
            Cancel
          </button>
          <button type="submit" className="ct-primary-btn" disabled={submitDisabled}>
            <Plus size={18} />
            {isSaving ? 'Creating...' : 'Create task'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
