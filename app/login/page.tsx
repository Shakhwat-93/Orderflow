'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useBranding } from '@/context/BrandingContext';
import { User, Lock, Loader2, AlertCircle } from 'lucide-react';
import { getRoleRoute } from '@/lib/authRoutes';
import { SmoothCaretInput } from '@/components/ui/smooth-caret-input';
import { AuthLoader } from '@/components/AuthLoader';
import './Login.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { signIn, user, loading: authLoading, isAuthReady, userRoles } = useAuth();
  const { appName } = useBranding();
  const router = useRouter();

  // If user is already authenticated with roles, redirect to their role home
  useEffect(() => {
    if (isAuthReady && !authLoading && user && userRoles.length > 0) {
      const targetRoute = getRoleRoute(userRoles);
      router.replace(targetRoute);
    }
  }, [user, authLoading, isAuthReady, userRoles, router]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError('');
      setIsSubmitting(true);
      await signIn(email, password);
    } catch (err: any) {
      setError(err?.message || 'Failed to authenticate. Please check your credentials.');
      setIsSubmitting(false);
    }
  };

  // If user is authenticated and redirecting, show the premium AuthLoader
  if (user) {
    return <AuthLoader />;
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        {/* Header with Logo and Brand */}
        <div className="login-header">
          <div className="login-logo-container">
            <Image 
              src="/orderflow-logo.png" 
              alt="OrderFlow Logo" 
              width={64} 
              height={64} 
              className="login-logo-img" 
              unoptimized
            />
          </div>
          <div className="login-brand-copy">
            <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100" suppressHydrationWarning>{appName || 'OrderFlow'}</h1>
            <p className="text-sm font-medium text-slate-500">Sign in to continue to your dashboard.</p>
          </div>
        </div>
        
        {/* Authentication Form */}
        <form onSubmit={handleAuth} className="login-form">
          {error && (
            <div className="login-error flex items-center justify-center gap-2">
              <AlertCircle size={16} className="text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          <div className="neu-input-field">
            <User size={20} className="text-slate-400 shrink-0" />
            <SmoothCaretInput 
              type="email"
              placeholder="Email address"
              wrapperClassName="flex-1 min-w-0 h-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          
          <div className="neu-input-field">
            <Lock size={20} className="text-slate-400 shrink-0" />
            <SmoothCaretInput 
              type="password"
              placeholder="Password"
              wrapperClassName="flex-1 min-w-0 h-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          
          <button 
            type="submit" 
            className="login-submit-btn flex items-center justify-center gap-2" 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Logging in...</span>
              </>
            ) : (
              <span>Login</span>
            )}
          </button>

          <footer className="login-footer">
            <span className="login-link text-xs text-slate-400">OrderFlow Enterprise Hub</span>
          </footer>
        </form>
      </div>
    </div>
  );
}
