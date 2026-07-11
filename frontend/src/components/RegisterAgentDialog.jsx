import React, { useState } from 'react';

function RegisterAgentDialog({ isOpen, onClose, onRegister }) {
  const [formData, setFormData] = useState({
    name: '',
    publicKey: '',
    role: 'agent'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // In a real app, we would send to the backend here.
      // For now, we'll just call the onRegister callback and let the parent handle it.
      // However, the onRegister callback in App currently just closes the dialog.
      // We need to change that to actually register with the backend.
      // Let adjust: we'll have the dialog call the backend and then on success, call onClose and maybe refresh.
      // But we don't want to duplicate the fetch logic. We'll have the dialog call the backend and then call onRegister with the data?
      // Actually, the onRegister prop in App is currently just a function to open the dialog. We need to change that.
      // Let's change the design: the dialog will handle the submission to the backend and then call onClose and also notify the parent to refresh.
      // We'll change the onRegister prop to be a function that is called with the new agent data on success, and then the parent can decide to refresh.
      // For now, we'll simulate.
      // For simplicity, we'll have the dialog call the backend and then on success, call onClose and then call a refetch function passed from parent.
      // We'll adjust the App to pass a refetch function.
      // However, to keep the changes minimal, we'll assume the onRegister prop is a function that takes the form data and returns a promise.
      // We'll change the App to pass a function that does the fetch and then refetches the agent list.
      // But we haven't implemented that in App yet.
      // Let's refactor: we'll change the RegisterAgentDialog to accept a registerAgent function that returns a promise.
      // And then we'll change the App to provide that function.
      // Since we are in the middle of writing, let's adjust the RegisterAgentDialog to take a registerAgent prop that is a async function.
      // And then we'll change the App accordingly.
      // However, the user's current code for App passes onRegisterAgent as a function that just sets showRegisterDialog to true.
      // We'll change that later.
      // For now, let's assume the onRegister prop is a function that takes the form data and returns a promise that resolves with the new agent.
      // We'll call it and then on success, we'll close the dialog and optionally show a message.
      const newAgent = await onRegister(formData);
      // Assuming onReturn returns the created agent object
      // We'll close the dialog and let the parent handle refresh (maybe by refetching in the agent registry)
      onClose();
      // Optionally, we could show a success message, but for simplicity we just close.
    } catch (err) {
      setError(err.message || 'Failed to register agent');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Register New Agent</h2>
          <button className="dialog-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">
          {error && <div className="dialog-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Agent Name:</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="publicKey">Public Key:</label>
              <input
                type="text"
                id="publicKey"
                name="publicKey"
                value={formData.publicKey}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="role">Role:</label>
              <select
                id="role"
                name="role"
                value={formData.role}
                onChange={handleChange}
              >
                <option value="agent">Agent</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Registering...' : 'Register'}
              </button>
              <button type="button" onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default RegisterAgentDialog;