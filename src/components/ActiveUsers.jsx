import { useAuth } from '../context/AuthContext';
import { User, ShieldCheck, Shield, PhoneCall } from 'lucide-react';
import './ActiveUsers.css';

export const ActiveUsers = () => {
  const { onlineUsers } = useAuth();

  const getRoleIcon = (roles = []) => {
    if (roles.includes('Admin')) return <ShieldCheck size={12} className="text-rose-500" />;
    if (roles.includes('Moderator')) return <Shield size={12} className="text-amber-500" />;
    if (roles.includes('Call Team')) return <PhoneCall size={12} className="text-sky-500" />;
    return <User size={12} className="text-slate-400" />;
  };

  const getRoleColor = (roles = []) => {
    if (roles.includes('Admin')) return 'role-admin';
    if (roles.includes('Moderator')) return 'role-moderator';
    if (roles.includes('Call Team')) return 'role-call';
    return 'role-user';
  };

  return (
    <div className="active-users-card">
      <div className="card-header-presence">
        <h3>Active Now</h3>
        <span className="user-count">{onlineUsers.length}</span>
      </div>
      
      <div className="users-list-horizontal">
        {onlineUsers.map((u, idx) => (
          <div key={u.id} className="user-presence-item" title={`${u.name} (${u.roles?.join(', ') || 'User'})`}>
            <div className={`avatar-wrapper ${getRoleColor(u.roles)}`}>
              {u.avatar_url ? (
                <img src={u.avatar_url} alt={u.name} className="presence-avatar" />
              ) : (
                <span className="avatar-initial">{u.name?.charAt(0).toUpperCase()}</span>
              )}
              <div className="online-indicator"></div>
              <div className="role-tag">
                {getRoleIcon(u.roles)}
              </div>
            </div>
          </div>
        ))}
        {onlineUsers.length === 0 && (
          <p className="no-users">No users online</p>
        )}
      </div>
    </div>
  );
};
