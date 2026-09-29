'use client';

import React from 'react';
import { Clock, CheckCircle, AlertTriangle, Zap, Timer } from 'lucide-react';
import { useSharedClock } from '@/hooks/useSharedClock';

const THRESHOLD_GREEN  = 10;
const THRESHOLD_YELLOW = 15;

const CALL_QUEUE_STATUSES = new Set(['New', 'Pending Call', 'Final Call Pending']);

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function formatTime(date?: Date | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function deriveState(elapsedMins: number, responded: boolean): string {
  if (responded) {
    if (elapsedMins <= THRESHOLD_GREEN)  return 'resolved-green';
    if (elapsedMins <= THRESHOLD_YELLOW) return 'resolved-yellow';
    return 'resolved-red';
  }
  if (elapsedMins <= THRESHOLD_GREEN)  return 'green';
  if (elapsedMins <= THRESHOLD_YELLOW) return 'yellow';
  return 'red';
}

export interface ResponseTimerProps {
  order: any;
  mode?: 'compact' | 'full';
}

export const ResponseTimer: React.FC<ResponseTimerProps> = React.memo(({ order, mode = 'compact' }) => {
  const createdAt = order?.created_at ? new Date(order.created_at) : null;
  const respondedAt = order?.first_call_time
    ? new Date(order.first_call_time)
    : order?.last_call_at && (order?.call_attempts > 0)
    ? new Date(order.last_call_at)
    : null;

  const hasCallAttempt = !!respondedAt || Number(order?.call_attempts || 0) > 0;
  const isCallQueueOrder = CALL_QUEUE_STATUSES.has(order?.status);
  const shouldShow = isCallQueueOrder || hasCallAttempt;
  const isLive = shouldShow && !hasCallAttempt && !!createdAt;

  // Subscribe to the single shared clock ticker only when order is actively waiting for response
  const nowSec = useSharedClock(isLive);

  if (!shouldShow || !createdAt) return null;

  const endTime    = respondedAt || new Date(nowSec * 1000);
  const elapsedMs  = endTime.getTime() - createdAt.getTime();
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedMin = elapsedMs / 60000;

  const state   = deriveState(elapsedMin, hasCallAttempt);
  const timeStr = formatElapsed(elapsedSec);
  const isCritical = state === 'red';

  const Icon = hasCallAttempt
    ? (state === 'resolved-green' ? CheckCircle : state === 'resolved-yellow' ? Zap : AlertTriangle)
    : (isCritical ? AlertTriangle : state === 'yellow' ? Clock : Timer);

  const tooltipParts = [
    `Order received: ${formatTime(createdAt)}`,
    hasCallAttempt
      ? `First response: ${formatTime(respondedAt)} (${timeStr} after order)`
      : `Waiting for response — ${timeStr} elapsed`,
  ];
  if (isLive && isCritical) tooltipParts.push('⚠️ CRITICAL: Response overdue!');

  if (mode === 'compact') {
    return (
      <div
        className={`rt-badge rt-${state} ${isLive && isCritical ? 'rt-pulse' : ''}`}
        title={tooltipParts.join('\n')}
        aria-label={`Response timer: ${timeStr}, state: ${state}`}
      >
        <Icon size={11} className="rt-icon" />
        <span className="rt-time">{timeStr}</span>
        {isLive && (
          <span className="rt-dot" aria-hidden="true" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`rt-full rt-${state} ${isLive && isCritical ? 'rt-pulse' : ''}`}
      title={tooltipParts.join('\n')}
    >
      <div className="rt-full-icon-wrap">
        <Icon size={12} />
      </div>
      <div className="rt-full-content">
        <span className="rt-full-value">{timeStr}</span>
        <span className="rt-full-label">
          {hasCallAttempt
            ? `responded in ${timeStr}`
            : isCritical
            ? 'CRITICAL — respond now!'
            : state === 'yellow'
            ? 'response overdue'
            : 'awaiting response'}
        </span>
        {hasCallAttempt && respondedAt && (
          <span className="rt-full-meta">
            First response at {formatTime(respondedAt)}
          </span>
        )}
      </div>
      {isLive && <span className="rt-live-pip" aria-label="Live timer" />}
    </div>
  );
});

ResponseTimer.displayName = 'ResponseTimer';

export default ResponseTimer;
