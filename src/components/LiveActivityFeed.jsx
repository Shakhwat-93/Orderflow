import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import {
  PlusCircle,
  RefreshCw,
  Trash2,
  User,
  CheckCircle2,
  XSquare,
  Package,
  ArrowRightCircle
} from 'lucide-react';
import './LiveActivityFeed.css';

const formatRelativeTime = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - new Date(date)) / 1000);

  if (diffInSeconds < 60) return 'just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return new Date(date).toLocaleDateString();
};

export const LiveActivityFeed = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const getClearedAt = () => {
      const raw = localStorage.getItem('activity_cleared_at');
      return raw ? new Date(raw) : null;
    };

    const applyClearedFilter = (items = []) => {
      const clearedAt = getClearedAt();
      if (!clearedAt) return items;
      return items.filter(item => {
        const ts = item?.timestamp ? new Date(item.timestamp) : null;
        return ts && ts > clearedAt;
      });
    };

    const loadActivity = async () => {
      try {
        const data = await api.getRecentActivity(15);
        setActivities(applyClearedFilter(data));
      } catch (err) {
        console.error('Failed to load initial activity:', err);
      } finally {
        setLoading(false);
      }
    };

    loadActivity();

    // Subscribe to real-time changes (INSERT/DELETE/UPDATE)
    const subscription = supabase
      .channel('live-activity')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'order_activity_logs'
      }, (payload) => {
        setActivities(prev => applyClearedFilter([payload.new, ...prev]).slice(0, 15));
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'order_activity_logs'
      }, (payload) => {
        setActivities(prev => prev.filter(item => item.id !== payload.old?.id));
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'order_activity_logs'
      }, () => {
        // Keep feed consistent when bulk operations happen
        loadActivity();
      })
      .subscribe();

    const onStorage = (event) => {
      if (event.key === 'activity_cleared_at') {
        loadActivity();
      }
    };

    window.addEventListener('storage', onStorage);

    return () => {
      supabase.removeChannel(subscription);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const getActionIcon = (type) => {
    switch (type) {
      case 'CREATE': return <PlusCircle size={16} className="text-emerald-500" />;
      case 'UPDATE': return <RefreshCw size={16} className="text-sky-500" />;
      case 'STATUS_CHANGE': return <ArrowRightCircle size={16} className="text-amber-500" />;
      case 'DELETE': return <Trash2 size={16} className="text-rose-500" />;
      default: return <Package size={16} className="text-slate-400" />;
    }
  };

  const getStatusIndicator = (status) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 size={14} className="text-emerald-500" />;
      case 'Cancelled': return <XSquare size={14} className="text-rose-500" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="activity-feed-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="live-activity-feed">
      <div className="feed-header">
        <h3>Live Activity</h3>
        <span className="live-badge">Live</span>
      </div>
      <div className="activity-list">
        {activities.map((activity, idx) => (
          <div key={activity.id || idx} className="activity-item" style={{ animationDelay: `${idx * 50}ms` }}>
            <div className="activity-marker">
              <div className="marker-dot"></div>
              {idx < activities.length - 1 && <div className="marker-line"></div>}
            </div>

            <div className="activity-content">
              <div className="activity-main">
                <div className="action-type">
                  {getActionIcon(activity.action_type)}
                </div>
                <div className="activity-details">
                  <p className="activity-desc">
                    {activity.action_description ? (
                      activity.action_description
                    ) : (
                      <><strong>{activity.changed_by_user_name || 'System'}</strong> performed an action</>
                    )}
                  </p>
                  {activity.order_id && (
                    <span className="activity-ref">Order: {activity.order_id}</span>
                  )}
                </div>
              </div>

              <div className="activity-meta">
                <span className="activity-time">
                  {formatRelativeTime(activity.timestamp)}
                </span>
                {activity.new_status && (
                  <div className="status-chip">
                    {getStatusIndicator(activity.new_status)}
                    <span>{activity.new_status}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {activities.length === 0 && (
          <div className="empty-feed">
            <Package size={32} />
            <p>No recent activity logs.</p>
          </div>
        )}
      </div>
    </div>
  );
};
