import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Database,
  RefreshCw,
  ShieldAlert,
  ShieldCheck
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './FraudControl.css';

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6_PATTERN = /^(([0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}|::1|::)$/i;

const isValidIpAddress = (value = '') => {
  const normalized = String(value || '').trim();
  return IPV4_PATTERN.test(normalized) || IPV6_PATTERN.test(normalized);
};

const formatDateTime = (value) => {
  if (!value) return 'Never';
  try {
    return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return 'Invalid date';
  }
};

export const FraudControl = () => {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingIp, setSavingIp] = useState('');
  const [blocklistConfigured, setBlocklistConfigured] = useState(true);
  const [blocks, setBlocks] = useState([]);
  const [ipRows, setIpRows] = useState([]);
  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeBlocks = useMemo(
    () => blocks.filter((block) => block.is_active !== false),
    [blocks]
  );

  const activeBlockMap = useMemo(
    () => new Map(activeBlocks.map((block) => [api.normalizeIpAddress(block.ip_address), block])),
    [activeBlocks]
  );

  const repeatedIpCount = useMemo(
    () => ipRows.filter((row) => row.total_orders > 1).length,
    [ipRows]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const [blocklistResult, intelligence] = await Promise.all([
        api.getIpBlocklist(),
        api.getOrderIpIntelligence(1000)
      ]);

      setBlocklistConfigured(blocklistResult.configured);
      setBlocks(blocklistResult.blocks || []);
      setIpRows(intelligence || []);
    } catch (err) {
      console.error('Failed to load fraud controls:', err);
      setError(err?.message || 'Failed to load fraud controls.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const blockIp = async (targetIp, targetReason = reason) => {
    const normalizedIp = api.normalizeIpAddress(targetIp);
    setError('');
    setMessage('');

    if (!blocklistConfigured) {
      setError('IP blocklist database guard is not installed yet.');
      return;
    }

    if (!isValidIpAddress(normalizedIp)) {
      setError('Enter a valid IPv4 or IPv6 address.');
      return;
    }

    setSavingIp(normalizedIp);
    try {
      await api.blockIpAddress(
        normalizedIp,
        targetReason,
        user?.id,
        profile?.name || user?.email || 'Admin'
      );
      setIpAddress('');
      setReason('');
      await loadData();
      setMessage(`${normalizedIp} is now blocked.`);
    } catch (err) {
      console.error('Failed to block IP:', err);
      setError(err?.message || 'Failed to block IP address.');
    } finally {
      setSavingIp('');
    }
  };

  const unblockIp = async (targetIp) => {
    const normalizedIp = api.normalizeIpAddress(targetIp);
    setError('');
    setMessage('');
    setSavingIp(normalizedIp);

    try {
      await api.unblockIpAddress(normalizedIp);
      await loadData();
      setMessage(`${normalizedIp} is unblocked.`);
    } catch (err) {
      console.error('Failed to unblock IP:', err);
      setError(err?.message || 'Failed to unblock IP address.');
    } finally {
      setSavingIp('');
    }
  };

  return (
    <div className="fraud-page">
      <header className="fraud-header">
        <div>
          <span className="fraud-kicker">Security Operations</span>
          <h1>Fraud Control</h1>
          <p>IP firewall for abusive landing-page order submissions.</p>
        </div>
        <button className="fraud-refresh-btn" onClick={loadData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          Refresh
        </button>
      </header>

      <section className="fraud-stats-grid">
        <div className="fraud-stat-card">
          <ShieldAlert size={20} />
          <span>Active Blocks</span>
          <strong>{activeBlocks.length}</strong>
        </div>
        <div className="fraud-stat-card">
          <Database size={20} />
          <span>Observed IPs</span>
          <strong>{ipRows.length}</strong>
        </div>
        <div className="fraud-stat-card">
          <AlertTriangle size={20} />
          <span>Repeat IPs</span>
          <strong>{repeatedIpCount}</strong>
        </div>
        <div className={`fraud-stat-card ${blocklistConfigured ? 'healthy' : 'warning'}`}>
          {blocklistConfigured ? <ShieldCheck size={20} /> : <Ban size={20} />}
          <span>DB Guard</span>
          <strong>{blocklistConfigured ? 'Ready' : 'Setup Required'}</strong>
        </div>
      </section>

      {!blocklistConfigured && (
        <div className="fraud-alert warning">
          <Ban size={18} />
          <div>
            <strong>Database blocklist is not installed.</strong>
            <span>Run <code>supabase_migration_ip_blocklist.sql</code> in Supabase SQL Editor to activate lifetime IP blocking.</span>
          </div>
        </div>
      )}

      {message && (
        <div className="fraud-alert success">
          <CheckCircle2 size={18} />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="fraud-alert error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="fraud-main-grid">
        <div className="fraud-panel">
          <div className="fraud-panel-header">
            <div>
              <h2>Block IP Address</h2>
              <p>Blocks future orders with the same captured IP.</p>
            </div>
            <Ban size={18} />
          </div>

          <form
            className="fraud-form"
            onSubmit={(event) => {
              event.preventDefault();
              blockIp(ipAddress);
            }}
          >
            <label>
              <span>IP Address</span>
              <input
                value={ipAddress}
                onChange={(event) => setIpAddress(event.target.value)}
                placeholder="103.124.237.249"
                disabled={!blocklistConfigured}
              />
            </label>

            <label>
              <span>Reason</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Spam orders, fake customer info, repeated abuse"
                rows={4}
                disabled={!blocklistConfigured}
              />
            </label>

            <button
              type="submit"
              className="fraud-primary-btn"
              disabled={!blocklistConfigured || savingIp === api.normalizeIpAddress(ipAddress)}
            >
              <Ban size={16} />
              Block Lifetime
            </button>
          </form>
        </div>

        <div className="fraud-panel">
          <div className="fraud-panel-header">
            <div>
              <h2>Blocked IPs</h2>
              <p>Active blocks currently enforced by the database guard.</p>
            </div>
            <ShieldCheck size={18} />
          </div>

          <div className="blocked-list">
            {activeBlocks.length === 0 ? (
              <div className="fraud-empty">No active IP blocks.</div>
            ) : (
              activeBlocks.map((block) => (
                <div className="blocked-item" key={block.ip_address}>
                  <div>
                    <strong>{block.ip_address}</strong>
                    <span>{block.reason || 'No reason added'}</span>
                    <small>
                      <Clock size={12} />
                      {formatDateTime(block.created_at)}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => unblockIp(block.ip_address)}
                    disabled={savingIp === api.normalizeIpAddress(block.ip_address)}
                  >
                    Unblock
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="fraud-panel full">
        <div className="fraud-panel-header">
          <div>
            <h2>Recent Order IP Intelligence</h2>
            <p>Aggregated from the latest order records with captured IP addresses.</p>
          </div>
          <ShieldAlert size={18} />
        </div>

        <div className="fraud-table-wrap">
          <table className="fraud-table">
            <thead>
              <tr>
                <th>IP Address</th>
                <th>Orders</th>
                <th>Latest Order</th>
                <th>Status Mix</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ipRows.map((row) => {
                const isBlocked = activeBlockMap.has(row.ip_address);
                return (
                  <tr key={row.ip_address} className={isBlocked ? 'blocked' : ''}>
                    <td>
                      <code>{row.ip_address}</code>
                      {isBlocked && <span className="blocked-pill">Blocked</span>}
                    </td>
                    <td>{row.total_orders}</td>
                    <td>
                      <strong>{row.latest_order?.id || 'N/A'}</strong>
                      <span className="latest-customer-name">{row.latest_order?.customer_name || 'Unknown customer'}</span>
                      <span className="latest-customer-phone">{row.latest_order?.phone || 'No phone'} - {formatDateTime(row.latest_order_at)}</span>
                    </td>
                    <td>
                      {Object.entries(row.statuses || {}).map(([status, count]) => (
                        <span className="status-chip" key={status}>{status}: {count}</span>
                      ))}
                    </td>
                    <td>
                      {isBlocked ? (
                        <button
                          type="button"
                          className="table-action secondary"
                          onClick={() => unblockIp(row.ip_address)}
                          disabled={savingIp === row.ip_address}
                        >
                          Unblock
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="table-action danger"
                          onClick={() => blockIp(row.ip_address, `Blocked from order intelligence. Latest order: ${row.latest_order?.id || 'N/A'}`)}
                          disabled={!blocklistConfigured || savingIp === row.ip_address}
                        >
                          Block
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {!loading && ipRows.length === 0 && (
                <tr>
                  <td colSpan="5" className="fraud-empty table-empty">No captured IP addresses found.</td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan="5" className="fraud-empty table-empty">Loading fraud intelligence...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
