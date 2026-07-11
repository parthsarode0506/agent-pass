import React, { useState } from 'react';
import nacl from 'tweetnacl';
import '../styles.css';

// Mock key pairs for demonstration
const generateKeyPairFromSeed = (seedString) => {
  // Create a 32-byte seed from the string
  const seed = new Uint8Array(32);
  for (let i = 0; i < Math.min(seedString.length, 32); i++) {
    seed[i] = seedString.charCodeAt(i);
  }
  return nacl.sign.keyPair.fromSeed(seed);
};

const travelAgentKeyPair = generateKeyPairFromSeed('TravelAgentSeed1234567890123456789012');
const fakeTravelAgentKeyPair = generateKeyPairFromSeed('FakeTravelAgentSeed1234567890123456789012');

// Known public keys for verification
const KNOWN_PUBLIC_KEYS = {
  'travel-agent': travelAgentKeyPair.publicKey,
  'fake-travel-agent': fakeTravelAgentKeyPair.publicKey
};

// Simulate API delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock API functions
const mockVerifySignature = async (publicKey, message, signature) => {
  await delay(500); // Simulate network delay
  // In reality, we would verify the signature using tweetnacl
  // For demo, we'll accept if the public key matches one of our known keys and the signature is valid
  try {
    // Convert string message to UTF8 bytes
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = new Uint8Array(signature);
    const isValid = nacl.sign.detached.verify(msgBytes, sigBytes, publicKey);
    return { valid: isValid };
  } catch (e) {
    return { valid: false };
  }
};

const mockCheckPermission = async (agentId, permission) => {
  await delay(500);
  // Simple mock: TravelAgent has certain permissions, FakeTravelAgent has none
  if (agentId === 'travel-agent') {
    const allowedPermissions = ['Create Events', 'Make Payments'];
    return { allowed: allowedPermissions.includes(permission) };
  } else if (agentId === 'fake-travel-agent') {
    return { allowed: false };
  }
  return { allowed: false };
};

const mockAttemptAction = async (agentId, action) => {
  await delay(500);
  // Simulate that the action is only allowed if the agent has the permission and identity is valid
  // We already checked identity and permission in previous steps, so we just return success if both passed
  // In a real app, this would be the actual API call
  return { success: true, message: `${action} completed successfully` };
};

