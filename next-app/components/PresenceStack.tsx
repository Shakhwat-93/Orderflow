'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, Shield, PhoneCall, User } from 'lucide-react';
import { UserRole } from '@/types';

export const PresenceStack: React.FC = () => {
  const { onlineUsers } = useAuth();
  const [isSyncing, setIsSyncing] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsSyncing(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  const sortedUsers = [...onlineUsers].sort((a, b) => {
    const aIsAdmin = a.roles?.includes('Admin');
    const bIsAdmin = b.roles?.includes('Admin');
    if (aIsAdmin !== bIsAdmin) return aIsAdmin ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const displayUsers = sortedUsers.slice(0, 4);
  const extraCount = sortedUsers.length - displayUsers.length;

  const getRoleIcon = (roles: UserRole[] = []) => {
    if (roles.includes('Admin')) return <ShieldCheck size={10} className="text-rose-500" />;
    if (roles.includes('Moderator')) return <Shield size={10} className="text-amber-500" />;
    if (roles.includes('Call Team')) return <PhoneCall size={10} className="text-sky-500" />;
    return <User size={10} className="text-slate-400" />;
  };

  const getRoleClass = (roles: UserRole[] = []) => {
    if (roles.includes('Admin')) return 'role-admin';
    if (roles.includes('Moderator')) return 'role-moderator';
    if (roles.includes('Call Team')) return 'role-call';
    return 'role-user';
  };

  return (
    <div className="presence-stack">
      <div className="avatar-group">
        {displayUsers.map((u) => (
          <div
            key={u.id}
            className={`stack-avatar-wrapper ${getRoleClass(u.roles)}`}
            title={`${u.name || 'User'} • ${u.context?.page || 'Active'}`}
          >
            {u.avatar_url ? (
              <Image
                src={u.avatar_url}
                alt={u.name}
                width={28}
                height={28}
                className="stack-avatar"
                unoptimized
              />
            ) : (
              <div className="stack-avatar-placeholder">
                {(u.name || u.email || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="stack-role-badge">{getRoleIcon(u.roles)}</div>
            <div className="presence-tooltip">
              <span className="user-name">{u.name || 'User'}</span>
              <span className="user-context">{u.context?.page || 'Idle'}</span>
            </div>
          </div>
        ))}
        {extraCount > 0 && <div className="avatar-extra">+{extraCount}</div>}
      </div>
      <div className="presence-label desktop-only-flex">
        {isSyncing ? 'Syncing...' : `${onlineUsers.length} Online`}
      </div>
    </div>
  );
};
