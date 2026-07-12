import React, { useState } from 'react';
import VirtualAgentCard from './VirtualAgentCard';
import { playDialUp } from '../utils/audio.js';
import { api } from '../utils/api.js';

const ALL_PERMISSIONS = [
  { id: 'web:browse',     label: 'Web: Browse the Internet' },
  { id: 'booking:buy',    label: 'Booking: Purchase Tickets' },
  { id: 'calendar:write', label: 'Calendar: Write Events' },
  { id: 'calendar:read',  label: 'Calendar: Read Events' },
  { id: 'email:read',     label: 'Email: Read Inbox' },
  { id: 'payments:make',  label: 'Payments: Make Transactions' },
  { id: 'data:read',      label: 'Data: Read Sources' },
  { id: 'files:write',    label: 'Files: Write/Export' },
];

function RegistrationForm({ user, onRegistered, onBack }) {
  const ownerName = user?.displayName || user?.email || '';
  const [form, setForm]             = useState({ name: '', owner: ownerName, purpose: '' });
  const [permissions, setPermissions] = useState([]);
  const [nlText, setNlText]         = useState('');
  const [parsing, setParsing]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  const toggle = (id) =>
    setPermissions(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const handleNlParse = async () => {
    if (!nlText.trim()) return;
    setParsing(true);
    try {
      const res  = await api.post('/api/agents/parse-permissions', { text: nlText });
      const data = await res.json();
      if (data.permissions) setPermissions(data.permissions);
    } catch (_) {}
    finally { setParsing(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Agent Name is required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Get Firebase Auth ID token for backend verification
      const idToken = user ? await user.getIdToken() : null;
      const res  = await api.post('/api/agents/register', {
        name: form.name.trim(),
        owner: ownerName,
        purpose: form.purpose.trim(),
        permissions,
      }, idToken);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Registration failed');
      
      // Play retro modem handshake sound on success
      playDialUp();
      onRegistered(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nameSlug = form.name.toUpperCase().replace(/[^A-Z0-9]/g,'') || '???';
  const ownerSlug = ownerName.toUpperCase().replace(/[^A-Z0-9]/g,'') || '???';

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <h2 className="chrome-text" style={{ fontSize:16 }}>🤖 Register a New Buddy (Agent)</h2>
        <button type="button" className="y2k-btn y2k-btn-purple" onClick={onBack} style={{ padding:'5px 12px' }}>← Back</button>
      </div>

      {error && (
        <div style={{ background:'rgba(255, 61, 94, 0.15)', border:'1.5px solid var(--status-denied)', borderRadius:10, padding:'8px 12px', marginBottom:12, color:'var(--status-denied)', fontSize:11 }}>
          ⚠ {error}
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Profile Card */}
        <div className="win-fieldset">
          <span className="win-legend">🪪 Identity Profile</span>
          
          <div className="win-field-group">
            <label className="win-label">Agent Name *</label>
            <input className="win-input" placeholder='e.g. "TravelAgent"'
              value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
              disabled={loading} required />
          </div>

          <div className="win-field-group">
            <label className="win-label">Owner Name (Google Account)</label>
            <input className="win-input win-input-readonly" placeholder="Owner"
              value={ownerName} readOnly />
            <div className="owner-linked-note">
              🔗 Linked to your Google account
            </div>
          </div>

          <div className="win-field-group">
            <label className="win-label">Away Message (Purpose)</label>
            <textarea className="win-textarea" style={{ height:65 }}
              placeholder="Explain what operations this agent is allowed to run..."
              value={form.purpose} onChange={e => setForm(f => ({...f, purpose: e.target.value}))}
              disabled={loading} />
          </div>

          <div style={{ background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:10, padding:10, fontSize:11 }}>
            <strong>Auto-generated ID (Preview):</strong><br/>
            <span style={{ fontFamily:'var(--font-mono)', color:'#7ee8d8', fontSize:12 }}>
              AGT-{nameSlug}-{ownerSlug}-XXX
            </span><br/>
            <span style={{ color:'#adc8e0', fontSize:9 }}>Sequence assigned client-free inside Firestore transaction.</span>
          </div>
        </div>

        {/* Permissions Form */}
        <div className="win-fieldset">
          <span className="win-legend">🔑 Granted Action Profiles</span>

          {/* AI Parser box */}
          <div className="win-field-group">
            <label className="win-label">Ask AI to Parse Permissions (Natural Language)</label>
            <textarea className="win-textarea" style={{ height:56 }}
              placeholder='e.g. "this buddy can read calendar and read email but cannot buy tickets"'
              value={nlText} onChange={e => setNlText(e.target.value)}
              disabled={parsing || loading} />
            <button type="button" className="y2k-btn y2k-btn-blue" style={{ marginTop:6, width:'100%' }}
              onClick={handleNlParse} disabled={parsing || !nlText.trim()}>
              {parsing ? '⏳ Parsing...' : '🧠 Ask AgentID to Parse Text'}
            </button>
          </div>

          <hr style={{ margin:'12px 0', borderColor:'rgba(255,255,255,0.15)' }} />

          <div className="win-checkbox-grid">
            {ALL_PERMISSIONS.map(p => (
              <label key={p.id} className="win-checkbox-label">
                <input type="checkbox" checked={permissions.includes(p.id)}
                  onChange={() => toggle(p.id)} disabled={loading} />
                <span style={{ fontFamily:'var(--font-mono)', fontSize:11 }}>{p.id}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign:'right', marginTop:16 }}>
        <button type="submit" className="y2k-btn y2k-btn-purple" style={{ padding:'10px 24px', fontSize:12 }} disabled={loading}>
          {loading ? '⏳ Accessing modem...' : '🔐 Create Certified Buddy'}
        </button>
      </div>
    </form>
  );
}

function CredentialIssued({ agent, onDone, onRegisterAnother }) {
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard.writeText(agent.secret_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div>
      <h2 className="chrome-text" style={{ fontSize:16, marginBottom:12 }}>✅ Cryptographic Identity Active</h2>

      {/* Holographic certified seal */}
      <div className="certified-seal-box">
        <span className="certified-ribbon">🎖️</span>
        <div>
          <div className="certified-seal-title">CERTIFIED BUDDY IDENTITY SEAL</div>
          <div className="certified-seal-text">
            Identity registered in Cloud Firestore document key. Key pair generated. <br/>
            Owner and type slugs locked. Verify status live in Google Console.
          </div>
        </div>
      </div>

      <div className="win-fieldset mt-4">
        <span className="win-legend">Unique Agent ID</span>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:18, color:'#7ee8d8', fontWeight:'bold' }}>
          {agent.agent_id}
        </div>
        <div style={{ fontSize:10, color:'#adc8e0', marginTop:2 }}>
          Document saved to: <code>agents/{agent.agent_id}</code>
        </div>
      </div>

      {agent.permissions?.length > 0 && (
        <div className="win-fieldset mt-4">
          <span className="win-legend">Granted Permissions Array</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
            {agent.permissions.map(p => (
              <span key={p} className="aim-pill-badge" style={{ fontSize:10 }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      <div style={{ background:'rgba(255, 226, 138, 0.12)', border:'1.5px solid rgba(255, 226, 138, 0.3)', borderRadius:10, padding:10, marginTop:12, fontSize:11, color:'#ffe28a' }}>
        ⚠️ <strong>CRITICAL WARNING:</strong> Save the private secret key displayed below.
        It is shown once and cannot be retrieved from Firestore.
      </div>

      <div style={{ marginTop:10 }}>
        <label className="win-label">Ed25519 Secret Key (One-time Display):</label>
        <div className="win-monospace-box" style={{ fontSize:11 }}>{agent.secret_key}</div>
        <div style={{ textAlign:'right', marginTop:6 }}>
          <button className="y2k-btn y2k-btn-blue" onClick={copyKey} style={{ padding:'6px 14px' }}>
            {copied ? '✅ Copy Successful!' : '📋 Copy Secret Key'}
          </button>
        </div>
      </div>

      <div style={{ display:'flex', gap:10, marginTop:16 }}>
        <button className="y2k-btn y2k-btn-blue" onClick={onRegisterAnother}>+ Register Another</button>
        <button className="y2k-btn y2k-btn-purple" onClick={onDone}>🛡️ View Firewall</button>
      </div>
    </div>
  );
}

export default function RegisterPage({ user, onRegistered, onBack }) {
  const [issued, setIssued] = useState(null);

  const handleRegistered = (agentData) => {
    setIssued(agentData);
    onRegistered();
  };

  if (issued) {
    return (
      <CredentialIssued
        agent={issued}
        onDone={onBack}
        onRegisterAnother={() => setIssued(null)}
      />
    );
  }

  return <RegistrationForm user={user} onRegistered={handleRegistered} onBack={onBack} />;
}
