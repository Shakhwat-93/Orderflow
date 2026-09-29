'use client';

import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Info, HelpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConfirmVariant = 'destructive' | 'warning' | 'default' | 'info';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  disabled?: boolean;
  affectedCount?: number;
  badge?: string;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'default',
  loading: externalLoading,
  disabled = false,
  affectedCount,
  badge,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [internalLoading, setInternalLoading] = useState(false);
  const isLoading = externalLoading ?? internalLoading;

  const handleConfirm = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isLoading || disabled) return;

    try {
      const result = onConfirm();
      if (result instanceof Promise) {
        setInternalLoading(true);
        await result;
      }
      onOpenChange(false);
    } catch (err) {
      console.error('ConfirmDialog action failed:', err);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) return;
    onCancel?.();
    onOpenChange(false);
  };

  const resolvedConfirmLabel =
    confirmLabel ||
    (variant === 'destructive'
      ? 'Delete'
      : variant === 'warning'
      ? 'Proceed'
      : 'Confirm');

  const renderIcon = () => {
    switch (variant) {
      case 'destructive':
        return (
          <div className="flex size-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 ring-1 ring-rose-500/20">
            <AlertTriangle className="size-5" />
          </div>
        );
      case 'warning':
        return (
          <div className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 ring-1 ring-amber-500/20">
            <AlertTriangle className="size-5" />
          </div>
        );
      case 'info':
        return (
          <div className="flex size-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 ring-1 ring-blue-500/20">
            <Info className="size-5" />
          </div>
        );
      default:
        return (
          <div className="flex size-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 ring-1 ring-indigo-500/20">
            <HelpCircle className="size-5" />
          </div>
        );
    }
  };

  const getActionButtonStyle = () => {
    switch (variant) {
      case 'destructive':
        return 'bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-700 shadow-sm';
      case 'warning':
        return 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700 shadow-sm';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-700 shadow-sm';
      default:
        return 'bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 shadow-sm';
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!isLoading ? onOpenChange(next) : null)}>
      <AlertDialogContent>
        <div className="flex items-start gap-3.5">
          <AlertDialogMedia className="mt-0.5 mb-0 size-auto bg-transparent">
            {renderIcon()}
          </AlertDialogMedia>

          <AlertDialogHeader className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <AlertDialogTitle className="text-base font-semibold text-foreground tracking-tight">
                {title}
              </AlertDialogTitle>
              {typeof affectedCount === 'number' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-foreground border border-border">
                  {affectedCount} {affectedCount === 1 ? 'item' : 'items'}
                </span>
              )}
              {badge && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                  {badge}
                </span>
              )}
            </div>

            {description && (
              <AlertDialogDescription className="text-xs leading-relaxed text-muted-foreground pt-0.5">
                {description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="mt-4 pt-3 gap-2">
          <AlertDialogCancel
            disabled={isLoading}
            onClick={handleCancel}
            className="text-xs h-9 px-3.5 font-medium border-border hover:bg-muted/80 text-foreground cursor-pointer"
          >
            {cancelLabel}
          </AlertDialogCancel>

          <AlertDialogAction
            disabled={isLoading || disabled}
            onClick={handleConfirm}
            className={cn(
              'text-xs h-9 px-4 font-medium transition-all cursor-pointer inline-flex items-center gap-1.5',
              getActionButtonStyle()
            )}
          >
            {isLoading && <Loader2 className="size-3.5 animate-spin" />}
            {resolvedConfirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
