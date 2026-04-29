import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, ShieldCheck, Zap } from 'lucide-react';
import './SLATimer.css';

export const SLATimer = ({ createdAt, firstCallTime, status }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Only tick if not resolved
    if (!firstCallTime && ['New', 'Pending Call', 'Final Call Pending'].includes(status)) {
      const interval = setInterval(() => setNow(new Date()), 30000); // 30s precision
      return () => clearInterval(interval);
    }
  }, [firstCallTime, status]);

  const startTime = new Date(createdAt);
  const endTime = firstCallTime ? new Date(firstCallTime) : now;
  const isResolved = !!firstCallTime || !['New', 'Pending Call', 'Final Call Pending'].includes(status);
  
  const diffMs = Math.abs(endTime - startTime);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;

  let timeString = diffHours > 0 ? `${diffHours}h ${remainingMins}m` : `${diffMins}m`;
  
  // Thresholds
  let slaState = 'excellent'; // < 15m
  if (diffMins >= 15 && diffMins < 60) slaState = 'good';
  if (diffMins >= 60 && diffMins < 240) slaState = 'delayed';
  if (diffMins >= 240) slaState = 'breached';

  const Icon = isResolved ? ShieldCheck : 
                slaState === 'excellent' ? Zap : 
                slaState === 'breached' ? AlertTriangle : Clock;

  return (
    <div 
      className={`sla-timer-v2 ${slaState} ${isResolved ? 'resolved' : 'active'}`}
      title={`Order Created: ${startTime.toLocaleString()}`}
    >
      <div className="sla-icon-wrapper">
        <Icon size={14} className={slaState === 'breached' && !isResolved ? 'pulse-icon' : ''} />
      </div>
      <div className="sla-content">
        <span className="sla-value">{timeString}</span>
        <span className="sla-type">
          {isResolved ? 'Resolution' : 'Delay'}
        </span>
      </div>
    </div>
  );
};