function LiveDemoPanel() {
  const [demoState, setDemoState] = useState({
    travelAgent: { loading: false, steps: {}, history: [] },
    fakeTravelAgent: { loading: false, steps: {}, history: [] },
    paymentAttempt: { loading: false, steps: {}, history: [] }
  });

  const runDemo = async (scenario, agentId, actionType) => {
    // Set loading for the specific scenario
    setDemoState(prev => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        loading: true,
        steps: {
          identityCheck: 'pending',
          permissionCheck: 'pending',
          result: 'pending'
        },
        history: [...prev[scenario].history] // copy history
      }
    }));

    try {
      // Step 1: Identity Check
      // For simplicity, we assume the agent is either travel-agent or fake-travel-agent
      const publicKey = agentId === 'travel-agent' ? travelAgentKeyPair.publicKey : fakeTravelAgentKeyPair.publicKey;
      // Create a message to sign (timestamp + action)
      const timestamp = Date.now();
      const message = `${agentId}:${actionType}:${timestamp}`;
      // Sign the message with the agent's private key
      const signature = nacl.sign.detached(
        new TextEncoder().encode(message),
        agentId === 'travel-agent' ? travelAgentKeyPair.secretKey : fakeTravelAgentKeyPair.secretKey
      );

      // Verify signature
      const verifyResult = await mockVerifySignature(publicKey, message, signature);
      setDemoState(prev => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          steps: {
            ...prev[scenario].steps,
            identityCheck: verifyResult.valid ? 'success' : 'error'
          }
        }
      }));

      if (!verifyResult.valid) {
        throw new Error('Identity verification failed');
      }

      // Step 2: Permission Check
      // Determine which permission to check based on actionType
      let permissionNeeded = '';
      switch (actionType) {
        case 'run':
          permissionNeeded = 'Execute Agent';
          break;
        case 'payment':
          permissionNeeded = 'Make Payments';
          break;
        default:
          permissionNeeded = 'Unknown';
      }
      const permResult = await mockCheckPermission(agentId, permissionNeeded);
      setDemoState(prev => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          steps: {
            ...prev[scenario].steps,
            permissionCheck: permResult.allowed ? 'success' : 'error'
          }
        }
      }));

      if (!permResult.allowed) {
        throw new Error(`Permission denied: ${permissionNeeded}`);
      }

      // Step 3: Attempt the action
      const actionResult = await mockAttemptAction(agentId, actionType);
      setDemoState(prev => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          steps: {
            ...prev[scenario].steps,
            result: 'success'
          },
          history: [
            ...prev[scenario].history,
            {
              timestamp: new Date().toLocaleTimeString(),
              scenario: actionType,
              result: 'success',
              message: actionResult.message
            }
          ]
        }
      }));
    } catch (err) {
      setDemoState(prev => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          steps: {
            ...prev[scenario].steps,
            result: 'error'
          },
          history: [
            ...prev[scenario].history,
            {
              timestamp: new Date().toLocaleTimeString(),
              scenario: actionType,
              result: 'error',
              message: err.message
            }
          ]
        }
      }));
    } finally {
      // Re-enable the button
      setDemoState(prev => ({
        ...prev,
        [scenario]: {
          ...prev[scenario],
          loading: false
        }
      }));
    }
  };

  const getStepStatusColor = (status) => {
    switch (status) {
      case 'success': return '#008000'; // green
      case 'error': return '#FF0000'; // red
      case 'pending': return '#FFFF00'; // yellow
      default: return '#C0C0C0'; // gray
    }
  };

  return (
    <div className="live-demo-panel">
      <h2>Live Demo</h2>
      <div className="demo-buttons">
        <button
          onClick={() => runDemo('travelAgent', 'travel-agent', 'run')}
          disabled={demoState.travelAgent.loading}
          className="demo-button"
        >
          Run as TravelAgent
        </button>
        <button
          onClick={() => runDemo('fakeTravelAgent', 'fake-travel-agent', 'run')}
          disabled={demoState.fakeTravelAgent.loading}
          className="demo-button"
        >
          Run as FakeTravelAgent
        </button>
        <button
          onClick={() => runDemo('paymentAttempt', 'travel-agent', 'payment')}
          disabled={demoState.paymentAttempt.loading}
          className="demo-button"
        >
          TravelAgent attempts payment
        </button>
      </div>

      <div className="demo-results">
        <div className="demo-result-column">
          <h3>TravelAgent Demo</h3>
          <div className="demo-steps">
            <div className="demo-step">
              <span>Identity Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.travelAgent.steps.identityCheck || 'idle') }}>
                {demoState.travelAgent.steps.identityCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Permission Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.travelAgent.steps.permissionCheck || 'idle') }}>
                {demoState.travelAgent.steps.permissionCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Result:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.travelAgent.steps.result || 'idle') }}>
                {demoState.travelAgent.steps.result || 'idle'}
              </span>
            </div>
          </div>
          <div className="demo-history">
            <h4>History:</h4>
            <ul>
              {demoState.travelAgent.history.map((entry, idx) => (
                <li key={idx}>
                  [{entry.timestamp}] {entry.scenario}: {entry.result.toUpperCase()} - {entry.message}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="demo-result-column">
          <h3>FakeTravelAgent Demo</h3>
          <div className="demo-steps">
            <div className="demo-step">
              <span>Identity Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.fakeTravelAgent.steps.identityCheck || 'idle') }}>
                {demoState.fakeTravelAgent.steps.identityCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Permission Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.fakeTravelAgent.steps.permissionCheck || 'idle') }}>
                {demoState.fakeTravelAgent.steps.permissionCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Result:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.fakeTravelAgent.steps.result || 'idle') }}>
                {demoState.fakeTravelAgent.steps.result || 'idle'}
              </span>
            </div>
          </div>
          <div className="demo-history">
            <h4>History:</h4>
            <ul>
              {demoState.fakeTravelAgent.history.map((entry, idx) => (
                <li key={idx}>
                  [{entry.timestamp}] {entry.scenario}: {entry.result.toUpperCase()} - {entry.message}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="demo-result-column">
          <h3>Payment Attempt Demo</h3>
          <div className="demo-steps">
            <div className="demo-step">
              <span>Identity Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.paymentAttempt.steps.identityCheck || 'idle') }}>
                {demoState.paymentAttempt.steps.identityCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Permission Check:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.paymentAttempt.steps.permissionCheck || 'idle') }}>
                {demoState.paymentAttempt.steps.permissionCheck || 'idle'}
              </span>
            </div>
            <div className="demo-step">
              <span>Result:</span>
              <span className={`step-status`} style={{ backgroundColor: getStepStatusColor(demoState.paymentAttempt.steps.result || 'idle') }}>
                {demoState.paymentAttempt.steps.result || 'idle'}
              </span>
            </div>
          </div>
          <div className="demo-history">
            <h4>History:</h4>
            <ul>
              {demoState.paymentAttempt.history.map((entry, idx) => (
                <li key={idx}>
                  [{entry.timestamp}] {entry.scenario}: {entry.result.toUpperCase()} - {entry.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveDemoPanel;