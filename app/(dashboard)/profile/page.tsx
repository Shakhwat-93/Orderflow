'use client';

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/services/api/client';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Badge } from '@/components/Badge';
import { User, Camera, Shield, Save, CheckCircle, AlertCircle } from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, updateProfile, updatePassword, uploadAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [loading, setLoading] = useState({ profile: false, password: false, avatar: false });
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUserId = profile?.id || user?.id;
    if (!targetUserId) {
      setMessage({ type: 'error', text: 'User session not found' });
      return;
    }
    setLoading((prev) => ({ ...prev, profile: true }));
    try {
      await updateProfile(targetUserId, { name });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading((prev) => ({ ...prev, profile: false }));
    }
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match!' });
      return;
    }
    if (passwords.new.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setLoading((prev) => ({ ...prev, password: true }));
    try {
      const email = profile?.email || user?.email || '';
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: passwords.current
      });

      if (authError) {
        throw new Error('Verification failed: Current password is incorrect.');
      }

      await updatePassword(passwords.new);

      setPasswords({ current: '', new: '', confirm: '' });
      setMessage({ type: 'success', text: 'Password changed successfully!' });

      await api.logActivity({
        action_type: 'PASSWORD_CHANGE',
        changed_by_user_id: user?.id,
        changed_by_user_name: profile?.name || 'User',
        action_description: `${profile?.name || 'User'} updated their account password`
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading((prev) => ({ ...prev, password: false }));
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading((prev) => ({ ...prev, avatar: true }));
    try {
      await uploadAvatar(file);
      setMessage({ type: 'success', text: 'Avatar updated successfully!' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading((prev) => ({ ...prev, avatar: false }));
    }
  };

  return (
    <div className="profile-container">
      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your personal profile, credentials, and security preferences.</p>
      </div>

      {message.text && (
        <div className={`message-banner ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })} className="close-msg" type="button">
            ×
          </button>
        </div>
      )}

      <div className="profile-grid">
        <div className="profile-main">
          <Card className="liquid-glass profile-card">
            <div className="avatar-section">
              <div className="avatar-wrapper" onClick={handleAvatarClick}>
                {profile?.avatar_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={profile.avatar_url}
                    alt="Avatar"
                    className="profile-img"
                    width={80}
                    height={80}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="avatar-placeholder">
                    {profile?.name?.charAt(0).toUpperCase() || <User size={24} />}
                  </div>
                )}
                <div className="avatar-overlay">
                  <Camera size={20} />
                </div>
                {loading.avatar && <div className="avatar-loader" />}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleAvatarChange}
                accept="image/*"
                hidden
              />
              <div className="avatar-info">
                <h3>{profile?.name || 'Team Member'}</h3>
                <p>{profile?.email || user?.email}</p>
                <Badge variant="primary">{profile?.status || 'active'}</Badge>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="profile-form">
              <Input
                label="Display Name"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Email Address (Login)"
                value={profile?.email || user?.email || ''}
                disabled
              />
              <Button type="submit" variant="primary" disabled={loading.profile || (!profile && !user)}>
                <Save size={18} /> {loading.profile ? 'Saving...' : 'Update Name'}
              </Button>
            </form>
          </Card>

          <Card className="liquid-glass security-card">
            <div className="card-header">
              <Shield size={20} />
              <h3>Security & Password</h3>
            </div>
            <form onSubmit={handlePasswordUpdate} className="security-form">
              <Input
                label="Current Password"
                type="password"
                placeholder="Verify your identity"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                required
              />
              <div className="password-divider" />
              <Input
                label="New Password"
                type="password"
                placeholder="Min 6 characters"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                required
              />
              <Input
                label="Confirm New Password"
                type="password"
                placeholder="Repeat new password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                required
              />
              <div className="form-actions-premium">
                <Button type="submit" variant="ghost" disabled={loading.password}>
                  {loading.password ? 'Verifying & Changing...' : 'Change Password'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
