import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [userRoles, setUserRoles] = useState([]);
  const [loading, setLoading] = useState(true);

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
        setUserRoles(rolesData.map(r => r.role_id));
      } else {
        setUserRoles([]);
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

  useEffect(() => {
    if (!profile || !user) return;

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
            online_at: p.online_at || null
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
        console.log('You have joined the presence channel');
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            online_at: new Date().toISOString(),
            profile: {
              id: user.id,
              name: profile.name,
              roles: userRoles,
              avatar_url: profile.avatar_url,
              email: profile.email
            }
          });
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [profile, user, userRoles]);


  const hasRole = (role) => userRoles.includes(role);
  const hasAnyRole = (roles) => roles.some(role => userRoles.includes(role));
  const isAdmin = userRoles.includes('Admin');

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      userRoles,
      onlineUsers,
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
