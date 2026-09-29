'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types';
import { AccessRestricted } from './AccessRestricted';

interface RoleGateProps {
  children: React.ReactNode;
  roles: UserRole[];
}

export const RoleGate: React.FC<RoleGateProps> = ({ children, roles }) => {
  const { userRoles, isAuthReady, loading } = useAuth();

  if (!isAuthReady || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasAccess = roles.some((role) => userRoles.includes(role));

  if (!hasAccess) {
    return <AccessRestricted />;
  }

  return <>{children}</>;
};
