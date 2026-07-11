import React, { useState, useEffect } from 'react';

function AuditLogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/audit-log');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setLogs(data);
    } catch (err) {
      setError(err.message);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Sorting function
  const sortedLogs = React.useMemo(() => {
    const sorted = [...logs];
    sorted.sort((a, b) => {
      if (sortConfig.key === 'timestamp') {
        return new Date(a[sortConfig.key]) - new Date(b[sortConfig.key]);
      }
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [logs, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getResultColor = (result) => {
    // Assuming result is a string like "granted", "denied", "success", "failure", or boolean
    const strResult = String(result).toLowerCase();
    if (strResult.includes('grant') || strResult.includes('success') || strResult === 'true') {
      return '#008000'; // green
    }
    return '#FF0000'; // red
  };

  return (
    <div className="audit-log-viewer">
      <div className="toolbar">
        <button onClick={fetchLogs} className="refresh-button">
          Refresh
        </button>
      </div>
      {error && <div className="error-message">Error: {error}</div>}
      <div className="audit-table-container">
        <table className="audit-table">
          <thead>
            <tr>
              <th onClick={() => requestSort('timestamp')}>
                Timestamp
                {sortConfig.key === 'timestamp' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th onClick={() => requestSort('agent')}>
                Agent
                {sortConfig.key === 'agent' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th onClick={() => requestSort('action')}>
                Action
                {sortConfig.key === 'action' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th onClick={() => requestSort('result')}>
                Result
                {sortConfig.key === 'result' ? (sortConfig.direction === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty-state">
                  No audit logs available
                </td>
              </tr>
            ) : (
              sortedLogs.map((log, index) => (
                <tr key={index}>
                  <td>{new Date(log.timestamp).toLocaleString()}</td>
                  <td>{log.agent || 'Unknown'}</td>
                  <td>{log.action || 'N/A'}</td>
                  <td>
                    <span
                      className="result-indicator"
                      style={{ backgroundColor: getResultColor(log.result) }}
                    ></span>
                    <span className="result-text">{log.result}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AuditLogViewer;