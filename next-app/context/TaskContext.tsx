// @ts-nocheck
'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/api/client';
import api from '@/services/api';
import { useAuth } from './AuthContext';
import type { DailyTask, AssignedTask, DailyTaskCompletion } from '@/types/api';

interface TaskContextType {
  dailyTasks: DailyTask[];
  myDailyTasks: DailyTask[];
  todayCompletions: DailyTaskCompletion[];
  assignedTasks: AssignedTask[];
  loading: boolean;
  isCompletedToday: (taskId: string | number) => boolean;
  getCompletionFor: (taskId: string | number) => DailyTaskCompletion | undefined;
  completeDailyTask: (taskId: string | number, notes?: string, dateStr?: string | null) => Promise<void>;
  uncompleteDailyTask: (taskId: string | number, dateStr?: string | null) => Promise<void>;
  createDailyTask: (taskData: any) => Promise<void>;
  deleteDailyTask: (taskId: string | number) => Promise<void>;
  createAssignedTask: (taskData: any) => Promise<void>;
  updateAssignedTask: (taskId: string | number, updates: any) => Promise<void>;
  deleteAssignedTask: (taskId: string | number) => Promise<void>;
  addCommentToTask: (taskId: string | number, commentText: string) => Promise<void>;
  requestTaskExtension: (taskId: string | number, requestedDate: string, reason: string) => Promise<void>;
  evaluateTaskExtension: (taskId: string | number, approve: boolean) => Promise<void>;
  fetchTasks: () => Promise<void>;
  myPendingAssigned: number;
  myIncompleteDailyCount: number;
}

const TaskContext = createContext<TaskContextType | null>(null);

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};

export const TaskProvider = ({ children }: { children: React.ReactNode }) => {
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>([]);
  const [todayCompletions, setTodayCompletions] = useState<DailyTaskCompletion[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<AssignedTask[]>([]);
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
      setDailyTasks(daily || []);
      setTodayCompletions(completions || []);
      setAssignedTasks(assigned || []);
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
  useEffect(() => {
    if (!userId) return;

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

  // ── Filter daily tasks by user's role or direct assignment ──
  const myDailyTasks = dailyTasks.filter(task => {
    if (isAdmin) return true;
    if (task.assigned_to === user?.id) return true;
    return !task.assigned_to && userRoles.includes(task.assigned_role as any);
  });

  // ── Check if a daily task is completed today ──
  const isCompletedToday = useCallback((taskId: string | number) => {
    return todayCompletions.some(c => String(c.daily_task_id) === String(taskId));
  }, [todayCompletions]);

  const getCompletionFor = useCallback((taskId: string | number) => {
    return todayCompletions.find(c => String(c.daily_task_id) === String(taskId));
  }, [todayCompletions]);

  // ── Actions ──
  const completeDailyTask = async (taskId: string | number, notes = '', dateStr: string | null = null) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.completeDailyTask(taskId, user.id, userName, notes, dateStr || undefined);
    await fetchTasks();
  };

  const uncompleteDailyTask = async (taskId: string | number, dateStr: string | null = null) => {
    await api.uncompleteDailyTask(taskId, dateStr || undefined);
    await fetchTasks();
  };

  const createDailyTask = async (taskData: any) => {
    if (!user) return;
    await api.createDailyTask({ ...taskData, created_by: user.id });
    await fetchTasks();
  };

  const deleteDailyTask = async (taskId: string | number) => {
    await api.deleteDailyTask(taskId);
    await fetchTasks();
  };

  const createAssignedTask = async (taskData: any) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.createAssignedTask(taskData, user.id, userName);
    await fetchTasks();
  };

  const updateAssignedTask = async (taskId: string | number, updates: any) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.updateAssignedTask(taskId, updates, user.id, userName);
    await fetchTasks();
  };

  const deleteAssignedTask = async (taskId: string | number) => {
    await api.deleteAssignedTask(taskId);
    await fetchTasks();
  };

  const addCommentToTask = async (taskId: string | number, commentText: string) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.addCommentToTask(taskId, commentText, user.id, userName);
    await fetchTasks();
  };

  const requestTaskExtension = async (taskId: string | number, requestedDate: string, reason: string) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.requestTaskExtension(taskId, requestedDate, reason, user.id, userName);
    await fetchTasks();
  };

  const evaluateTaskExtension = async (taskId: string | number, approve: boolean) => {
    if (!user) return;
    const userName = profile?.name || user?.email || 'User';
    await api.evaluateTaskExtension(taskId, approve, user.id, userName);
    await fetchTasks();
  };

  // ── Stats for dashboard widget ──
  const myPendingAssigned = assignedTasks.filter(
    t => t.assigned_to === user?.id && t.status !== 'completed'
  ).length;

  const myIncompleteDailyCount = myDailyTasks.filter(t => !isCompletedToday(t.id)).length;

  const value: TaskContextType = {
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
    addCommentToTask,
    requestTaskExtension,
    evaluateTaskExtension,
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
