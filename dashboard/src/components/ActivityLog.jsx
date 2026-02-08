import React, { useState, useEffect } from 'react';
import { fetchAuditLog } from '../services/api';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      const data = await fetchAuditLog(20);
      setLogs(data);
    } catch {
      // silently fail
    }
  }

  if (logs.length === 0) {
    return (
      <div className="activity-log">
        <h2>Activity Log</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="activity-log">
      <h2>Activity Log</h2>
      {logs.map((log) => (
        <div key={log.id} className="activity-log-entry">
          <span className="activity-log-action">
            {log.action}
            {log.ip_address && (
              <span className="activity-log-ip">{log.ip_address}</span>
            )}
          </span>
          <span className="activity-log-time">
            {new Date(log.created_at + 'Z').toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
