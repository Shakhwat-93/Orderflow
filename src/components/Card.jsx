import './Card.css';

export const Card = ({ children, className = '', noPadding = false, ...props }) => {
  return (
    <div className={`card shadow-sm ${noPadding ? '' : 'p-4'} ${className}`} {...props}>
      {children}
    </div>
  );
};
