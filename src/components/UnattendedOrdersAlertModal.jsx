import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrders } from '../context/OrderContext';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { 
  AlertTriangle, Phone, Clock, Play, CheckCircle, 
  ChevronRight, HelpCircle, Volume2, VolumeX, ShieldAlert,
  User, Package, MapPin, X
} from 'lucide-react';
import './UnattendedOrdersAlertModal.css';

// ── Synthesize premium alert sound ──
const playPremiumAlertSound = (muted) => {
  if (muted) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Pulse 1
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
    gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.25);

    // Pulse 2 (slight delay)
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc2.frequency.exponentialRampToValueAtTime(987.77, audioCtx.currentTime + 0.15); // B5
      gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.25);
    }, 180);
  } catch (e) {
    console.warn('Audio synthesis blocked/failed:', e);
  }
};

// ── Synthesize soft resolved chime ──
const playResolvedChime = (muted) => {
  if (muted) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.2); // C6
    
    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    console.warn(e);
  }
};

export const UnattendedOrdersAlertModal = () => {
  const { orders, fetchOrders } = useOrders();
  const { user, profile, userRoles } = useAuth();
  
  const [unattendedItems, setUnattendedItems] = useState([]);
  const [snoozeUntil, setSnoozeUntil] = useState(0);
  const [soundMuted, setSoundMuted] = useState(() => {
    return localStorage.getItem('of_unattended_sound_muted') === 'true';
  });
  const [quickActionId, setQuickActionId] = useState(null);
  const [actionNote, setActionNote] = useState('');
  const [loadingId, setLoadingId] = useState(null);
  const [timerTick, setTimerTick] = useState(0);

  // Audio trigger ref to prevent sound spamming
  const lastSoundTimeRef = useRef(0);

  // Read config from Settings or fall back to 20 minutes
  const getThresholdMinutes = () => {
    try {
      const cfg = JSON.parse(localStorage.getItem('of_alerts_config') || '{}');
      if (cfg.no_call_alert_enabled === false) return Infinity; // disabled
      return Number(cfg.no_call_alert_mins) || 20;
    } catch {
      return 20;
    }
  };

  // Determine which orders are unattended (> 20 mins, no attempts)
  useEffect(() => {
    if (!orders || orders.length === 0) {
      setUnattendedItems([]);
      return;
    }

    const thresholdMins = getThresholdMinutes();
    if (thresholdMins === Infinity) {
      setUnattendedItems([]);
      return;
    }

    const now = Date.now();
    const activeCallStatuses = ['New', 'Pending Call', 'Final Call Pending'];

    const filtered = orders.filter(o => {
      // 1. Must be in New or pending call states
      if (!activeCallStatuses.includes(o.status)) return false;
      
      // 2. Must not have any call attempts
      const hasAttempt = Number(o.call_attempts || 0) > 0 || !!(o.first_call_time || o.last_call_at);
      if (hasAttempt) return false;

      // 3. Must be older than threshold
      const createdAt = new Date(o.created_at).getTime();
      const elapsedMins = (now - createdAt) / 60000;
      return elapsedMins >= thresholdMins;
    });

    setUnattendedItems(filtered);
  }, [orders, timerTick]);

  // Tick timer every second to update elapsed time & sound triggers
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle premium sound alarm
  useEffect(() => {
    if (unattendedItems.length === 0 || Date.now() < snoozeUntil) return;
    
    // Play alert sound every 15 seconds if unhandled
    const now = Date.now();
    if (now - lastSoundTimeRef.current > 15000) {
      playPremiumAlertSound(soundMuted);
      lastSoundTimeRef.current = now;
    }
  }, [unattendedItems, timerTick, snoozeUntil, soundMuted]);

  const toggleSound = () => {
    setSoundMuted(prev => {
      const next = !prev;
      localStorage.setItem('of_unattended_sound_muted', String(next));
      return next;
    });
  };

  // Snooze alert for 10 minutes
  const handleSnooze = () => {
    setSnoozeUntil(Date.now() + 10 * 60 * 1000);
  };

  // Quick Action Logger
  const handleQuickAttempt = async (orderId, attemptStatus) => {
    setLoadingId(orderId);
    try {
      const note = actionNote.trim() 
        ? `[Quick Action] ${attemptStatus}. Note: ${actionNote}` 
        : `[Quick Action] Logged call attempt: ${attemptStatus}`;

      await api.logCallAttempt(
        orderId, 
        attemptStatus, 
        user.id, 
        profile?.name || 'Agent', 
        userRoles, 
        note
      );

      playResolvedChime(soundMuted);
      setActionNote('');
      setQuickActionId(null);
      
      // Trigger full orders reload so state syncs instantly
      if (fetchOrders) await fetchOrders();
    } catch (err) {
      console.error(err);
      alert('Failed to log call attempt: ' + err.message);
    } finally {
      setLoadingId(null);
    }
  };

  // Calculate detailed elapsed time for display
  const getElapsedString = (createdTime) => {
    const diffMs = Date.now() - new Date(createdTime).getTime();
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainingMins = mins % 60;
      return `${hrs}h ${remainingMins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  // If snoozed or no unattended orders, render nothing
  const isSnoozed = Date.now() < snoozeUntil;
  if (unattendedItems.length === 0 || isSnoozed) return null;

  return (
    <AnimatePresence>
      <div className="unattended-alert-overlay">
        <motion.div 
          className="unattended-alert-modal"
          initial={{ scale: 0.9, y: 30, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 20, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
          {/* Header */}
          <div className="alert-modal-header">
            <div className="alert-badge-group">
              <span className="premium-danger-badge">CRITICAL ALERT</span>
              <div className="pulse-circle-ring">
                <div className="pulse-core" />
              </div>
            </div>
            
            <div className="sound-toggle-btn" onClick={toggleSound} title={soundMuted ? "Unmute Sound" : "Mute Sound"}>
              {soundMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </div>
          </div>

          <div className="alert-banner-content">
            <div className="danger-shield-icon">
              <ShieldAlert size={36} />
            </div>
            <h2>Unattended Orders Warning</h2>
            <p>
              The following {unattendedItems.length} order{unattendedItems.length > 1 ? 's are' : ' is'} waiting for more than <b>{getThresholdMinutes()} minutes</b> without any action or call attempts!
            </p>
          </div>

          {/* Unattended Orders List */}
          <div className="unattended-list-scrollable">
            {unattendedItems.map(order => {
              const isActionOpen = quickActionId === order.id;
              
              return (
                <div key={order.id} className={`unattended-card-item ${isActionOpen ? 'expanded' : ''}`}>
                  <div className="card-top-row">
                    <div className="card-order-info">
                      <div className="order-title-id">
                        <span className="order-id-hash">#{order.id}</span>
                        <span className="customer-name-bold">{order.customer_name || 'Anonymous Customer'}</span>
                      </div>
                      <div className="order-meta-info-grid">
                        <div className="meta-info-pill"><Phone size={12} /> <span>{order.phone || 'No Phone'}</span></div>
                        <div className="meta-info-pill"><Package size={12} /> <span className="product-text-truncate">{order.product_name || 'Custom Product'}</span></div>
                      </div>
                    </div>
                    <div className="order-elapsed-timer animate-timer">
                      <Clock size={12} />
                      <span>{getElapsedString(order.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions Drawer */}
                  <div className="card-actions-wrapper">
                    {!isActionOpen ? (
                      <button 
                        className="quick-resolve-trigger-btn"
                        onClick={() => {
                          setQuickActionId(order.id);
                          setActionNote('');
                        }}
                      >
                        Log Quick Call Attempt <ChevronRight size={14} />
                      </button>
                    ) : (
                      <div className="quick-actions-form">
                        <p className="quick-action-subhead">Select Call Attempt Status:</p>
                        <div className="quick-action-options-grid">
                          <button 
                            className="qa-option-btn busy"
                            onClick={() => handleQuickAttempt(order.id, 'Busy')}
                            disabled={loadingId === order.id}
                          >
                            <span>Busy / ব্যস্ত</span>
                          </button>
                          <button 
                            className="qa-option-btn nopick"
                            onClick={() => handleQuickAttempt(order.id, 'Not Picked')}
                            disabled={loadingId === order.id}
                          >
                            <span>No Pick / রিসিভ করেনি</span>
                          </button>
                          <button 
                            className="qa-option-btn hold"
                            onClick={() => handleQuickAttempt(order.id, 'On Hold')}
                            disabled={loadingId === order.id}
                          >
                            <span>On Hold / পরে কল করবে</span>
                          </button>
                        </div>

                        <div className="quick-note-input-wrap">
                          <input 
                            type="text" 
                            className="quick-note-field"
                            placeholder="Add brief note (optional)..."
                            value={actionNote}
                            onChange={e => setActionNote(e.target.value)}
                            disabled={loadingId === order.id}
                          />
                        </div>

                        <div className="quick-action-cancel-row">
                          <button 
                            className="quick-action-back-btn"
                            onClick={() => setQuickActionId(null)}
                            disabled={loadingId === order.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom snoozes */}
          <div className="alert-modal-footer">
            <button className="snooze-action-btn" onClick={handleSnooze}>
              Snooze Alert for 10 Min
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
