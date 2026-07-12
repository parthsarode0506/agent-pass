import React, { useState } from 'react';

const SORT_DIRS = { asc: 1, desc: -1 };

export default function AuditLogViewer({ logs, stats, onRefresh }) {
  const [sortField, setSortField] = useState('timestamp');
  const [sortDir, setSortDir]     = useState('desc');

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedLogs = [...logs].sort((a, b) => {
    const va = a[sortField] ?? '';
    const vb = b[sortField] ?? '';
    const dir = SORT_DIRS[sortDir];
    return va < vb ? -dir : va > vb ? dir : 0;
  });

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4, color: '#7ee8d8' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  // Filter out registrations from the actual connection block rates
  const connections = logs.filter(l => l.action !== 'register');
  const total = stats.total;
  const allowed = stats.allowed;
  const blocked = stats.blocked;
  const blockRate = total > 0 ? Math.round((blocked / total) * 100) : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 className="chrome-text" style={{ fontSize: 16 }}>📋 Norton Scan Report — Connection Log</h2>
        <button className="y2k-btn y2k-btn-blue" onClick={onRefresh} style={{ padding: '5px 12px' }}>
          🔄 Re-scan Database
        </button>
      </div>

      {/* Tally Summary Box */}
      <div className="y2k-panel" style={{ marginBottom: 16, border: '1.5px solid rgba(255,255,255,0.2)' }}>
        <div className="aim-titlebar" style={{ background: 'linear-gradient(90deg, #f39c12 0%, #d35400 100%)' }}>
          <span style={{ fontWeight: 'bold' }}>📊 Connection Analytics Summary</span>
        </div>
        <div className="norton-scan-tally">
          <div className="norton-tally-item">
            <div className="norton-tally-label">Total Connection Checks</div>
            <div className="norton-tally-num">{total}</div>
          </div>
          <div className="norton-tally-item">
            <div className="norton-tally-label" style={{ color: 'var(--status-granted)' }}>Allowed Access</div>
            <div className="norton-tally-num" style={{ color: 'var(--status-granted)' }}>{allowed}</div>
          </div>
          <div className="norton-tally-item">
            <div className="norton-tally-label" style={{ color: 'var(--status-denied)' }}>Blocked Access</div>
            <div className="norton-tally-num" style={{ color: 'var(--status-denied)' }}>{blocked}</div>
          </div>
          <div className="norton-tally-item">
            <div className="norton-tally-label">Firewall Block Rate</div>
            <div className="norton-tally-num" style={{ color: blockRate > 40 ? 'var(--status-denied)' : '#ffffff' }}>
              {blockRate}%
            </div>
          </div>
        </div>
      </div>

      {/* Main Table logs list */}
      <div className="y2k-panel" style={{ border: '1.5px solid rgba(255,255,255,0.15)' }}>
        <div className="norton-table-wrap">
          {sortedLogs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#adc8e0', fontStyle: 'italic' }}>
              No audit logs captured. Run connection checks to populate report.
            </div>
          ) : (
            <table className="norton-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('timestamp')} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    Timestamp <SortIcon field="timestamp" />
                  </th>
                  <th onClick={() => toggleSort('agent_id')} style={{ cursor: 'pointer' }}>
                    Agent ID <SortIcon field="agent_id" />
                  </th>
                  <th onClick={() => toggleSort('agent_name')} style={{ cursor: 'pointer' }}>
                    Agent Name <SortIcon field="agent_name" />
                  </th>
                  <th onClick={() => toggleSort('action')} style={{ cursor: 'pointer' }}>
                    Action <SortIcon field="action" />
                  </th>
                  <th>ID Check</th>
                  <th>Perm Check</th>
                  <th onClick={() => toggleSort('result')} style={{ cursor: 'pointer' }}>
                    Result <SortIcon field="result" />
                  </th>
                  <th>Security Anomaly Commentary (AI Risk Note)</th>
                </tr>
              </thead>
              <tbody>
                {sortedLogs.map((log) => {
                  const isAllow = log.result === 'granted';
                  return (
                    <tr
                      key={log.id}
                      style={{
                        background: isAllow ? 'rgba(34, 224, 122, 0.08)' : 'rgba(255, 61, 94, 0.08)',
                        transition: 'background 0.3s ease'
                      }}
                    >
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: '#adc8e0' }}>
                        {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', color: '#7ee8d8', fontSize: 11 }}>{log.agent_id}</span>
                      </td>
                      <td style={{ fontWeight: 'bold', color: '#ffffff' }}>
                        {log.agent_name || '—'}
                      </td>
                      <td>
                        <span className="aim-pill-badge" style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {log.identity_check === true  && <span style={{ color: 'var(--status-granted)', fontWeight: 'bold' }}>✓</span>}
                        {log.identity_check === false && <span style={{ color: 'var(--status-denied)', fontWeight: 'bold' }}>✗</span>}
                        {log.identity_check == null   && <span style={{ color: 'var(--status-idle)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {log.permission_check === true  && <span style={{ color: 'var(--status-granted)', fontWeight: 'bold' }}>✓</span>}
                        {log.permission_check === false && <span style={{ color: 'var(--status-denied)', fontWeight: 'bold' }}>✗</span>}
                        {log.permission_check == null   && <span style={{ color: 'var(--status-idle)' }}>—</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span className={`norton-indicator-box ${isAllow ? 'allowed' : 'blocked'}`} />
                          <strong style={{ color: isAllow ? 'var(--status-granted)' : 'var(--status-denied)', fontSize: 11 }}>
                            {isAllow ? 'ALLOWED' : 'BLOCKED'}
                          </strong>
                        </div>
                      </td>
                      <td style={{ fontSize: 11, fontStyle: 'italic', color: '#e0e8f0', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {log.risk_note || log.reason || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}