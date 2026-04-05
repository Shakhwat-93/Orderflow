import './Card.css';

export const Card = ({ children, className = '', noPadding = false, revealOnScroll = true, ...props }) => {
  return (
    <div
      className={`card shadow-sm ${noPadding ? '' : 'p-4'} ${className}`}
      data-scroll-reveal={revealOnScroll ? 'true' : undefined}
      {...props}
    >
      {children}
    </div>
  );
};
