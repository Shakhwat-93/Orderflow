import { forwardRef, useState } from 'react';
import './Input.css';

export const Input = forwardRef(({ 
  label, 
  error, 
  helperText, 
  id, 
  fullWidth = false, 
  className = '', 
  isTextarea = false,
  onInput,
  ...props 
}, ref) => {
  const Component = isTextarea ? 'textarea' : 'input';
  const [isTyping, setIsTyping] = useState(false);

  const handleInput = (event) => {
    setIsTyping(Boolean(event.target.value));
    onInput?.(event);
  };
  
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
        className={`input-field ${isTextarea ? 'textarea-field' : ''} ${error ? 'input-error' : ''} ${isTyping ? 'is-typing' : ''}`}
        onInput={handleInput}
        {...props}
      />
      {error && <span className="input-helper text-danger">{error}</span>}
      {!error && helperText && <span className="input-helper">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';
