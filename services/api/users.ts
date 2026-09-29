import { supabase, formatApiError } from './client';
import { env } from '@/config/env';
import { createClient } from '@supabase/supabase-js';
import type { UserProfile, UserRole, AdminCreateUserInput } from '@/types/api';

export const usersApi = {
  /**
   * Fetch all registered users with their roles
   */
  async getUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          email,
          full_name,
          name,
          avatar_url,
          status,
          is_active,
          last_active_at,
          created_at,
          user_roles (
            role_id,
            roles (
              name
            )
          )
        `);

      if (error) throw error;

      return (data || []).map((user: any) => ({
        id: user.id,
        name: user.name || user.full_name || user.email?.split('@')[0] || 'User',
        email: user.email,
        avatar_url: user.avatar_url,
        status: user.status || (user.is_active ? 'active' : 'inactive'),
        last_active_at: user.last_active_at,
        created_at: user.created_at,
        roles: (user.user_roles || []).map((ur: any) => ur?.roles?.name || ur?.role_id).filter(Boolean) as UserRole[]
      }));
    } catch (err) {
      throw formatApiError(err, 'Failed to fetch team members');
    }
  },

  /**
   * Direct user record insert (Admin only)
   */
  async createUser(userData: Partial<UserProfile>, isAdmin: boolean): Promise<UserProfile> {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can create users.');

    try {
      const { data, error } = await supabase
        .from('users')
        .insert([userData])
        .select()
        .single();

      if (error) throw error;
      return data as UserProfile;
    } catch (err) {
      throw formatApiError(err, 'Failed to create user record');
    }
  },

  /**
   * Update user roles (Admin only)
   */
  async updateUserRoles(userId: string, roleIds: string[], isAdmin: boolean): Promise<void> {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can modify roles.');

    try {
      await supabase.from('user_roles').delete().eq('user_id', userId);

      const inserts = roleIds.map((role_id) => ({ user_id: userId, role_id }));
      const { error } = await supabase.from('user_roles').insert(inserts);

      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to update roles for user #${userId}`);
    }
  },

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: Partial<UserProfile>, isAdminOrSelf: boolean): Promise<UserProfile> {
    if (!isAdminOrSelf) throw new Error('Unauthorized.');

    try {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return data as UserProfile;
    } catch (err) {
      throw formatApiError(err, `Failed to update profile for user #${userId}`);
    }
  },

  /**
   * Safely delete a user account and clean up dependencies (Admin only)
   */
  async deleteUser(userId: string, isAdmin: boolean): Promise<void> {
    if (!isAdmin) throw new Error('Unauthorized: Only Admins can delete users.');
    if (!userId) throw new Error('User ID is required for deletion.');

    try {
      // 1. Delete assigned roles
      try {
        await supabase.from('user_roles').delete().eq('user_id', userId);
      } catch (e) {
        console.warn('Could not cleanup user_roles:', e);
      }

      // 2. Disassociate user references in ads_reports
      try {
        await supabase.from('ads_reports').update({ submitted_by: null }).eq('submitted_by', userId);
      } catch (e) {
        console.warn('Could not cleanup ads_reports:', e);
      }

      // 3. Disassociate user references in daily_tasks
      try {
        await supabase.from('daily_tasks').update({ assigned_to: null }).eq('assigned_to', userId);
        await supabase.from('daily_tasks').update({ created_by: null }).eq('created_by', userId);
      } catch (e) {
        console.warn('Could not cleanup daily_tasks:', e);
      }

      // 4. Disassociate user references in orders
      try {
        await supabase.from('orders').update({ created_by: null }).eq('created_by', userId);
      } catch (e) {
        console.warn('Could not cleanup orders:', e);
      }

      // 5. Cleanup user_push_subscriptions
      try {
        await supabase.from('user_push_subscriptions').delete().eq('user_id', userId);
      } catch (e) {
        console.warn('Could not cleanup user_push_subscriptions:', e);
      }

      // 6. Delete user profile from public.users
      const { error } = await supabase.from('users').delete().eq('id', userId);
      if (error) throw error;
    } catch (err) {
      throw formatApiError(err, `Failed to delete user #${userId}`);
    }
  },

  /**
   * Edge Function: Admin create user
   */
  async adminCreateUser(userData: AdminCreateUserInput | Record<string, any>) {
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
        body: { action: 'create-user', userData }
      });

      if (error) {
        console.warn('admin-auth-actions edge function returned error, trying fallback:', error);
        return this.adminCreateUserViaSignup(userData);
      }

      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      throw formatApiError(err, 'Failed to execute admin user creation');
    }
  },

  async adminConfirmUser(userId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
        body: { action: 'confirm-user', userId }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      throw formatApiError(err, `Failed to confirm user #${userId}`);
    }
  },

  async adminResetPassword(userId: string, newPassword: string) {
    try {
      const { data, error } = await supabase.functions.invoke('admin-auth-actions', {
        body: { action: 'reset-password', userId, password: newPassword }
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } catch (err) {
      throw formatApiError(err, `Failed to reset password for user #${userId}`);
    }
  },

  /**
   * Isolated Signup Client Fallback
   */
  createIsolatedSignupClient() {
    if (!env.supabase.url || !env.supabase.anonKey) {
      throw new Error('Missing Supabase environment variables.');
    }

    return createClient(env.supabase.url, env.supabase.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  },

  async adminCreateUserViaSignup(userData: Record<string, any>) {
    const signupClient = this.createIsolatedSignupClient();
    const normalizedEmail = String(userData?.email || '').trim().toLowerCase();
    const displayName = String(userData?.name || normalizedEmail.split('@')[0] || 'Team Member').trim();

    try {
      const { data: signupData, error: signupError } = await signupClient.auth.signUp({
        email: normalizedEmail,
        password: userData?.password || 'TempPass123!',
        options: {
          data: { name: displayName }
        }
      });

      if (signupError) throw signupError;

      const createdUser = signupData?.user;
      if (!createdUser?.id) {
        throw new Error('User account could not be initialized.');
      }

      const profilePayload = {
        id: createdUser.id,
        name: displayName,
        email: normalizedEmail,
        status: 'active'
      };

      const { error: profileError } = await supabase
        .from('users')
        .upsert(profilePayload, { onConflict: 'id' });

      if (profileError) throw profileError;

      if (Array.isArray(userData.roles) && userData.roles.length > 0) {
        await this.updateUserRoles(createdUser.id, userData.roles, true);
      }

      return { success: true, user: createdUser };
    } catch (err) {
      throw formatApiError(err, 'Failed to create user via fallback authentication');
    }
  }
};
