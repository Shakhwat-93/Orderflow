import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import {
  User,
  ShieldCheck,
  Shield,
  PhoneCall,
  X,
  Loader2,
  Mail,
  Phone,
  Calendar,
  Activity,
  CheckCircle2,
  Clock3,
  Target,
  Gauge,
  Timer,
  AlertCircle
} from 'lucide-react';
import './ActiveUsers.css';

export const ActiveUsers = () => {
  const { onlineUsers, isAdmin } = useAuth();
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [range, setRange] = useState('7d');
  const [details, setDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const dateRanges = [
    { label: 'Today', value: 'today' },
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: 'All Time', value: 'all' }
  ];

  const getLastActiveText = (isOnline, onlineAt) => {
    if (isOnline) return 'Active Now';
    if (!onlineAt) return 'Active some time ago';
    const diffMs = Date.now() - new Date(onlineAt).getTime();
    if (diffMs < 2 * 60 * 1000) return 'Active 1 min ago';
    const mins = Math.floor(diffMs / (60 * 1000));
    if (mins < 60) return `Active ${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Active ${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    return `Active ${days} day ago`;
  };

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*');

        if (error) throw error;
        const normalized = (data || []).map((u) => ({
          id: u.id,
          name: u.name || u.full_name || null,
          full_name: u.full_name || null,
          email: u.email || null,
          avatar_url: u.avatar_url || null,
          created_at: u.created_at || null,
          updated_at: u.updated_at || null,
          last_active_at: u.last_active_at || null,
          status: u.status,
          is_active: u.is_active
        }));
        setAllUsers(normalized);
      } catch (error) {
        console.error('Failed loading users for presence:', error);
        setAllUsers([]);
      }
    };

    loadUsers();
  }, []);

  useEffect(() => {
    if (!onlineUsers?.length) return;
    const raw = localStorage.getItem('presence_last_seen_map');
    const map = raw ? JSON.parse(raw) : {};
    onlineUsers.forEach((u) => {
      map[u.id] = u.online_at || new Date().toISOString();
    });
    localStorage.setItem('presence_last_seen_map', JSON.stringify(map));
  }, [onlineUsers]);

  useEffect(() => {
    const loadDetails = async () => {
      if (!selectedUser?.id || !isAdmin) return;
      setLoadingDetails(true);
      setDetailsError('');

      try {
        const data = await api.getUserPerformanceDetails(selectedUser.id, { range, limit: 20 });
        setDetails(data);
      } catch (error) {
        console.error('Error loading user details:', error);
        setDetailsError(error?.message || 'Failed to load user performance details.');
        setDetails(null);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadDetails();
  }, [selectedUser, range, isAdmin]);

  const mergedUsers = useMemo(() => {
    const onlineMap = new Map((onlineUsers || []).map((u) => [u.id, u]));
    const raw = localStorage.getItem('presence_last_seen_map');
    const lastSeenMap = raw ? JSON.parse(raw) : {};

    const merged = (allUsers || []).map((u) => {
      const online = onlineMap.get(u.id);
      if (online) {
        return {
          ...u,
          ...online,
          isOnline: true,
          lastActiveAt: online.online_at || new Date().toISOString()
        };
      }

      return {
        ...u,
        roles: u.roles || [],
        isOnline: false,
        lastActiveAt: u.last_active_at || lastSeenMap[u.id] || u.updated_at || u.created_at || null
      };
    });

    // Include any online user not found in users table fetch
    onlineUsers.forEach((u) => {
      if (!merged.some((x) => x.id === u.id)) {
        merged.push({
          ...u,
          isOnline: true,
          lastActiveAt: u.online_at || new Date().toISOString()
        });
      }
    });

    return merged.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
    });
  }, [allUsers, onlineUsers]);

  const getRoleIcon = (roles = []) => {
    if (roles.includes('Admin')) return <ShieldCheck size={12} className="text-rose-500" />;
    if (roles.includes('Moderator')) return <Shield size={12} className="text-amber-500" />;
    if (roles.includes('Call Team')) return <PhoneCall size={12} className="text-sky-500" />;
    return <User size={12} className="text-slate-400" />;
  };

  const getRoleColor = (roles = []) => {
    if (roles.includes('Admin')) return 'role-admin';
    if (roles.includes('Moderator')) return 'role-moderator';
    if (roles.includes('Call Team')) return 'role-call';
    return 'role-user';
  };

  const getDisplayName = (user) => user?.name || user?.full_name || user?.email || 'Unknown User';

  const getDisplayStatus = (user) => {
    if (user?.isOnline) return 'Active Now';
    if (user?.status) return user.status;
    if (typeof user?.is_active === 'boolean') return user.is_active ? 'Active' : 'Inactive';
    return 'Unknown';
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString();
  };

  const formatHours = (value) => {
    if (value == null || Number.isNaN(Number(value))) return 'N/A';
    if (Number(value) < 1) return `${Math.round(Number(value) * 60)} min`;
    return `${Number(value).toFixed(2)} hrs`;
  };

  const openUserDetails = (user) => {
    if (!isAdmin) return;
    setSelectedUser(user);
    setDetails(null);
  };

  const closeDetails = () => {
    setSelectedUser(null);
    setDetails(null);
    setDetailsError('');
    setRange('7d');
  };

  const performance = details?.performance;
  const detailUser = details?.user || selectedUser;
  const detailRoles = details?.roles || detailUser?.roles || [];

  return (
    <>
      <div className="active-users-card">
        <div className="card-header-presence">
          <h3>Team Presence</h3>
          <span className="user-count">{mergedUsers.filter(u => u.isOnline).length}</span>
        </div>

        <div className="users-list-horizontal">
          {mergedUsers.map((u) => (
            <button
              key={u.id}
              className={`user-presence-item ${selectedUser?.id === u.id ? 'selected' : ''}`}
              title={`${getDisplayName(u)} (${u.roles?.join(', ') || 'User'}) • ${getLastActiveText(u.isOnline, u.lastActiveAt)}`}
              onClick={() => openUserDetails(u)}
              disabled={!isAdmin}
              type="button"
            >
              <div className={`avatar-wrapper ${getRoleColor(u.roles)}`}>
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={getDisplayName(u)} className="presence-avatar" />
                ) : (
                  <span className="avatar-initial">{getDisplayName(u)?.charAt(0).toUpperCase()}</span>
                )}
                <div className={`online-indicator ${u.isOnline ? '' : 'offline'}`}></div>
                <div className="role-tag">
                  {getRoleIcon(u.roles)}
                </div>
              </div>
              <span className="presence-last-active">{getLastActiveText(u.isOnline, u.lastActiveAt)}</span>
            </button>
          ))}
          {mergedUsers.length === 0 && (
            <p className="no-users">No users available</p>
          )}
        </div>
        {!isAdmin && (
          <p className="presence-admin-hint">User performance details are visible to Admin only.</p>
        )}
      </div>

      {isAdmin && selectedUser && (
        <div className="user-details-overlay" onClick={closeDetails}>
          <div className="user-details-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="user-details-header">
              <div className="user-details-identity">
                <div className="user-details-avatar-wrap">
                  {detailUser?.avatar_url ? (
                    <img className="user-details-avatar" src={detailUser.avatar_url} alt={getDisplayName(detailUser)} />
                  ) : (
                    <span className="user-details-avatar-fallback">{getDisplayName(detailUser).charAt(0).toUpperCase()}</span>
                  )}
                  <span className={`user-details-online-dot ${selectedUser?.isOnline ? '' : 'offline'}`}></span>
                </div>
                <div>
                  <h4>{getDisplayName(detailUser)}</h4>
                  <p>{detailRoles?.join(', ') || 'No role assigned'}</p>
                </div>
              </div>
              <button type="button" className="user-details-close" onClick={closeDetails} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="user-details-range-row">
              {dateRanges.map((r) => (
                <button
                  type="button"
                  key={r.value}
                  className={`range-chip ${range === r.value ? 'active' : ''}`}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {loadingDetails && (
              <div className="user-details-state loading">
                <Loader2 size={18} className="spin" />
                <span>Loading user details...</span>
              </div>
            )}

            {!loadingDetails && detailsError && (
              <div className="user-details-state error">
                <AlertCircle size={18} />
                <span>{detailsError}</span>
              </div>
            )}

            {!loadingDetails && !detailsError && (
              <>
                <div className="user-profile-grid">
                  <div className="profile-item"><Mail size={14} /><span>{detailUser?.email || 'No email available'}</span></div>
                  <div className="profile-item"><Phone size={14} /><span>{detailUser?.phone || 'No phone available'}</span></div>
                  <div className="profile-item"><Activity size={14} /><span>{getDisplayStatus({ ...detailUser, isOnline: selectedUser?.isOnline })}</span></div>
                  <div className="profile-item"><Calendar size={14} /><span>Joined: {formatDate(detailUser?.created_at)}</span></div>
                  <div className="profile-item"><Clock3 size={14} /><span>{getLastActiveText(!!selectedUser?.isOnline, selectedUser?.lastActiveAt || detailUser?.last_active_at)}</span></div>
                </div>

                <div className="user-kpi-grid">
                  <div className="kpi-card"><Target size={14} /><span>Total Assigned</span><strong>{performance?.totalAssignedWork ?? 0}</strong></div>
                  <div className="kpi-card"><CheckCircle2 size={14} /><span>Completed</span><strong>{performance?.completedWork ?? 0}</strong></div>
                  <div className="kpi-card"><Clock3 size={14} /><span>Pending</span><strong>{performance?.pendingWork ?? 0}</strong></div>
                  <div className="kpi-card"><Gauge size={14} /><span>Completion Rate</span><strong>{(performance?.completionRate ?? 0).toFixed(1)}%</strong></div>
                  <div className="kpi-card"><Timer size={14} /><span>Avg Completion Time</span><strong>{formatHours(performance?.avgCompletionTimeHours)}</strong></div>
                  <div className="kpi-card"><Activity size={14} /><span>Productivity Score</span><strong>{performance?.productivityScore ?? 0}/100</strong></div>
                </div>

                <div className="action-breakdown-wrap">
                  <h5>Action Breakdown</h5>
                  {performance?.actionBreakdown && Object.keys(performance.actionBreakdown).length > 0 ? (
                    <div className="action-breakdown-list">
                      {Object.entries(performance.actionBreakdown).map(([type, count]) => (
                        <span key={type} className="action-pill">{type}: {count}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-inline">No actions in this range.</p>
                  )}
                </div>

                <div className="recent-activity-wrap">
                  <h5>Recent Activity</h5>
                  {details?.recentActivity?.length ? (
                    <div className="recent-activity-list">
                      {details.recentActivity.map((log) => (
                        <div key={log.id} className="recent-activity-item">
                          <div className="recent-activity-top">
                            <strong>{log.action_type || 'ACTION'}</strong>
                            <span>{formatDate(log.timestamp)}</span>
                          </div>
                          <p>{log.action_description || `Action on order ${log.order_id || 'N/A'}`}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="user-details-state empty">
                      <span>No recent activity found for this range.</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};
