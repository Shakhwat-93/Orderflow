// @ts-nocheck
'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Alert, AlertTitle, AlertDescription, AlertAction } from '@/components/ui/alert';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

type AlertVariant = 'default' | 'destructive' | 'warning' | 'success' | 'info';

interface ActiveAlert {
  id: string;
  title?: string;
  message: string;
  variant: AlertVariant;
  duration?: number;
}

interface AlertContextType {
  showAlert: (options: { message: string; title?: string; variant?: AlertVariant; duration?: number }) => void;
  showError: (message: string, title?: string) => void;
  showSuccess: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  dismissAlert: (id: string) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([]);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const showAlert = useCallback(
    ({
      message,
      title,
      variant = 'default',
      duration = 4500
    }: {
      message: string;
      title?: string;
      variant?: AlertVariant;
      duration?: number;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Derive smart title if none provided
      let derivedTitle = title;
      if (!derivedTitle) {
        switch (variant) {
          case 'destructive':
            derivedTitle = 'Action Failed';
            break;
          case 'warning':
            derivedTitle = 'Attention Required';
            break;
          case 'success':
            derivedTitle = 'Success';
            break;
          case 'info':
            derivedTitle = 'Notice';
            break;
          default:
            derivedTitle = 'Notification';
            break;
        }
      }

      setAlerts((prev) => [...prev.slice(-3), { id, title: derivedTitle, message, variant, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          dismissAlert(id);
        }, duration);
      }
    },
    [dismissAlert]
  );

  const showError = useCallback((message: string, title = 'Error') => {
    showAlert({ message, title, variant: 'destructive' });
  }, [showAlert]);

  const showSuccess = useCallback((message: string, title = 'Success') => {
    showAlert({ message, title, variant: 'success' });
  }, [showAlert]);

  const showWarning = useCallback((message: string, title = 'Warning') => {
    showAlert({ message, title, variant: 'warning' });
  }, [showAlert]);

  const showInfo = useCallback((message: string, title = 'Information') => {
    showAlert({ message, title, variant: 'info' });
  }, [showAlert]);

  // Intercept window.alert so all legacy alert() calls use the shadcn Alert system
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalAlert = window.alert;

    window.alert = (msg?: any) => {
      const text = String(msg ?? '');
      const lower = text.toLowerCase();
      
      let variant: AlertVariant = 'default';
      let title = 'Alert';

      if (lower.includes('error') || lower.includes('fail') || lower.includes('unauthorized') || lower.includes('invalid') || lower.includes('cannot') || lower.includes('denied')) {
        variant = 'destructive';
        title = 'Error';
      } else if (lower.includes('warn') || lower.includes('missing') || lower.includes('expired') || lower.includes('required') || lower.includes('please')) {
        variant = 'warning';
        title = 'Notice';
      } else if (lower.includes('success') || lower.includes('saved') || lower.includes('confirmed') || lower.includes('dispatched') || lower.includes('updated')) {
        variant = 'success';
        title = 'Success';
      }

      showAlert({ message: text, title, variant, duration: 5000 });
    };

    return () => {
      window.alert = originalAlert;
    };
  }, [showAlert]);

  const renderIcon = (variant: AlertVariant) => {
    switch (variant) {
      case 'destructive':
        return <AlertCircle className="size-5 text-destructive shrink-0" />;
      case 'warning':
        return <AlertTriangle className="size-5 text-amber-500 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />;
      case 'info':
        return <Info className="size-5 text-blue-500 shrink-0" />;
      default:
        return <Info className="size-5 text-muted-foreground shrink-0" />;
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showError, showSuccess, showWarning, showInfo, dismissAlert }}>
      {children}

      {/* Floating shadcn Alert Toast Host */}
      {alerts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 max-w-md w-[calc(100vw-40px)] pointer-events-none"
        >
          {alerts.map((alert) => (
            <div key={alert.id} className="pointer-events-auto transition-all animate-in fade-in slide-in-from-top-3 duration-200">
              <Alert variant={alert.variant} className="shadow-xl bg-surface/95 backdrop-blur-md border border-border">
                {renderIcon(alert.variant)}
                {alert.title && <AlertTitle className="font-semibold text-sm">{alert.title}</AlertTitle>}
                <AlertDescription className="text-xs whitespace-pre-line break-words">
                  {alert.message}
                </AlertDescription>
                <AlertAction>
                  <button
                    type="button"
                    onClick={() => dismissAlert(alert.id)}
                    className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    aria-label="Close alert"
                  >
                    <X className="size-3.5" />
                  </button>
                </AlertAction>
              </Alert>
            </div>
          ))}
        </div>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
}
