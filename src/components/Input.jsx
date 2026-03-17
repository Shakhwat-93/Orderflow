import { forwardRef } from 'react';
import './Input.css';

export const Input = forwardRef(({ 
  label, 
  error, 
  helperText, 
  id, 
  fullWidth = false, 
  className = '', 
  isTextarea = false,
  ...props 
}, ref) => {
  const Component = isTextarea ? 'textarea' : 'input';
  
  return (
    <div className={`input-group ${fullWidth ? 'w-full' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="input-label">
          {label}
        </label>
      )}
      <Component
        ref={ref}
        id={id}
        className={`input-field ${isTextarea ? 'textarea-field' : ''} ${error ? 'input-error' : ''}`}
        {...props}
      />
      {error && <span className="input-helper text-danger">{error}</span>}
      {!error && helperText && <span className="input-helper">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';
