import React from 'react';

const CurrencyIcon = ({ size = 16, className = "" }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <path 
        fill="none" 
        d="m8.25 7.5l.415-.207a.75.75 0 0 1 1.085.67V10.5m0 0h6m-6 0h-1.5m1.5 0v5.438c0 .354.161.697.473.865a3.75 3.75 0 0 0 5.452-2.553c.083-.409-.263-.75-.68-.75h-.745M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0"
      />
    </svg>
  );
};

export default CurrencyIcon;
