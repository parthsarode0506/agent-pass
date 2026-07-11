import React, { useState } from 'react';
import { apiUrl } from '../utils/api.js';

export default function AgentRegistry({
  agents, selectedAgentId, onSelectBuddy, onOpenDetails,
  onAddBuddy, onRefresh, onRevoke, loading
}) {
  const [revoking, setRevoking] = useState(null);
  const [search, setSearch] = useState('');

  const activeAgents  = agents.filter(a => a.status === 'active');
  const revokedAgents = agents.filter(a => a.status === 'revoked');

  const filtered = (list) => {
    if (!search) return list;
    return list.filter(a =>
      a.name?.toLowerCase().includes(search.toLowerCase()) ||
      a.id?.toLowerCase().includes(search.toLowerCase())
    );
  };

  const handleRevoke = async (agent, e) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to remove and permanently revoke buddy "${agent.name}"?`)) return;
    setRevoking(agent.id);
    try {
      await fetch(apiUrl(`/api/agents/${agent.id}/revoke`), { method: 'POST' });
      onRevoke();
    } catch (err) {
      console.error('Revoke failed', err);
    } finally {
      setRevoking(null);
    }
  };

  const BuddyItem = ({ agent }) => {
    const isSelected = selectedAgentId === agent.id;
    const isOnline = agent.status === 'active';
    return (
      <div
        className={`aim-buddy-item${isSelected ? ' active-buddy' : ''}`}
        onClick={() => onSelectBuddy(agent.id)}
        onDoubleClick={() => onOpenDetails(agent)}
        title="Double-click to view Buddy Info profile"
      >
        <div className={`aim-status-orb ${isOnline ? 'online' : 'offline'}`} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="aim-buddy-name">{agent.name}</div>
          <div className="aim-buddy-away-msg" title={agent.purpose || 'No away message.'}>
            {agent.purpose || 'No away message.'}
          </div>
          <div style={{ marginTop: 3 }}>
            {(agent.permissions || []).map(p => {
              const getPermClass = (perm) => {
                if (perm.includes('read') || perm.includes('browse')) return 'read';
                if (perm.includes('make') || perm.includes('buy')) return 'payment';
                if (perm.includes('write')) return 'write';
                return '';
              };
              return (
                <span key={p} className={`aim-pill-badge ${getPermClass(p)}`}>
                  {p}
                </span>
              );
            })}
          </div>
        </div>
        {isOnline && (
          <button
            style={{
              background: 'rgba(255, 61, 94, 0.1)',
              border: '1px solid rgba(255, 61, 94, 0.3)',
              borderRadius: '50%',
              width: 18,
              height: 18,
              fontSize: 8,
              color: 'var(--status-denied)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
            onClick={(e) => handleRevoke(agent, e)}
            disabled={revoking === agent.id}
            title="Remove Buddy (Revoke)"
          >
            {revoking === agent.id ? '..' : '✕'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="y2k-panel aim-buddy-window" style={{ display: 'flex', flexDirection: 'column', height: 600 }}>
      {/* Title bar */}
      <div className="aim-titlebar">
        <span className="aim-logo-area">
          <span className="aim-logo-man">🏃</span>
          <span className="chrome-text" style={{ fontSize: 13 }}>Buddy List</span>
        </span>
        <button className="win-btn-control" style={{ background: '#CC0000', color: '#fff', borderRadius: '50%' }}>✕</button>
      </div>

      {/* Search */}
      <div className="aim-search">
        <input
          className="aim-search-input"
          placeholder="🔍 Find a Buddy..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List content */}
      <div className="aim-buddy-list" style={{ flex: 1 }}>
        <div className="aim-group-header">
          Online Buddies ({activeAgents.length}/{agents.length})
        </div>
        {filtered(activeAgents).length === 0 ? (
          <div style={{ color: '#adc8e0', fontStyle: 'italic', padding: '6px 12px', fontSize: 10 }}>
            No active buddies found.
          </div>
        ) : (
          filtered(activeAgents).map(agent => <BuddyItem key={agent.id} agent={agent} />)
        )}

        {revokedAgents.length > 0 && (
          <>
            <div className="aim-group-header" style={{ marginTop: 12 }}>
              Offline / Revoked ({revokedAgents.length})
            </div>
            {filtered(revokedAgents).map(agent => (
              <div
                key={agent.id}
                className="aim-buddy-item"
                style={{ opacity: 0.5 }}
                onDoubleClick={() => onOpenDetails(agent)}
              >
                <div className="aim-status-orb offline" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="aim-buddy-name" style={{ textDecoration: 'line-through' }}>
                    {agent.name}
                  </div>
                  <div className="aim-buddy-away-msg">Credentials Revoked</div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer controls */}
      <div className="aim-footer">
        <button className="y2k-btn y2k-btn-blue aim-footer-btn" onClick={onAddBuddy} style={{ padding: '6px' }}>
          🤖 + Add Buddy
        </button>
        <button className="y2k-btn y2k-btn-purple aim-footer-btn" onClick={onRefresh} disabled={loading} style={{ padding: '6px' }}>
          {loading ? '⏳' : '↻'} Refresh
        </button>
      </div>
    </div>
  );
}