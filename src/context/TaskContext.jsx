import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';
import { useAuth } from './AuthContext';

const TaskContext = createContext(null);

export const useTasks = () => useContext(TaskContext);

export const TaskProvider = ({ children }) => {
  const [dailyTasks, setDailyTasks] = useState([]);
  const [todayCompletions, setTodayCompletions] = useState([]);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { user, profile, userRoles, isAdmin } = useAuth();
  const userId = user?.id ?? null;

  // ── Fetch all task data ──
  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [daily, completions, assigned] = await Promise.all([
        api.getDailyTasks(),
        api.getDailyCompletions(),
        api.getAssignedTasks(userId, isAdmin)
      ]);
      setDailyTasks(daily);
      setTodayCompletions(completions);
      setAssignedTasks(assigned);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, userId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    if (!userId) return undefined;

    const handleResume = () => {
      fetchTasks();
    };

    window.addEventListener('app:resume', handleResume);
    return () => window.removeEventListener('app:resume', handleResume);
  }, [fetchTasks, userId]);

  // ── Real-time subscriptions ──
  // OPTIMIZED: All 3 task tables merged into ONE channel to reduce DB connections.
  // Supabase free tier has a connection pool limit — separate channels per table
  // quickly exhaust the pool when multiple users are online simultaneously.
  useEffect(() => {
    if (!userId) return;

    // Single channel, 3 postgres_changes listeners — 1 DB connection instead of 3
    const taskChannel = supabase
      .channel('task_all_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_tasks' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => {
        fetchTasks();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assigned_tasks' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(taskChannel);
    };
  }, [fetchTasks, userId]);

  // ── Filter daily tasks by user's role ──
  const myDailyTasks = dailyTasks.filter(task => {
    if (isAdmin) return true;
    return userRoles.includes(task.assigned_role);
  });

  // ── Check if a daily task is completed today ──
  const isCompletedToday = useCallback((taskId) => {
    return todayCompletions.some(c => c.daily_task_id === taskId);
  }, [todayCompletions]);

  const getCompletionFor = useCallback((taskId) => {
    return todayCompletions.find(c => c.daily_task_id === taskId);
  }, [todayCompletions]);

  // ── Actions ──
  const completeDailyTask = async (taskId, notes = '') => {
    const userName = profile?.name || user?.email || 'User';
    await api.completeDailyTask(taskId, user.id, userName, notes);
    await fetchTasks();
  };

  const uncompleteDailyTask = async (taskId) => {
    await api.uncompleteDailyTask(taskId);
    await fetchTasks();
  };

  const createDailyTask = async (taskData) => {
    await api.createDailyTask({ ...taskData, created_by: user.id });
    await fetchTasks();
  };

  const deleteDailyTask = async (taskId) => {
    await api.deleteDailyTask(taskId);
    await fetchTasks();
  };

  // ── Deadline Monitoring ──
  useEffect(() => {
    if (!userId || loading) return;

    const checkDeadlines = async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const upcomingTasks = assignedTasks.filter(t => {
        if (t.assigned_to !== userId || t.status === 'completed' || !t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate <= tomorrow && dueDate >= now;
      });

      if (upcomingTasks.length === 0) return;

      const notifiedStr = localStorage.getItem(`notified_deadlines_${userId}`) || '{}';
      const notified = JSON.parse(notifiedStr);
      const todayStr = now.toISOString().split('T')[0];
      let hasNewNotif = false;

      for (const task of upcomingTasks) {
        const lastNotified = notified[task.id];
        if (lastNotified !== todayStr) {
          // Trigger local-first notification via API so it persists and broadcasts
          /* 
          try {
            await api.createNotification({
              type: 'TASK_DEADLINE',
              title: 'Deadline Approaching',
              message: `Task "${task.title}" is due soon (${new Date(task.due_date).toLocaleDateString()})`,
              actor_name: 'System',
              target_user_id: user.id,
              data: { taskId: task.id, dueDate: task.due_date }
            });
            notified[task.id] = todayStr;
            hasNewNotif = true;
          } catch (e) {
            console.error('Deadline notification failed:', e);
          }
          */
        }
      }

      if (hasNewNotif) {
        localStorage.setItem(`notified_deadlines_${userId}`, JSON.stringify(notified));
      }
    };

    // Check on mount and then every hour
    checkDeadlines();
    const interval = setInterval(checkDeadlines, 3600000);
    return () => clearInterval(interval);
  }, [assignedTasks, loading, userId]);

  const createAssignedTask = async (taskData) => {
    const userName = profile?.name || user?.email || 'User';
    await api.createAssignedTask(taskData, user.id, userName);
    await fetchTasks();
  };

  const updateAssignedTask = async (taskId, updates) => {
    const userName = profile?.name || user?.email || 'User';
    await api.updateAssignedTask(taskId, updates, user.id, userName);
    await fetchTasks();
  };

  const deleteAssignedTask = async (taskId) => {
    await api.deleteAssignedTask(taskId);
    await fetchTasks();
  };

  // ── Stats for dashboard widget ──
  const myPendingAssigned = assignedTasks.filter(
    t => t.assigned_to === user?.id && t.status !== 'completed'
  ).length;

  const myIncompleteDailyCount = myDailyTasks.filter(t => !isCompletedToday(t.id)).length;

  const value = {
    dailyTasks,
    myDailyTasks,
    todayCompletions,
    assignedTasks,
    loading,
    isCompletedToday,
    getCompletionFor,
    completeDailyTask,
    uncompleteDailyTask,
    createDailyTask,
    deleteDailyTask,
    createAssignedTask,
    updateAssignedTask,
    deleteAssignedTask,
    fetchTasks,
    myPendingAssigned,
    myIncompleteDailyCount
  };

  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
};
