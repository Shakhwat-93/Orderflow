import { supabase, formatApiError } from './client';
import type { DailyTask, AssignedTask, DailyTaskCompletion, TaskActivityLog } from '@/types/api';

export const tasksApi = {
  async logTaskActivity(
    taskId: string | number,
    taskType: 'daily' | 'assigned' | string,
    actionType: string,
    actionDescription: string,
    oldStatus: string | null = null,
    newStatus: string | null = null
  ) {
    try {
      const { data: userSession } = await supabase.auth.getSession();
      const userId = userSession?.session?.user?.id;

      let userName = 'System';
      if (userId) {
        const { data: profile } = await supabase.from('users').select('name').eq('id', userId).single();
        if (profile?.name) userName = profile.name;
      }

      await supabase.from('task_activity_logs').insert({
        task_id: taskId,
        task_type: taskType,
        user_id: userId,
        user_name: userName,
        action_type: actionType,
        action_description: actionDescription,
        old_status: oldStatus,
        new_status: newStatus
      });
    } catch (e) {
      console.warn('Failed to log task activity:', e);
    }
  },

  async getTaskLogs(taskId: string | number): Promise<TaskActivityLog[]> {
    try {
      const { data, error } = await supabase
        .from('task_activity_logs')
        .select('*')
        .eq('task_id', taskId)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      return (data as TaskActivityLog[]) || [];
    } catch (err) {
      throw formatApiError(err, `Failed to retrieve logs for task #${taskId}`);
    }
  },

  /**
   * Daily Tasks
   */
  async getDailyTasks(): Promise<DailyTask[]> {
    try {
      const { data, error } = await supabase
        .from('daily_tasks')
        .select('*')
        .eq('is_active', true)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data as DailyTask[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch daily tasks');
    }
  },

  async createDailyTask(taskData: Partial<DailyTask>): Promise<DailyTask> {
    try {
      const { data, error } = await supabase
        .from('daily_tasks')
        .insert(taskData)
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(data.id, 'daily', 'CREATE', `Daily Task created: "${taskData.title}"`);
      return data as DailyTask;
    } catch (err) {
      throw formatApiError(err, 'Failed to create daily task');
    }
  },

  async updateDailyTask(taskId: string, updates: Partial<DailyTask>): Promise<DailyTask> {
    try {
      const { data, error } = await supabase
        .from('daily_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data as DailyTask;
    } catch (err) {
      throw formatApiError(err, `Failed to update daily task #${taskId}`);
    }
  },

  async deleteDailyTask(taskId: string): Promise<void> {
    try {
      const { error } = await supabase.from('daily_tasks').delete().eq('id', taskId);
      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to delete daily task #${taskId}`);
    }
  },

  /**
   * Daily Task Completions
   */
  async getDailyCompletions(date?: string): Promise<DailyTaskCompletion[]> {
    try {
      const dateStr = date || new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('task_completions')
        .select('*')
        .eq('completion_date', dateStr);

      if (error) throw error;
      return (data as DailyTaskCompletion[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to retrieve task completions');
    }
  },

  async completeDailyTask(
    dailyTaskId: string,
    userId: string,
    userName: string,
    notes = '',
    dateStr: string | null = null
  ): Promise<DailyTaskCompletion> {
    try {
      const targetDate = dateStr || new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('task_completions')
        .insert({
          daily_task_id: dailyTaskId,
          completed_by: userId,
          completed_by_name: userName,
          completion_date: targetDate,
          notes
        })
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(
        dailyTaskId,
        'daily',
        'STATUS_CHANGE',
        `Marked as Completed for ${targetDate}`,
        'Pending',
        'Completed'
      );

      return data as DailyTaskCompletion;
    } catch (err) {
      throw formatApiError(err, 'Failed to complete daily task');
    }
  },

  async uncompleteDailyTask(dailyTaskId: string, dateStr: string | null = null): Promise<void> {
    try {
      const targetDate = dateStr || new Date().toISOString().split('T')[0];
      const { error } = await supabase
        .from('task_completions')
        .delete()
        .eq('daily_task_id', dailyTaskId)
        .eq('completion_date', targetDate);

      if (error) throw error;

      await this.logTaskActivity(
        dailyTaskId,
        'daily',
        'STATUS_CHANGE',
        `Marked as Pending for ${targetDate}`,
        'Completed',
        'Pending'
      );
    } catch (err) {
      throw formatApiError(err, 'Failed to uncomplete task');
    }
  },

  /**
   * Assigned Tasks
   */
  async getAssignedTasks(userId?: string, isAdmin = false): Promise<AssignedTask[]> {
    try {
      let query = supabase.from('assigned_tasks').select('*').order('created_at', { ascending: false });

      if (userId && !isAdmin) {
        query = query.or(`assigned_to.eq.${userId},assigned_by.eq.${userId}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as AssignedTask[]) || [];
    } catch (err) {
      throw formatApiError(err, 'Failed to retrieve assigned tasks');
    }
  },

  async createAssignedTask(
    taskData: Partial<AssignedTask> & Record<string, any>,
    userId?: string,
    userName = 'System'
  ): Promise<AssignedTask> {
    try {
      const { data, error } = await supabase
        .from('assigned_tasks')
        .insert({
          ...taskData,
          assigned_by: userId,
          assigned_by_name: userName
        })
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(
        data.id,
        'assigned',
        'CREATE',
        `Assigned task created for ${taskData.assigned_to_name || 'user'}`
      );

      return data as AssignedTask;
    } catch (err) {
      throw formatApiError(err, 'Failed to create assigned task');
    }
  },

  async updateAssignedTask(
    taskId: string,
    updates: Partial<AssignedTask> & Record<string, any>,
    userId?: string,
    userName = 'System'
  ): Promise<AssignedTask> {
    try {
      const { data: oldTask } = await supabase.from('assigned_tasks').select('*').eq('id', taskId).single();

      if (updates.status === 'completed') {
        updates.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('assigned_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      if (updates.status) {
        await this.logTaskActivity(
          taskId,
          'assigned',
          'STATUS_CHANGE',
          `Status updated to ${String(updates.status).replace('_', ' ')}`,
          oldTask?.status,
          updates.status
        );
      } else {
        await this.logTaskActivity(taskId, 'assigned', 'UPDATE', 'Task details updated');
      }

      return data as AssignedTask;
    } catch (err) {
      throw formatApiError(err, `Failed to update assigned task #${taskId}`);
    }
  },

  async deleteAssignedTask(taskId: string): Promise<void> {
    try {
      const { error } = await supabase.from('assigned_tasks').delete().eq('id', taskId);
      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to delete task #${taskId}`);
    }
  },

  async addCommentToTask(taskId: string, commentText: string, userId?: string, userName = 'System'): Promise<AssignedTask> {
    try {
      const { data: task, error: fetchError } = await supabase
        .from('assigned_tasks')
        .select('comments')
        .eq('id', taskId)
        .single();

      if (fetchError) throw fetchError;

      const currentComments = task.comments || [];
      const newComment = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        user_id: userId,
        user_name: userName,
        text: commentText,
        created_at: new Date().toISOString()
      };
      const updatedComments = [...currentComments, newComment];

      const { data, error } = await supabase
        .from('assigned_tasks')
        .update({ comments: updatedComments })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(
        taskId,
        'assigned',
        'UPDATE',
        `${userName} added a comment: "${commentText.substring(0, 30)}${commentText.length > 30 ? '...' : ''}"`
      );

      return data as AssignedTask;
    } catch (err) {
      throw formatApiError(err, `Failed to add comment to task #${taskId}`);
    }
  },

  async requestTaskExtension(taskId: string, requestedDate: string, reason: string, userId?: string, userName = 'System') {
    try {
      const { data, error } = await supabase
        .from('assigned_tasks')
        .update({
          extension_requested_date: requestedDate,
          extension_request_reason: reason,
          extension_request_status: 'pending'
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(
        taskId,
        'assigned',
        'UPDATE',
        `${userName} requested a due date extension to ${new Date(requestedDate).toLocaleDateString()}`
      );

      return data;
    } catch (err) {
      throw formatApiError(err, 'Failed to submit extension request');
    }
  },

  async evaluateTaskExtension(taskId: string, approve: boolean, userId?: string, userName = 'System') {
    try {
      const { data: task, error: fetchError } = await supabase
        .from('assigned_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (fetchError) throw fetchError;

      const updates: Record<string, any> = {
        extension_request_status: approve ? 'approved' : 'rejected'
      };

      if (approve && task.extension_requested_date) {
        updates.due_date = task.extension_requested_date;
      }

      const { data, error } = await supabase
        .from('assigned_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      await this.logTaskActivity(
        taskId,
        'assigned',
        'UPDATE',
        `${userName} ${approve ? 'approved' : 'rejected'} the due date extension request`
      );

      return data;
    } catch (err) {
      throw formatApiError(err, 'Failed to evaluate extension request');
    }
  }
};
