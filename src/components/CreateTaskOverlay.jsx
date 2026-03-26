import { useState, useEffect } from 'react';
import { useTasks } from '../context/TaskContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Calendar, AlertCircle, Plus } from 'lucide-react';
import './CreateTaskOverlay.css';

const ROLE_OPTIONS = ['Admin', 'Moderator', 'Call Team', 'Courier Team', 'Factory Team'];

export const CreateTaskOverlay = ({ isOpen, onClose, defaultType = 'daily' }) => {
  const { createDailyTask, createAssignedTask } = useTasks();
  const { profile, isAdmin } = useAuth();
  
  const [allUsers, setAllUsers] = useState([]);
  
  // Unified form state
  const [taskType, setTaskType] = useState(defaultType); // 'daily' (role) or 'assigned' (user)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignedRole, setAssignedRole] = useState('Moderator');
  const [assignedTo, setAssignedTo] = useState('');
  const [relatedOrderId, setRelatedOrderId] = useState('');

  // Fetch users for assignment if admin
  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from('users').select('id, name, email');
      setAllUsers(data || []);
    };
    if (isAdmin && isOpen) fetchUsers();
    
    if (isOpen) {
      setTaskType(defaultType);
    }
  }, [isAdmin, isOpen, defaultType]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      if (taskType === 'assigned') {
        const selectedUser = allUsers.find(u => u.id === assignedTo);
        await createAssignedTask({
          title,
          description,
          assigned_to: assignedTo,
          assigned_to_name: selectedUser?.name || '',
          priority,
          due_date: dueDate || null,
          related_order_id: relatedOrderId || null
        });
      } else {
        await createDailyTask({
          title,
          description,
          assigned_role: assignedRole,
          priority,
          recurrence: 'daily'
        });
      }
      handleClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleClose = () => {
    // Reset form
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDueDate('');
    setAssignedTo('');
    setRelatedOrderId('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="ct-overlay-container">
      {/* TopAppBar */}
      <header className="ct-header">
        <div className="ct-header-left">
          <button type="button" onClick={handleClose} className="ct-back-btn">
            <ArrowLeft size={24} />
          </button>
          <h1>Executive Tactician</h1>
        </div>
        <div className="ct-header-right">
          <div className="ct-avatar">
            <img 
              src={profile?.avatar_url || "https://i.pravatar.cc/150?u=12"} 
              alt="Profile" 
              onError={(e) => e.target.src = 'https://i.pravatar.cc/150'}
            />
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="ct-main">
        {/* Hero / Header Section */}
        <section className="ct-hero">
          <p className="ct-overline">New Entry</p>
          <h2 className="ct-title">Architect Your Next Move</h2>
          <div className="ct-divider"></div>
        </section>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="ct-form">
          {/* Title Input */}
          <div className="ct-field">
            <label className="ct-label">Task Title</label>
            <input 
              type="text" 
              className="ct-input-title" 
              placeholder="Specify the objective..." 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Bento Grid */}
          <div className="ct-grid">
            {/* Due Date */}
            <div className="ct-bento-card">
              <div className="ct-bento-header">
                <div className="ct-icon-box">
                  <Calendar size={20} className="ct-tinted-icon" />
                </div>
                <span className="ct-bento-title">Deadline</span>
              </div>
              <input 
                type="date" 
                className="ct-date-input" 
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Strategic Priority */}
            <div className="ct-bento-card">
              <div className="ct-bento-header">
                <div className="ct-icon-box">
                  <AlertCircle size={20} className="ct-tinted-icon" />
                </div>
                <span className="ct-bento-title">Strategic Priority</span>
              </div>
              <div className="ct-segmented-control">
                {['High', 'Medium', 'Low'].map(level => {
                  const val = level.toLowerCase();
                  const isActive = priority === val;
                  // The exact Tailwind classes mapping for High active state:
                  // High active -> bg-error-container text-on-error-container
                  // Others standard -> bg-white text-slate-500
                  let btnClass = 'ct-segment-btn';
                  if (isActive) {
                    if (val === 'high' || val === 'urgent') btnClass += ' active-high';
                    else if (val === 'medium') btnClass += ' active-medium';
                    else btnClass += ' active-low';
                  }
                  return (
                    <button 
                      key={level}
                      type="button" 
                      className={btnClass}
                      onClick={() => setPriority(val)}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Context & Details */}
          <div className="ct-field">
            <label className="ct-label">Context & Details</label>
            <textarea 
              className="ct-textarea" 
              placeholder="Elaborate on the requirements, dependencies, and desired outcome..." 
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Assignment Selection (Adapted from "Tags/Project Selection") */}
          <div className="ct-assignment-card">
            <div className="ct-assignment-header">
              <span className="ct-assignment-title">
                {taskType === 'assigned' ? 'Assign to Person' : 'Assign to Role'}
              </span>
              {isAdmin && (
                <button 
                  type="button" 
                  className="ct-toggle-btn"
                  onClick={() => setTaskType(prev => prev === 'daily' ? 'assigned' : 'daily')}
                >
                  {taskType === 'daily' ? 'Switch to Personnel' : 'Switch to Role'}
                </button>
              )}
            </div>
            
            <div className="ct-tags-container">
              {taskType === 'daily' ? (
                ROLE_OPTIONS.map(role => (
                  <button
                    key={role}
                    type="button"
                    className={`ct-tag ${assignedRole === role ? 'active' : ''}`}
                    onClick={() => setAssignedRole(role)}
                  >
                    {role}
                  </button>
                ))
              ) : (
                allUsers.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    className={`ct-tag ${assignedTo === u.id ? 'active' : ''}`}
                    onClick={() => setAssignedTo(u.id)}
                  >
                    {u.name}
                  </button>
                ))
              )}
              {taskType === 'assigned' && allUsers.length === 0 && (
                <span className="ct-tag-empty">Loading team...</span>
              )}
            </div>
          </div>

          {/* Action Area */}
          <div className="ct-actions">
            <button type="submit" className="ct-submit-btn">
              <Plus size={24} strokeWidth={2.5} />
              Confirm Project Entry
            </button>
            <button type="button" onClick={handleClose} className="ct-cancel-btn">
              Cancel
            </button>
          </div>
        </form>

        {/* Editorial Visual Element */}
        <div className="ct-decor-wrapper">
          <div className="ct-decor-box">
            <div className="ct-decor-inner"></div>
          </div>
        </div>
      </main>
      
      {/* Ghost Visual Decor Background */}
      <div className="ct-bg-glow"></div>
    </div>
  );
};
