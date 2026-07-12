import React, { useState, useEffect } from 'react';
import { playAlert, playChime, playBuzz, playSiren } from '../utils/audio.js';
import { api } from '../utils/api.js';

const PRESET_ACTIONS = [
  'web:browse', 'booking:buy', 'calendar:write', 'email:read',
  'payments:make', 'data:read', 'files:write',
];

const delay = (ms) => new Promise(r => setTimeout(r, ms));

function FirewallAlertPopup({ agentId, agentName, action, isQuickDemo, onClose, onAuditUpdate }) {
  const [identityStatus, setIdentityStatus]     = useState('idle'); // idle | checking | pass | fail
  const [permissionStatus, setPermissionStatus] = useState('idle'); // idle | checking | pass | fail | skipped
  const [finalVerdict, setFinalVerdict]         = useState(null);   // null | 'allow' | 'block'
  const [riskNote, setRiskNote]                 = useState('');
  const [reason, setReason]                     = useState('');
  const [running, setRunning]                   = useState(false);
  const [shouldShake, setShouldShake]           = useState(false);
  const isFakeAgent = agentId.includes('FAKE') || agentId.includes('Fake');

  const identityLabel = {
    idle:     'Identity Check...',
    checking: 'Checking identity...',
    pass:     'Identity: VERIFIED',
    fail:     'Identity: UNKNOWN — connection refused',
  };

  useEffect(() => {
    let cancelled = false;

    const runVerification = async () => {
      setRunning(true);
      playAlert();
      await delay(700);

      if (!cancelled) setIdentityStatus('checking');
      
      let data;
      try {
        const res = await api.post(`/api/agents/${agentId}/attempt-action`, { action });
        data = await res.json();
      } catch {
        if (!cancelled) {
          setIdentityStatus('fail');
          setPermissionStatus('skipped');
          setFinalVerdict('block');
          setReason('Connection error — security server offline.');
          setShouldShake(true);
          playBuzz();
          setRunning(false);
        }
        return;
      }

      await delay(800);
      if (cancelled) return;

      const identPassed = data.identity_check === true;
      setIdentityStatus(identPassed ? 'pass' : 'fail');

      await delay(800);
      if (cancelled) return;

      if (!identPassed) {
        setPermissionStatus('skipped');
        await delay(500);
        if (!cancelled) {
          setFinalVerdict('block');
          setReason(data.reason || data.identity_reason || 'Agent ID not found in database.');
          setRiskNote(data.risk_note || 'Intruder signature detected. Handshake blocked.');
          setShouldShake(true);
          playBuzz();
        }
      } else {
        setPermissionStatus('checking');
        await delay(800);
        if (cancelled) return;
        const permPassed = data.permission_check === true;
        setPermissionStatus(permPassed ? 'pass' : 'fail');
        await delay(600);
        if (!cancelled) {
          setFinalVerdict(permPassed ? 'allow' : 'block');
          setReason(data.reason || data.permission_reason || '');
          setRiskNote(data.risk_note || '');
          if (permPassed) {
            playChime();
          } else {
            setShouldShake(true);
            playBuzz();
          }
        }
      }

      if (!cancelled) {
        setRunning(false);
        if (onAuditUpdate) onAuditUpdate();
      }
    };

    runVerification();
    return () => { cancelled = true; };
  }, [agentId, action]);

  const StatusBadge = ({ status, passLabel, failLabel, skipLabel }) => {
    if (status === 'idle')     return <span style={{ color:'var(--status-idle)' }}>● pending</span>;
    if (status === 'checking') return <span className="firewall-step-status checking">▶ scanning...</span>;
    if (status === 'pass')     return <span className="firewall-step-status pass">✓ {passLabel}</span>;
    if (status === 'fail')     return <span className="firewall-step-status fail">✗ {failLabel}</span>;
    if (status === 'skipped')  return <span className="firewall-step-status skipped">— {skipLabel} —</span>;
    return null;
  };

  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,4,15,0.75)', display:'flex',
      alignItems:'center', justifyContent:'center', zIndex:99999, backdropFilter:'blur(4px)'
    }}>
      <div className={`y2k-panel firewall-alert-dialog ${shouldShake ? 'shake-popup' : ''}`}>
        <div className="y2k-panel-content" style={{ padding: 0 }}>
          {/* Header */}
          <div className="firewall-alert-bar">
            <span style={{ fontFamily:'var(--font-chrome)', fontWeight:'bold', fontSize:13 }}>
              🛡️ AgentID Firewall Alert
            </span>
            <button className="win-btn-control" style={{ borderRadius:'50%' }} onClick={onClose} disabled={running}>✕</button>
          </div>

          <div className="firewall-alert-body">
            {/* Header info */}
            <div className="firewall-alert-header">
              <span className="firewall-alert-shield">
                {finalVerdict === 'allow' ? '🟢' : finalVerdict === 'block' ? '🔴' : '⚠️'}
              </span>
              <div>
                <div className="firewall-alert-title">
                  {isFakeAgent ? 'INTRUDER CONNECTION BLOCKED' : 'Access Authorization Request'}
                </div>
                <div className="firewall-alert-description">
                  Agent ID: <strong style={{ fontFamily:'var(--font-mono)', color:'#fff' }}>{agentId}</strong><br/>
                  Action: <strong style={{ fontFamily:'var(--font-mono)', color:'#fff' }}>{action}</strong>
                </div>
              </div>
            </div>

            {/* Check Box */}
            <div className="firewall-steps-box">
              <div className="firewall-step-line">
                <span className="firewall-step-label">Checking Agent Identity...</span>
                <StatusBadge
                  status={identityStatus}
                  passLabel="VERIFIED ✓"
                  failLabel="UNKNOWN ✗"
                  skipLabel="skipped"
                />
              </div>
              <div className="firewall-step-line">
                <span className="firewall-step-label">Verifying Permission Scope...</span>
                <StatusBadge
                  status={permissionStatus}
                  passLabel="GRANTED ✓"
                  failLabel="DENIED ✗"
                  skipLabel="skipped"
                />
              </div>
            </div>

            {/* ALLOW/BLOCK Banner */}
            {finalVerdict && (
              <div className={`firewall-banner ${finalVerdict}`}>
                {finalVerdict === 'allow' ? 'ALLOW' : 'BLOCK'}
              </div>
            )}

            {/* AI Risk Assessment */}
            {riskNote && (
              <div className="firewall-risk-area">
                <strong>💡 Anomaly Assessment:</strong> {riskNote}
              </div>
            )}

            {reason && (
              <div style={{ fontSize:11, color:'#adc8e0', marginBottom:12 }}>
                <strong>Details:</strong> {reason}
              </div>
            )}

            <div className="firewall-action-btn-row">
              <button className="y2k-btn y2k-btn-purple" onClick={onClose} disabled={running}>
                {running ? 'Verifying...' : 'Close Alert'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────
export default function SimulatePage({ agents, selectedAgentId }) {
  const [chosenAgent, setChosenAgent] = useState(selectedAgentId || '');
  const [chosenAction, setChosenAction] = useState('booking:buy');
  const [customAction, setCustomAction] = useState('');
  
  // Intrusion Takeover tracking
  const [fakeAttemptsCount, setFakeAttemptsCount] = useState(0);
  const [takeoverActive, setTakeoverActive]       = useState(false);

  // Firewall popup state
  const [showPopup, setShowPopup] = useState(false);
  const [popupAgent, setPopupAgent] = useState({ id: '', name: '' });
  const [popupAction, setPopupAction] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (selectedAgentId) setChosenAgent(selectedAgentId);
  }, [selectedAgentId]);

  const triggerTakeover = () => {
    setTakeoverActive(true);
    playSiren();
  };

  const launchFirewall = (agentId, agentName, action) => {
    // If it's a fake/unregistered agent connection
    if (agentId.includes('FAKE') || agentId.includes('Fake')) {
      const nextCount = fakeAttemptsCount + 1;
      setFakeAttemptsCount(nextCount);
      if (nextCount >= 3) {
        triggerTakeover();
        return;
      }
    } else {
      // Break sequence if a real buddy acts
      setFakeAttemptsCount(0);
    }

    setPopupAgent({ id: agentId, name: agentName });
    setPopupAction(action);
    setShowPopup(true);
  };

  // Direct demo scenarios
  const handleQuickDemo = (scenario) => {
    if (scenario === 'travel-ok') {
      launchFirewall('AGT-TRAVELAGENT-RAHUL-001', 'TravelAgent', 'calendar:read');
    } else if (scenario === 'travel-fail') {
      launchFirewall('AGT-TRAVELAGENT-RAHUL-001', 'TravelAgent', 'payments:make');
    } else if (scenario === 'fake-fail') {
      const randomId = `AGT-FAKEAGENT-CRACK-${Math.floor(Math.random()*900+100)}`;
      launchFirewall(randomId, 'FakeTravelAgent', 'booking:buy');
    }
  };

  const handleRunCustom = () => {
    if (!chosenAgent) return;
    const agent = agents.find(a => a.id === chosenAgent);
    launchFirewall(chosenAgent, agent?.name || chosenAgent, customAction.trim() || chosenAction);
  };

  const handlePopupClose = () => {
    setShowPopup(false);
    setHistory(prev => [{
      agentId: popupAgent.id,
      action: popupAction,
      time: new Date().toLocaleTimeString(),
    }, ...prev].slice(0, 8));
  };

  const resetFirewall = () => {
    setTakeoverActive(false);
    setFakeAttemptsCount(0);
  };

  return (
    <>
      {/* Intrusion takeover full screen overlay */}
      {takeoverActive && (
        <div className="antivirus-takeover">
          <div className="takeover-panel">
            <h1 style={{ color:'var(--status-denied)', fontSize:32, fontFamily:'var(--font-chrome)', textShadow:'0 0 10px red', marginBottom:10 }}>
              🚨 INTRUSION DETECTED 🚨
            </h1>
            <div style={{ border:'2.5px solid var(--status-denied)', borderRadius:14, padding:16, margin:'20px 0', background:'rgba(255,0,0,0.25)', fontSize:13 }}>
              <strong>Repeated unauthorized attempts detected!</strong><br/>
              An unregistered crawler signature tried to execute actions multiple times.<br/>
              <span style={{ color:'#ffe28a', fontWeight:'bold' }}>FIREWALL ENGAGED: ALL INCOMING PORTS BLOCKED.</span>
            </div>
            <button className="y2k-btn y2k-btn-blue" onClick={resetFirewall} style={{ padding:'10px 30px' }}>
              Reset Firewall & Resume Monitoring
            </button>
          </div>
        </div>
      )}

      {/* Firewall Alert modal popup */}
      {showPopup && (
        <FirewallAlertPopup
          agentId={popupAgent.id}
          agentName={popupAgent.name}
          action={popupAction}
          onClose={handlePopupClose}
        />
      )}

      <div>
        <h2 className="chrome-text" style={{ fontSize:16, marginBottom:4 }}>🛡️ ZoneAlarm Firewall Center</h2>
        <p style={{ color:'#adc8e0', fontSize:11, marginBottom:16 }}>
          Run identity verification scenarios. A real-time popup will display checks and log directly to Firestore.
        </p>

        {/* Quick Demo scenarios */}
        <div className="win-fieldset" style={{ marginBottom:16 }}>
          <span className="win-legend">🔥 Quick Walkthrough Scenarios</span>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:4 }}>
            <button className="y2k-btn y2k-btn-blue" onClick={() => handleQuickDemo('travel-ok')}>
              🟢 Legit TravelAgent (Expect ALLOW)
            </button>
            <button className="y2k-btn y2k-btn-purple" onClick={() => handleQuickDemo('travel-fail')}>
              🔴 TravelAgent Payment (Expect BLOCK)
            </button>
            <button className="y2k-btn y2k-btn-purple" onClick={() => handleQuickDemo('fake-fail')} style={{ background:'linear-gradient(to right, #900, #c00)' }}>
              🚫 FakeTravelAgent (Expect BLOCK)
            </button>
          </div>
          <div style={{ fontSize:10, color:'#adc8e0', marginTop:6, fontStyle:'italic' }}>
            Tip: Click the Fake Agent button 3 times in a row to simulate repeated intrusion takeover alert!
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, alignItems:'start' }}>
          {/* Custom run panel */}
          <div className="win-fieldset" style={{ marginBottom: 0 }}>
            <span className="win-legend">🎯 Custom Action Tester</span>

            <div className="win-field-group">
              <label className="win-label">Select Buddy Agent</label>
              <select className="win-select" value={chosenAgent}
                onChange={e => setChosenAgent(e.target.value)}>
                <option value="">— Choose registered buddy —</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.id} ({a.name})</option>
                ))}
              </select>
            </div>

            <div className="win-field-group">
              <label className="win-label">Preset Action</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {PRESET_ACTIONS.map(a => (
                  <button key={a} type="button"
                    className="y2k-btn"
                    style={{ fontSize:9, padding:'4px 8px', background: chosenAction === a && !customAction ? 'var(--btn-blue-gradient)' : '#1e3250' }}
                    onClick={() => { setChosenAction(a); setCustomAction(''); }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="win-field-group">
              <label className="win-label">Or Custom Action Name</label>
              <input className="win-input" placeholder='e.g. "admin:delete"'
                value={customAction} onChange={e => setCustomAction(e.target.value)} />
            </div>

            <button className="y2k-btn y2k-btn-purple" style={{ width:'100%', marginTop:6 }}
              onClick={handleRunCustom} disabled={!chosenAgent}>
              Run Custom Verification Check
            </button>
          </div>

          {/* Mini Log */}
          <div>
            <div className="win-fieldset" style={{ height:180, overflowY:'auto' }}>
              <span className="win-legend">📜 In-Page Connection Log</span>
              {history.length === 0 ? (
                <div style={{ color:'#808080', fontStyle:'italic', fontSize:11, textAlign:'center', paddingTop:40 }}>
                  No connections simulated in this session.
                </div>
              ) : (
                <div className="firewall-mini-log" style={{ background:'transparent', border:'none', maxHeight:'none' }}>
                  {history.map((h, i) => (
                    <div key={i} className="firewall-mini-log-line" style={{ color:'#ffffff', fontSize:11 }}>
                      <span style={{ color:'#7ee8d8' }}>[{h.time}]</span>{' '}
                      <span style={{ fontFamily:'var(--font-mono)', color:'#ffe28a' }}>{h.agentId}</span>{' '}
                      tried <strong style={{ fontFamily:'var(--font-mono)' }}>{h.action}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop:12, fontSize:10, color:'#adc8e0', lineHeight:1.4 }}>
              📌 <strong>Real-time verification sequence</strong> fetches identity credentials, evaluates cryptographically signed parameters (Ed25519), validates granular scopes, and saves audit trails dynamically.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
