/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [presenceContext, setPresenceContext] = useState({ page: 'Initializing', details: null });
  const [onlineUsers, setOnlineUsers] = useState([]);

  const currentUserIdRef = useRef(null);
  const supportsLastActiveRef = useRef(true);
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
    contextRef.current = presenceContext;
  }, [presenceContext]);

  const fetchProfile = useCallback(async (userId, { blockUi = false } = {}) => {
    if (!userId) {
      setProfile(null);
      setUserRoles([]);
      if (blockUi) {
        setLoading(false);
      }
      return [];
    }

    if (blockUi) {
      setLoading(true);
    }

    try {
      const [{ data: profileData, error: profileError }, { data: rolesData, error: rolesError }] = await Promise.all([
        supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role_id')
          .eq('user_id', userId)
      ]);

      if (profileError) throw profileError;

      if (!profileData) {
        supportsLastActiveRef.current = false;
        setProfile(null);
        setUserRoles([]);
        if (blockUi) {
          setLoading(false);
        }
        return [];
      }

      if (profileData.status === 'Deactivated' || profileData.status === 'inactive') {
        supportsLastActiveRef.current = false;
        await supabase.auth.signOut();
        setProfile(null);
        setUserRoles([]);
        if (blockUi) {
          setLoading(false);
        }
        return [];
      }

      supportsLastActiveRef.current = Object.prototype.hasOwnProperty.call(profileData, 'last_active_at');
      setProfile(profileData);

      if (!rolesError && rolesData) {
        const roles = rolesData.map((r) => r.role_id);
        setUserRoles(roles);
        return roles;
      }

      setUserRoles([]);
      return [];
    } catch (error) {
      console.error('Error fetching profile:', error.message);
      if (error.message.includes('refresh_token_not_found') || error.message.includes('Invalid Refresh Token')) {
        await supabase.auth.signOut();
      }
      supportsLastActiveRef.current = false;
      setProfile(null);
      setUserRoles([]);
      return [];
    } finally {
      if (blockUi) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const nextUserId = session?.user?.id ?? null;
      currentUserIdRef.current = nextUserId;
      setUser(session?.user ?? null);

      if (nextUserId) {
        fetchProfile(nextUserId, { blockUi: true });
        return;
      }

      setProfile(null);
      setUserRoles([]);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUserId = session?.user?.id ?? null;
      const previousUserId = currentUserIdRef.current;

      currentUserIdRef.current = nextUserId;
      setUser(session?.user ?? null);

      if (!nextUserId) {
        setProfile(null);
        setUserRoles([]);
        setLoading(false);
        return;
      }

      const shouldBlockUi = event === 'SIGNED_IN' || previousUserId !== nextUserId;
      fetchProfile(nextUserId, { blockUi: shouldBlockUi });
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  };

  const signUp = async (email, password, name) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        name: name || email.split('@')[0],
        email
      });

      if (!profileError) {
        await supabase.from('user_roles').insert({
          user_id: data.user.id,
          role_id: 'Call Team'
        });
      }
    }
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const updateProfile = async (userId, updates) => {
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;

    if (updates.name) {
      await api.logActivity({
        action_type: 'PROFILE_UPDATE',
        changed_by_user_id: userId,
        changed_by_user_name: updates.name,
        action_description: `${updates.name} updated their display name`
      });
    }

    if (userId === user?.id) {
      await fetchProfile(userId);
    }
  };

  const updatePassword = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) throw error;
  };

  const uploadAvatar = async (file) => {
    if (!user) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Math.random()}.${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    await updateProfile(user.id, { avatar_url: publicUrl });

    const currentName = profile?.name || user?.user_metadata?.full_name || user?.email || 'User';
    await api.logActivity({
      action_type: 'AVATAR_UPDATE',
      changed_by_user_id: user.id,
      changed_by_user_name: currentName,
      action_description: `${currentName} changed the profile photo`
    });

    return publicUrl;
  };

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const users = Object.values(newState)
          .flat()
          .map((p) => ({
            ...(p.profile || {}),
            online_at: p.online_at || null,
            context: p.profile?.context || { page: 'Active' }
          }));

        const uniqueUsers = Array.from(
          new Map(
            users
              .sort((a, b) => new Date(b.online_at || 0) - new Date(a.online_at || 0))
              .map((entry) => [entry.id, entry])
          ).values()
        );
        setOnlineUsers(uniqueUsers);
      })
      .on('presence', { event: 'join', key: user.id }, () => {
        console.log('Successfully joined presence channel');
      })
      .subscribe();

    const trackPresence = async () => {
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
            context: contextRef.current
          }
        });
      } catch (err) {
        console.warn('Presence tracking failed:', err);
      }
    };

    const heartbeatInterval = setInterval(trackPresence, 30000);

    const dbPersistenceInterval = setInterval(async () => {
      const currentProfile = profileRef.current;
      if (user?.id && currentProfile && supportsLastActiveRef.current) {
        try {
          await supabase.from('users').update({
            last_active_at: new Date().toISOString()
          }).eq('id', user.id);
        } catch (err) {
          if (
            err?.message?.includes('last_active_at') ||
            err?.code === 'PGRST204' ||
            err?.code === '42703'
          ) {
            supportsLastActiveRef.current = false;
          }
          console.warn('Failed to update last_active_at:', err);
        }
      }
    }, 120000);

    const timer = setTimeout(trackPresence, 1000);

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(dbPersistenceInterval);
      clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !profile) return;

    const channel = supabase.getChannels().find((c) => c.name === 'online-users');
    if (channel && channel.state === 'joined') {
      channel.track({
        online_at: new Date().toISOString(),
        profile: {
          id: user.id,
          name: profile.name,
          roles: userRoles,
          avatar_url: profile.avatar_url,
          email: profile.email,
          context: presenceContext
        }
      });
    }
  }, [profile, userRoles, presenceContext, user]);

  const updatePresenceContext = useCallback((newContext, details = null) => {
    setPresenceContext((prev) => {
      if (prev.page === newContext && JSON.stringify(prev.details) === JSON.stringify(details)) {
        return prev;
      }
      return {
        page: newContext,
        details,
        timestamp: new Date().toISOString()
      };
    });
  }, []);

  const hasRole = (role) => userRoles.includes(role);
  const hasAnyRole = (roles) => roles.some((role) => userRoles.includes(role));
  const isAdmin = userRoles.includes('Admin');

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      userRoles,
      onlineUsers,
      presenceContext,
      updatePresenceContext,
      loading,
      signIn,
      signUp,
      signOut,
      updateProfile,
      updatePassword,
      uploadAvatar,
      hasRole,
      hasAnyRole,
      isAdmin
    }}>
      {children}
    </AuthContext.Provider>
  );
};
