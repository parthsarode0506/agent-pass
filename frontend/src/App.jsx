import React, { useState, useEffect, useCallback } from 'react';
import './styles.css';
import { app, auth, googleProvider } from './firebase';
import { getFirestore, collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { playStartup, setMuted, getMuted } from './utils/audio.js';
import { api } from './utils/api.js';

// ─── Retro Components ─────────────────────────────────────────────
import AgentRegistry    from './components/AgentRegistry';
import RegisterPage     from './components/RegisterPage';
import SimulatePage     from './components/SimulatePage';
import AuditLogViewer   from './components/AuditLogViewer';

const db = getFirestore(app);

export default function App() {
  const [booting, setBooting]         = useState(true);
  const [user, setUser]               = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError]     = useState('');
  const [muted, setMutedState]        = useState(getMuted());
  const [agents, setAgents]           = useState([]);
  const [logs, setLogs]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [activeView, setActiveView]   = useState('firewall'); // 'firewall' | 'norton' | 'register'
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [detailAgent, setDetailAgent] = useState(null);
  const [auditStats, setAuditStats]   = useState({ allowed: 0, blocked: 0, total: 0 });

  // ── Y2K Boot Sequence ───────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      playStartup();
      setBooting(false);
    }, 2800);
    return () => clearTimeout(timer);
  }, []);

  // ── Firebase Auth Listener ────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google Sign-In error:', err);
      setAuthError(err.message || 'Sign-in failed. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  // ── Fetch agents list (live Firestore) ──────────────────────────
  const fetchAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await api.get('/api/agents');
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('fetchAgents failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Real-time Firestore Audit Log Listener (onSnapshot) ────────
  useEffect(() => {
    const q = query(collection(db, 'audit_log'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        let timestampIso = null;
        if (data.timestamp && typeof data.timestamp.toDate === 'function') {
          timestampIso = data.timestamp.toDate().toISOString();
        } else if (data.timestamp) {
          timestampIso = new Date(data.timestamp).toISOString();
        }
        logsList.push({
          id: doc.id,
          ...data,
          timestamp: timestampIso
        });
      });
      setLogs(logsList);

      // Tally stats: exclude registration-only entries from connection counts
      const connections = logsList.filter(l => l.action !== 'register');
      const allowed = connections.filter(l => l.result === 'granted').length;
      const blocked = connections.filter(l => l.result === 'denied').length;
      setAuditStats({ allowed, blocked, total: allowed + blocked });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleSelectBuddy = (agentId) => {
    setSelectedAgentId(agentId);
    setActiveView('firewall');
  };

  const handleRegistered = () => {
    fetchAgents();
    setActiveView('firewall');
  };

  const toggleMute = () => {
    const nextMute = !muted;
    setMuted(nextMute);
    setMutedState(nextMute);
  };

  // Generate marquee ticker text from live logs
  const getTickerText = () => {
    if (logs.length === 0) return '⭐ Welcoming all AI agents onto the web. Connect securely with AgentID. ⭐';
    return logs.slice(0, 10).map(log => {
      if (log.action === 'register') {
        return `⭐ NEW BUDDY: [${log.agent_id}] registered successfully by owner.`;
      }
      return log.result === 'granted'
        ? `🟢 ALLOWED: [${log.agent_id}] performed ${log.action} ✓`
        : `🔴 BLOCKED: [${log.agent_id}] attempted ${log.action} ✗ (${log.reason})`;
    }).join('  ·  ');
  };

  if (booting) {
    return (
      <div className="y2k-boot-screen">
        <div className="boot-logo-wrap">
          <h1 className="boot-logo chrome-text">AgentID</h1>
          <div style={{ fontStyle: 'italic', color: '#7ee8d8', fontSize: 13, fontWeight: 'bold', letterSpacing: '1px' }}>
            AI's First Day Online
          </div>
          <div className="boot-loader">
            <div className="boot-loader-progress" />
          </div>
          <div style={{ color: '#adc8e0', fontSize: 10, marginTop: 8, textTransform: 'uppercase', letterSpacing: '2px' }}>
            Loading Y2K Firewall Suite...
          </div>
        </div>
      </div>
    );
  }

  // ── Sign-In Gate (shown after boot, before main app) ─────────────
  if (authLoading) {
    return (
      <div className="y2k-signin-screen">
        <div className="signin-card">
          <h1 className="chrome-text" style={{ fontSize: 28 }}>AgentID</h1>
          <div className="signin-subtitle">Authenticating...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="y2k-signin-screen">
        <div className="signin-card">
          <h1 className="chrome-text" style={{ fontSize: 28 }}>AgentID</h1>
          <div className="signin-subtitle">AI's First Day Online</div>
          <div className="signin-description">
            Sign in with your Google account to register and manage AI agents.
            Your identity will be cryptographically linked to every agent you create.
          </div>
          <button className="signin-google-btn" onClick={handleGoogleSignIn}>
            <svg className="google-icon" viewBox="0 0 24 24">
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
          </button>
          {authError && <div className="signin-error">⚠ {authError}</div>}
          <div className="signin-footer">Secure Firebase Authentication</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── Marquee Ticker ── */}
      <div className="y2k-marquee-ticker">
        <div className="marquee-content">{getTickerText()}</div>
      </div>

      <div style={{ padding: '0 20px', flex: 1 }}>
        {/* Header Title area */}
        <div style={{ maxWidth: 1200, margin: '20px auto 10px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 className="chrome-text" style={{ fontSize: 32, marginBottom: 4 }}>AgentID</h1>
            <p style={{ color: '#adc8e0', fontStyle: 'italic', fontSize: 12 }}>
              Cryptographic Identity Infrastructure for the Agentic Web
            </p>
          </div>
          <div className="header-user-area">
            {user && (
              <div className="header-user-info">
                {user.photoURL && <img className="header-user-avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />}
                <span className="header-user-name">{user.displayName || user.email}</span>
              </div>
            )}
            <button className="y2k-btn y2k-btn-blue" onClick={toggleMute} style={{ padding: '6px 12px' }}>
              {muted ? '🔇 Sound: Off' : '🔊 Sound: On'}
            </button>
            <button className="header-signout-btn" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>

        <div className="app-container">
          {/* ── Left: Buddy List Window ── */}
          <AgentRegistry
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectBuddy={handleSelectBuddy}
            onOpenDetails={(agent) => setDetailAgent(agent)}
            onAddBuddy={() => setActiveView('register')}
            onRefresh={fetchAgents}
            onRevoke={fetchAgents}
            loading={loading}
          />

          {/* ── Right: Security Command Center Window ── */}
          <div className="main-display">
            <div className="y2k-tabs">
              <button
                className={`y2k-tab${activeView === 'firewall' ? ' active' : ''}`}
                onClick={() => setActiveView('firewall')}
              >
                🛡️ ZoneAlarm Firewall
              </button>
              <button
                className={`y2k-tab${activeView === 'norton' ? ' active' : ''}`}
                onClick={() => setActiveView('norton')}
              >
                📋 Norton Scan Report ({auditStats.total})
              </button>
              <button
                className={`y2k-tab${activeView === 'register' ? ' active' : ''}`}
                onClick={() => setActiveView('register')}
              >
                ➕ Add Buddy
              </button>
            </div>

            <div className="y2k-panel" style={{ borderTopLeftRadius: 0 }}>
              <div className="y2k-panel-content">
                {activeView === 'firewall' && (
                  <SimulatePage
                    agents={agents}
                    selectedAgentId={selectedAgentId}
                  />
                )}
                {activeView === 'norton' && (
                  <AuditLogViewer
                    logs={logs}
                    stats={auditStats}
                    onRefresh={fetchAgents}
                  />
                )}
                {activeView === 'register' && (
                  <RegisterPage
                    user={user}
                    onRegistered={handleRegistered}
                    onBack={() => setActiveView('firewall')}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>



      {/* ── AIM Buddy Profile Modal ── */}
      {detailAgent && (
        <div className="modal-overlay" onClick={() => setDetailAgent(null)}>
          <div className="y2k-panel buddy-info-dialog" onClick={e => e.stopPropagation()}>
            <div className="y2k-panel-content" style={{ padding: 0 }}>
              <div className="aim-titlebar">
                <span className="aim-logo-area">
                  <span className="aim-logo-man">🏃</span> Buddy Info: {detailAgent.id}
                </span>
                <button className="win-btn-control" onClick={() => setDetailAgent(null)}>X</button>
              </div>

              <div className="y2k-tabs" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <div className="y2k-tab active">Buddy Profile</div>
              </div>

              <div style={{ padding: 16, background: 'rgba(0,0,0,0.3)', borderBottomLeftRadius: 'var(--y2k-panel-radius)', borderBottomRightRadius: 'var(--y2k-panel-radius)' }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 32 }}>🤖</span>
                  <div>
                    <h3 className="chrome-text" style={{ fontSize: 14 }}>{detailAgent.name}</h3>
                    <span style={{ color: '#adc8e0', fontSize: 11 }}>Owner: {detailAgent.owner}</span>
                  </div>
                </div>

                <div className="win-fieldset">
                  <span className="win-legend">Away Message (Purpose)</span>
                  <p style={{ color: '#e0e8f0', fontStyle: 'italic', fontSize: 11 }}>
                    "{detailAgent.purpose || 'No away message set.'}"
                  </p>
                </div>

                <div className="win-fieldset">
                  <span className="win-legend">Granted Permissions</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {(detailAgent.permissions || []).length === 0 ? (
                      <span style={{ color: '#808080', fontStyle: 'italic' }}>No permissions.</span>
                    ) : (
                      detailAgent.permissions.map(p => (
                        <span key={p} className="aim-pill-badge">{p}</span>
                      ))
                    )}
                  </div>
                </div>

                <div className="win-fieldset" style={{ marginBottom: 0 }}>
                  <span className="win-legend">Credential State</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div className={`aim-status-orb ${detailAgent.credential_active ? 'online' : 'offline'}`} />
                    <span style={{ fontSize: 11, fontWeight: 'bold', color: detailAgent.credential_active ? 'var(--status-granted)' : 'var(--status-denied)' }}>
                      {detailAgent.credential_active ? 'VERIFIED' : 'REVOKED'}
                    </span>
                  </div>
                </div>

                {/* 88x31 embeddable webring badge */}
                <div className="webring-badge-container">
                  <div className="badge-image-88x31">
                    VERIFIED<br/>AGENTID
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, fontWeight: 'bold', color: '#adc8e0', marginBottom: 2 }}>Embed Buddy Badge:</div>
                    <input
                      className="badge-snippet-input"
                      readOnly
                      onClick={e => e.target.select()}
                      value={`<a href="http://localhost:5173"><img src="http://localhost:5173/badge.gif" width="88" height="31" alt="Verified by AgentID" border="0"></a>`}
                    />
                  </div>
                </div>

                <div style={{ textAlign: 'right', marginTop: 14 }}>
                  <button className="y2k-btn y2k-btn-purple" onClick={() => setDetailAgent(null)}>Close Info</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}