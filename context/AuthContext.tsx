'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { UserProfile, UserRole } from '@/types';

export interface PresenceUser {
  id: string;
  name: string;
  email?: string;
  roles?: UserRole[];
  avatar_url?: string | null;
  online_at?: string | null;
  context?: { page: string; details?: unknown };
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  userRoles: UserRole[];
  onlineUsers: PresenceUser[];
  presenceContext: { page: string; details: unknown };
  updatePresenceContext: (newContext: string, details?: unknown) => void;
  loading: boolean;
  isAuthReady: boolean;
  signIn: (email: string, password: string) => Promise<unknown>;
  signOut: () => Promise<void>;
  updateProfile: (userId: string, updates: Partial<UserProfile>) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string | void>;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  userRoles: [],
  onlineUsers: [],
  presenceContext: { page: 'Initializing', details: null },
  updatePresenceContext: () => {},
  loading: true,
  isAuthReady: false,
  signIn: async () => {},
  signOut: async () => {},
  updateProfile: async () => {},
  updatePassword: async () => {},
  uploadAvatar: async () => '',
  hasRole: () => false,
  hasAnyRole: () => false,
  isAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [presenceContext, setPresenceContext] = useState<{ page: string; details: unknown }>({
    page: 'Initializing',
    details: null,
  });
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);

  const supabase = createClient();
  const currentUserIdRef = useRef<string | null>(null);
  const authReadyRef = useRef(false);
  const profileRef = useRef(profile);
  const rolesRef = useRef(userRoles);
  const contextRef = useRef(presenceContext);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    rolesRef.current = userRoles;
  }, [userRoles]);

  useEffect(() => {
    authReadyRef.current = isAuthReady;
  }, [isAuthReady]);

  useEffect(() => {
    contextRef.current = presenceContext;
  }, [presenceContext]);

  const clearSessionState = useCallback(() => {
    setProfile(null);
    setUserRoles([]);
  }, []);

  const fetchProfile = useCallback(
    async (userId: string, { blockUi = false } = {}) => {
      if (!userId) {
        clearSessionState();
        if (blockUi) setLoading(false);
        return [];
      }

      if (blockUi) setLoading(true);

      try {
        const [{ data: profileData, error: profileError }, { data: rolesData, error: rolesError }] =
          await Promise.all([
            supabase.from('users').select('*').eq('id', userId).maybeSingle(),
            supabase.from('user_roles').select('role_id').eq('user_id', userId),
          ]);

        if (profileError) throw profileError;

        if (!profileData) {
          clearSessionState();
          if (blockUi) setLoading(false);
          return [];
        }

        if (profileData.status === 'Deactivated' || profileData.status === 'inactive') {
          await supabase.auth.signOut();
          clearSessionState();
          if (blockUi) setLoading(false);
          return [];
        }

        setProfile(profileData as UserProfile);

        if (!rolesError && rolesData) {
          const roles = rolesData.map((r: { role_id: string }) => r.role_id as UserRole);
          setUserRoles(roles);
          return roles;
        }

        setUserRoles([]);
        return [];
      } catch (error) {
        console.error('Error fetching profile:', error);
        clearSessionState();
        return [];
      } finally {
        if (blockUi) setLoading(false);
      }
    },
    [clearSessionState, supabase]
  );

  useEffect(() => {
    let isMounted = true;

    const markAuthReady = () => {
      if (!isMounted || authReadyRef.current) return;
      authReadyRef.current = true;
      setIsAuthReady(true);
    };

    const restoreSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!isMounted) return;

        const nextUser = session?.user ?? null;
        const nextUserId = nextUser?.id ?? null;

        currentUserIdRef.current = nextUserId;
        setUser(nextUser);

        if (nextUserId) {
          await fetchProfile(nextUserId, { blockUi: true });
          return;
        }

        clearSessionState();
        setLoading(false);
      } catch (error) {
        console.error('Error restoring session:', error);
        if (!isMounted) return;
        currentUserIdRef.current = null;
        setUser(null);
        clearSessionState();
        setLoading(false);
      } finally {
        markAuthReady();
      }
    };

    restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && !session) {
        clearSessionState();
        setLoading(false);
        markAuthReady();
        return;
      }

      const nextUserId = session?.user?.id ?? null;
      const previousUserId = currentUserIdRef.current;

      currentUserIdRef.current = nextUserId;
      setUser(session?.user ?? null);

      if (!nextUserId) {
        clearSessionState();
        setLoading(false);
        markAuthReady();
        return;
      }

      const shouldBlockUi = !authReadyRef.current || previousUserId !== nextUserId;
      fetchProfile(nextUserId, { blockUi: shouldBlockUi }).finally(markAuthReady);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [clearSessionState, fetchProfile, supabase]);

  // Realtime Presence Tracking
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('online-users', {
      config: { presence: { key: user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const users = Object.values(newState)
          .flat()
          .map((p: any) => ({
            ...(p.profile || {}),
            online_at: p.online_at || null,
            context: p.profile?.context || { page: 'Active' },
          }));
        const uniqueUsers = Array.from(
          new Map(
            users
              .sort(
                (a: any, b: any) =>
                  new Date(b.online_at || 0).getTime() - new Date(a.online_at || 0).getTime()
              )
              .map((entry: any) => [entry.id, entry])
          ).values()
        ) as PresenceUser[];
        setOnlineUsers(uniqueUsers);
      })
      .subscribe();

    const trackPresence = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const currentProfile = profileRef.current;
      if (!currentProfile || channel.state !== 'joined') return;
      try {
        await channel.track({
          online_at: new Date().toISOString(),
          profile: {
            id: user.id,
            name: currentProfile.name,
            roles: rolesRef.current,
            avatar_url: currentProfile.avatar_url,
            email: currentProfile.email,
            context: contextRef.current,
          },
        });
      } catch (err) {
        console.warn('Presence tracking failed:', err);
      }
    };

    const heartbeatInterval = setInterval(trackPresence, 60000);
    const timer = setTimeout(trackPresence, 1000);

    return () => {
      clearInterval(heartbeatInterval);
      clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [user, supabase]);

  const updatePresenceContext = useCallback((newContext: string, details: unknown = null) => {
    setPresenceContext((prev) => {
      if (prev.page === newContext && JSON.stringify(prev.details) === JSON.stringify(details)) {
        return prev;
      }
      return {
        page: newContext,
        details,
      };
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Supabase signOut error:', err);
    } finally {
      clearSessionState();
      setUser(null);
      setLoading(false);
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  };

  const updateProfile = async (userId: string, updates: Partial<UserProfile>) => {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;

    if (userId === user?.id) {
      await fetchProfile(userId);
    }
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    await updateProfile(user.id, { avatar_url: publicUrl });
    return publicUrl;
  };

  const hasRole = (role: UserRole) => userRoles.includes(role);
  const hasAnyRole = (roles: UserRole[]) => roles.some((role) => userRoles.includes(role));
  const isAdmin = userRoles.includes('Admin');

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        userRoles,
        onlineUsers,
        presenceContext,
        updatePresenceContext,
        loading,
        isAuthReady,
        signIn,
        signOut,
        updateProfile,
        updatePassword,
        uploadAvatar,
        hasRole,
        hasAnyRole,
        isAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
