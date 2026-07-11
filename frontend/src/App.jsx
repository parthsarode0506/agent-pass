import React, { useState } from 'react';
import AgentRegistry from './components/AgentRegistry';
import RegisterAgentDialog from './components/RegisterAgentDialog';
import LiveDemoPanel from './components/LiveDemoPanel';
import AuditLogViewer from './components/AuditLogViewer';
import './styles.css';

function App() {
  const [agents, setAgents] = useState([]);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/agents');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch agents on initial load
  React.useEffect(() => {
    fetchAgents();
  }, []);

  const handleRegisterAgent = async (agentData) => {
    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(agentData)
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const newAgent = await response.json();
      // Add the new agent to the list (optimistic update)
      setAgents(prev => [...prev, newAgent]);
    } catch (err) {
      console.error('Failed to register agent:', err);
      alert('Failed to register agent: ' + err.message);
    }
  };

  const handleRevokeAgent = async (agentId) => {
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // Remove the agent from the list
      setAgents(prev => prev.filter(agent => agent.id !== agentId));
    } catch (err) {
      console.error('Failed to revoke agent:', err);
      alert('Failed to revoke agent: ' + err.message);
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>AgentOS Admin Panel</h1>
      </div>
      <div className="panels">
        <div className="panel">
          <AgentRegistry
            agents={agents}
            onRegisterAgent={() => setShowRegisterDialog(true)}
            onRevokeAgent={handleRevokeAgent}
          />
        </div>
        <div className="panel">
          <LiveDemoPanel />
        </div>
        <div className="panel">
          <AuditLogViewer />
        </div>
      </div>
      <RegisterAgentDialog
        isOpen={showRegisterDialog}
        onClose={() => setShowRegisterDialog(false)}
        onRegister={handleRegisterAgent}
      />
    </div>
  );
}

export default App;