import React from 'react';
import { ShieldAlert, UserPlus, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './Button';
import './AccessRestricted.css';

export const AccessRestricted = () => {
  const { signOut, user } = useAuth();

  return (
    <div className="restricted-overlay">
      <div className="restricted-content liquid-glass floating">
        <div className="restricted-icon-wrapper">
          <ShieldAlert size={48} className="restricted-icon" />
        </div>
        
        <h1 className="restricted-title">Access Restricted</h1>
        
        <p className="restricted-message">
          Your account <strong>({user?.email})</strong> is not yet authorized to access this system. 
        </p>
        
        <div className="restricted-action-box">
          <p className="restricted-hint">
            Please contact your system administrator to request access. Once they add your email to the team list, you will be able to sign in.
          </p>
        </div>

        <div className="restricted-footer">
          <Button 
            variant="ghost" 
            onClick={() => signOut()}
            className="logout-btn"
          >
            <LogOut size={18} />
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
};
