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

  // ── Fetch all task data ──
  const fetchTasks = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [daily, completions, assigned] = await Promise.all([
        api.getDailyTasks(),
        api.getDailyCompletions(),
        api.getAssignedTasks(user.id, isAdmin)
      ]);
      setDailyTasks(daily);
      setTodayCompletions(completions);
      setAssignedTasks(assigned);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // ── Real-time subscriptions ──
  useEffect(() => {
    if (!user) return;

    const dailyChannel = supabase
      .channel('daily_tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_tasks' }, () => {
        fetchTasks();
      })
      .subscribe();

    const completionChannel = supabase
      .channel('task_completions_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_completions' }, () => {
        fetchTasks();
      })
      .subscribe();

    const assignedChannel = supabase
      .channel('assigned_tasks_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assigned_tasks' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(dailyChannel);
      supabase.removeChannel(completionChannel);
      supabase.removeChannel(assignedChannel);
    };
  }, [user, fetchTasks]);

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
    if (!user || loading) return;

    const checkDeadlines = async () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      const upcomingTasks = assignedTasks.filter(t => {
        if (t.assigned_to !== user.id || t.status === 'completed' || !t.due_date) return false;
        const dueDate = new Date(t.due_date);
        return dueDate <= tomorrow && dueDate >= now;
      });

      if (upcomingTasks.length === 0) return;

      const notifiedStr = localStorage.getItem(`notified_deadlines_${user.id}`) || '{}';
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
        localStorage.setItem(`notified_deadlines_${user.id}`, JSON.stringify(notified));
      }
    };

    // Check on mount and then every hour
    checkDeadlines();
    const interval = setInterval(checkDeadlines, 3600000);
    return () => clearInterval(interval);
  }, [user, loading, assignedTasks]);

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
