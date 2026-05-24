/**
 * ResponseTimer — Elite Order Response Time Tracker
 *
 * Tracks how long since an order arrived and whether call team
 * responded (clicked / logged an attempt) within SLA thresholds.
 *
 * Visual states (for "New" / call-queue orders):
 *  • GREEN   — responded within 10 minutes (on-time)
 *  • YELLOW  — 10–15 minutes elapsed, no response yet (warning)
 *  • RED     — >15 minutes elapsed, no response (critical, pulsing)
 *
 * If already responded (first_call_time OR call_attempts > 0):
 *  • Shows how long the response TOOK (green if ≤10m, yellow if ≤15m, red if >15m)
 *  • Plus the timestamp when the first response happened
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle, AlertTriangle, Zap, Timer } from 'lucide-react';
import './ResponseTimer.css';

// ─── SLA Thresholds (in minutes) ─────────────────────────────
const THRESHOLD_GREEN  = 10; // ≤10m = on-time
const THRESHOLD_YELLOW = 15; // 10–15m = warning
// >15m = critical (red)

// ─── Order statuses that are "call-queue" statuses ────────────
const CALL_QUEUE_STATUSES = new Set(['New', 'Pending Call', 'Final Call Pending']);

/**
 * Returns minutes difference between two Date objects.
 * Always positive.
 */
function minutesDiff(dateA, dateB) {
  return Math.abs(dateA - dateB) / 60000;
}

/**
 * Format elapsed minutes into a human-readable string.
 * e.g. 65 → "1h 05m", 8 → "8m 30s" (if seconds provided)
 */
function formatElapsed(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Format a Date to a short time string like "2:34 PM"
 */
function formatTime(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Derive the SLA "state" from elapsed minutes and whether responded.
 * @param {number} elapsedMins
 * @param {boolean} responded
 * @returns {'green'|'yellow'|'red'|'resolved-green'|'resolved-yellow'|'resolved-red'}
 */
function deriveState(elapsedMins, responded) {
  if (responded) {
    // Freeze: show the colour of how fast they responded
    if (elapsedMins <= THRESHOLD_GREEN)  return 'resolved-green';
    if (elapsedMins <= THRESHOLD_YELLOW) return 'resolved-yellow';
    return 'resolved-red';
  }
  // Still waiting
  if (elapsedMins <= THRESHOLD_GREEN)  return 'green';
  if (elapsedMins <= THRESHOLD_YELLOW) return 'yellow';
  return 'red';
}

// ─── Main Component ──────────────────────────────────────────

/**
 * @param {object} props
 * @param {object}  props.order          - Full order object
 * @param {'compact'|'full'} props.mode  - 'compact' for table cells, 'full' for detail views
 */
export const ResponseTimer = ({ order, mode = 'compact' }) => {
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  // ── Derived values ──────────────────────────────────────────
  const createdAt   = order?.created_at  ? new Date(order.created_at)   : null;
  const respondedAt = order?.first_call_time
    ? new Date(order.first_call_time)
    : order?.last_call_at && (order?.call_attempts > 0)
    ? new Date(order.last_call_at)
    : null;

  const hasCallAttempt = !!respondedAt || Number(order?.call_attempts || 0) > 0;

  // Only show for call-queue statuses OR if there's a first_call_time
  const isCallQueueOrder = CALL_QUEUE_STATUSES.has(order?.status);
  const shouldShow = isCallQueueOrder || hasCallAttempt;

  // ── Tick every second while unresolved, every 30s when resolved ─
  useEffect(() => {
    if (!shouldShow || !createdAt) return;

    const interval = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, hasCallAttempt ? 30000 : 1000); // 1s live, 30s frozen

    return () => clearInterval(interval);
  }, [shouldShow, hasCallAttempt, createdAt]);

  if (!shouldShow || !createdAt) return null;

  // ── Calculate elapsed time ──────────────────────────────────
  const endTime    = respondedAt || new Date(nowSec * 1000);
  const elapsedMs  = endTime - createdAt;
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
  const elapsedMin = elapsedMs / 60000;

  const state   = deriveState(elapsedMin, hasCallAttempt);
  const timeStr = formatElapsed(elapsedSec);
  const isLive  = !hasCallAttempt;
  const isCritical = state === 'red';

  // ── Icon selection ─────────────────────────────────────────
  const Icon = hasCallAttempt
    ? (state === 'resolved-green' ? CheckCircle : state === 'resolved-yellow' ? Zap : AlertTriangle)
    : (isCritical ? AlertTriangle : state === 'yellow' ? Clock : Timer);

  // ── Tooltip label ──────────────────────────────────────────
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

  // ── Full mode (e.g., inside a detail card or CallTeam list row) ─
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
};

export default ResponseTimer;
