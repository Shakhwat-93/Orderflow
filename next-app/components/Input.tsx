import React, { forwardRef } from 'react';
import { SmoothCaretInput } from '@/components/ui/smooth-caret-input';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement | HTMLTextAreaElement> {
  label?: React.ReactNode;
  error?: string;
  helperText?: string;
  id?: string;
  fullWidth?: boolean;
  className?: string;
  isTextarea?: boolean;
  rows?: number;
  smoothCaret?: boolean;
  wrapperClassName?: string;
  caretColor?: string;
}

export const Input = forwardRef<HTMLInputElement & HTMLTextAreaElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      id,
      fullWidth = false,
      className = '',
      isTextarea = false,
      smoothCaret = true,
      wrapperClassName = '',
      caretColor,
      ...props
    },
    ref
  ) => {
    return (
      <div className={`input-group ${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label htmlFor={id} className="input-label">
            {label}
          </label>
        )}
        {isTextarea ? (
          <textarea
            ref={ref as any}
            id={id}
            className={`input-field textarea-field ${error ? 'input-error' : ''}`}
            {...(props as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <SmoothCaretInput
            ref={ref as any}
            id={id}
            smoothCaret={smoothCaret}
            caretColor={caretColor}
            wrapperClassName={`w-full ${wrapperClassName}`}
            className={`input-field ${error ? 'input-error' : ''}`}
            {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {error && <span className="input-helper text-danger">{error}</span>}
        {!error && helperText && <span className="input-helper">{helperText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
