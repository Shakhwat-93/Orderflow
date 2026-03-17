import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Badge } from '../components/Badge';
import { User, Camera, Shield, Save, CheckCircle, AlertCircle } from 'lucide-react';
import './Profile.css';

export const Profile = () => {
  const { user, profile, updateProfile, updatePassword, uploadAvatar } = useAuth();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [loading, setLoading] = useState({ profile: false, password: false, avatar: false });
  const [message, setMessage] = useState({ type: '', text: '' });

  // Sync name state when profile loads
  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!profile?.id && !user?.id) {
      setMessage({ type: 'error', text: 'User session not found' });
      return;
    }
    setLoading(prev => ({ ...prev, profile: true }));
    try {
      await updateProfile(profile?.id || user?.id, { name });
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, profile: false }));
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match!' });
      return;
    }
    setLoading(prev => ({ ...prev, password: true }));
    try {
      await updatePassword(passwords.new);
      setPasswords({ new: '', confirm: '' });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, password: false }));
    }
  };

  const handleAvatarClick = () => fileInputRef.current.click();

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, avatar: true }));
    try {
      await uploadAvatar(file);
      setMessage({ type: 'success', text: 'Avatar updated!' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(prev => ({ ...prev, avatar: false }));
    }
  };

  return (
    <div className="profile-container">
      <div className="page-header">
        <h1>Account Settings</h1>
        <p>Manage your personal profile and security.</p>
      </div>

      {message.text && (
        <div className={`message-banner ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{message.text}</span>
          <button onClick={() => setMessage({ type: '', text: '' })} className="close-msg">×</button>
        </div>
      )}

      <div className="profile-grid">
        <div className="profile-main">
          <Card className="liquid-glass profile-card">
            <div className="avatar-section">
              <div className="avatar-wrapper" onClick={handleAvatarClick}>
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="profile-img" />
                ) : (
                  <div className="avatar-placeholder">
                    {profile?.name?.charAt(0).toUpperCase() || <User />}
                  </div>
                )}
                <div className="avatar-overlay">
                  <Camera size={20} />
                </div>
                {loading.avatar && <div className="avatar-loader"></div>}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleAvatarChange} 
                accept="image/*" 
                hidden 
              />
              <div className="avatar-info">
                <h3>{profile?.name}</h3>
                <p>{profile?.email}</p>
                <Badge variant="primary">{profile?.status}</Badge>
              </div>
            </div>

            <form onSubmit={handleProfileUpdate} className="profile-form">
              <Input 
                label="Display Name"
                placeholder="Your full name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
              <Input 
                label="Email Address (Login)"
                value={profile?.email}
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
              <h3>Security</h3>
            </div>
            <form onSubmit={handlePasswordUpdate} className="security-form">
              <Input 
                label="New Password"
                type="password"
                placeholder="Min 6 characters"
                value={passwords.new}
                onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                required
              />
              <Input 
                label="Confirm Password"
                type="password"
                placeholder="Repeat new password"
                value={passwords.confirm}
                onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                required
              />
              <Button type="submit" variant="ghost" disabled={loading.password}>
                {loading.password ? 'Changing...' : 'Change Password'}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
};
