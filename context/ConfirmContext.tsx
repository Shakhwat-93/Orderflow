'use client';

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { ConfirmDialog, ConfirmVariant } from '@/components/shared/ConfirmDialog';

export interface ConfirmOptions {
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  affectedCount?: number;
  badge?: string;
  onConfirm?: () => void | Promise<void>;
}

export interface ConfirmContextType {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmOptions;
  }>({
    open: false,
    options: { title: '' },
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((optionsOrMessage: ConfirmOptions | string): Promise<boolean> => {
    // If a dialog is already waiting, cancel previous
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }

    const options: ConfirmOptions =
      typeof optionsOrMessage === 'string'
        ? {
            title: 'Please Confirm',
            description: optionsOrMessage,
            variant: optionsOrMessage.toLowerCase().includes('delete') ||
              optionsOrMessage.toLowerCase().includes('permanently') ||
              optionsOrMessage.toLowerCase().includes('discard')
                ? 'destructive'
                : 'default',
          }
        : optionsOrMessage;

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setDialogState({
        open: true,
        options,
      });
    });
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
      setDialogState((prev) => ({ ...prev, open: false }));
    } else {
      setDialogState((prev) => ({ ...prev, open: true }));
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    if (dialogState.options.onConfirm) {
      await dialogState.options.onConfirm();
    }
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  }, [dialogState.options]);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
    };
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={dialogState.open}
        onOpenChange={handleOpenChange}
        title={dialogState.options.title}
        description={dialogState.options.description}
        confirmLabel={dialogState.options.confirmLabel}
        cancelLabel={dialogState.options.cancelLabel}
        variant={dialogState.options.variant}
        affectedCount={dialogState.options.affectedCount}
        badge={dialogState.options.badge}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
}
