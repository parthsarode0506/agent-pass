import React from 'react';

function AgentRegistry({ agents, onRegisterAgent, onRevokeAgent }) {
  // Simulate fetching more details for view details dialog
  const [selectedAgent, setSelectedAgent] = React.useState(null);
  const [viewDetailsOpen, setViewDetailsOpen] = React.useState(false);

  const handleViewDetails = (agent) => {
    setSelectedAgent(agent);
    setViewDetailsOpen(true);
  };

  const handleCloseDetails = () => {
    setViewDetailsOpen(false);
    setSelectedAgent(null);
  };

  const handleRevoke = async (agentId) => {
    try {
      await onRevokeAgent(agentId);
      // The onRevokeAgent function should handle the actual revocation and update the agents list
      // We don't need to do anything here because the parent will update the agents state
    } catch (err) {
      // The onRevokeAgent function should handle errors and show alerts
      console.error('Error in revoke agent handler:', err);
    }
  };

  return (
    <div className="agent-registry">
      <div className="toolbar">
        <button className="toolbar-button" onClick={onRegisterAgent}>
          Register New Agent
        </button>
      </div>
      <div className="agent-list">
        <table className="agent-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Permissions</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td>{agent.name}</td>
                <td>{agent.owner || 'N/A'}</td>
                <td>{agent.status || 'active'}</td>
                <td>
                  {agent.permissions && agent.permissions.length > 0 ? (
                    agent.permissions.map((p, idx) => (
                      <span key={idx} className="permission-tag">{p}</span>
                    ))
                  ) : (
                    <span className="permission-tag none">None</span>
                  )}
                </td>
                <td className="agent-actions">
                  <button className="action-button" onClick={() => handleViewDetails(agent)}>
                    View Details
                  </button>
                  <button className="action-button" onClick={() => handleRevoke(agent.id)}>
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* View Details Dialog */}
      <div className={`dialog-backdrop ${viewDetailsOpen ? 'visible' : ''}`} onClick={handleCloseDetails}>
        <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-header">
            <h2>Agent Details</h2>
            <button className="dialog-close" onClick={handleCloseDetails}>
              ×
            </button>
          </div>
          <div className="dialog-body">
            {selectedAgent ? (
              <div>
                <p><strong>ID:</strong> {selectedAgent.id}</p>
                <p><strong>Name:</strong> {selectedAgent.name}</p>
                <p><strong>Owner:</strong> {selectedAgent.owner || 'N/A'}</p>
                <p><strong>Status:</strong> {selectedAgent.status || 'N/A'}</p>
                <p><strong>Permissions:</strong></p>
                <ul>
                  {selectedAgent.permissions && selectedAgent.permissions.length > 0 ? (
                    selectedAgent.permissions.map((p, idx) => (
                      <li key={idx}>{p}</li>
                    ))
                  ) : (
                    <li>None</li>
                  )}
                </ul>
                <p><strong>Created At:</strong> {new Date(selectedAgent.createdAt).toLocaleString()}</p>
                {selectedAgent.updatedAt && (
                  <p><strong>Updated At:</strong> {new Date(selectedAgent.updatedAt).toLocaleString()}</p>
                )}
              </div>
            ) : (
              <p>No agent selected.</p>
            )}
          </div>
          <div className="dialog-footer">
            <button className="dialog-button" onClick={handleCloseDetails}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentRegistry;