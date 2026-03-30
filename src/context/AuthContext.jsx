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

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setUserRoles([]);
        setLoading(false);
      }
    });

    // Listen for changes on auth state (in, out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true); // ← Always show loading until roles are resolved
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setUserRoles([]);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
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
        setProfile(null);
        setUserRoles([]);
        setLoading(false);
        return;
      }

      // Enforce Deactivation
      if (profileData.status === 'Deactivated' || profileData.status === 'inactive') {
        await supabase.auth.signOut();
        setProfile(null);
        setUserRoles([]);
        setLoading(false);
        return;
      }

      setProfile(profileData);

      if (!rolesError && rolesData) {
        const roles = rolesData.map(r => r.role_id);
        setUserRoles(roles);
        return roles; // ← Return so callers can use for redirect
      } else {
        setUserRoles([]);
        return [];
      }
    } catch (error) {
      console.error('Error fetching profile:', error.message);
      if (error.message.includes('refresh_token_not_found') || error.message.includes('Invalid Refresh Token')) {
        await supabase.auth.signOut();
      }
      setProfile(null);
      setUserRoles([]);
    } finally {
      setLoading(false);
    }
  };

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
      // Default role as 'Call Team'
      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        name: name || email.split('@')[0],
        email: email
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

    // Log profile update if name changed
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

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    // Update profile
    await updateProfile(user.id, { avatar_url: publicUrl });

    // Log avatar update
    const currentName = profile?.name || user?.user_metadata?.full_name || user?.email || 'User';
    await api.logActivity({
      action_type: 'AVATAR_UPDATE',
      changed_by_user_id: user.id,
      changed_by_user_name: currentName,
      action_description: `${currentName} changed the profile photo`
    });

    return publicUrl;
  };


  const [onlineUsers, setOnlineUsers] = useState([]);

  // Use refs to avoid stale closures in heartbeat interval
  const profileRef = useRef(profile);
  const rolesRef = useRef(userRoles);
  const contextRef = useRef(presenceContext);

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { rolesRef.current = userRoles; }, [userRoles]);
  useEffect(() => { contextRef.current = presenceContext; }, [presenceContext]);

  // Use a stable reference for the channel to avoid redundant joins
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

        // Keep one entry per user id (latest online_at wins)
        const uniqueUsers = Array.from(
          new Map(
            users
              .sort((a, b) => new Date(b.online_at || 0) - new Date(a.online_at || 0))
              .map(u => [u.id, u])
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

    // Heartbeat for Realtime Presence (Keep the channel alive and metadata fresh)
    const heartbeatInterval = setInterval(trackPresence, 30000);

    // Heartbeat for Database Persistence (fallback for "Active X mins ago")
    const dbPersistenceInterval = setInterval(async () => {
       if (user?.id) {
         try {
           await supabase.from('users').update({ 
             last_active_at: new Date().toISOString() 
           }).eq('id', user.id);
         } catch (err) {
           console.warn('Failed to update last_active_at:', err);
         }
       }
    }, 120000); // Every 2 minutes
    
    // Initial track
    const timer = setTimeout(trackPresence, 1000);
    
    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(dbPersistenceInterval);
      clearTimeout(timer);
      channel.unsubscribe();
    };
  }, [user?.id]); // Only re-subscribe if user ID changes

  // Separate effect for tracking metadata updates to the existing channel
  useEffect(() => {
    if (!user || !profile) return;
    
    const channel = supabase.getChannels().find(c => c.name === 'online-users');
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
  }, [profile, userRoles, presenceContext]); // Update tracking on metadata changes

  const updatePresenceContext = useCallback((newContext, details = null) => {
    setPresenceContext(prev => {
      // Prevent redundant updates
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
  const hasAnyRole = (roles) => roles.some(role => userRoles.includes(role));
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
