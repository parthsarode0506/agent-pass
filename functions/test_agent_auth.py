"""
Test suite for Agent RSA Authorization Workflow.

Tests:
  1. Valid agent ID + valid RSA signature → task runs and is logged.
  2. Invalid agent ID → rejected with 401 and logged.
  3. Valid agent ID + invalid RSA signature → rejected with 401 and logged.

Usage:
  cd functions
  pip install -r requirements.txt
  pip install httpx pytest
  set FIRESTORE_EMULATOR_HOST=localhost:8080
  python -m pytest test_agent_auth.py -v
"""
import os
import sys
import base64
import hashlib
import time

# Ensure Firestore emulator is used if not already set
if "FIRESTORE_EMULATOR_HOST" not in os.environ:
    os.environ["FIRESTORE_EMULATOR_HOST"] = "localhost:8080"

# Set project ID before any Firebase import
os.environ["GCLOUD_PROJECT"] = "agentid-hackathon"

from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import serialization, hashes

import pytest
from fastapi.testclient import TestClient

# Import the FastAPI app from main.py
from main import fastapi_app, db


# ─── Helper: generate RSA keypair for tests ─────────────────────────────────
def generate_test_rsa_keypair():
    """Generate an RSA-2048 keypair and return (public_pem, private_key_obj, private_pem)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.SubjectPublicKeyInfo
    ).decode("utf-8")
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode("utf-8")
    return public_pem, private_key, private_pem


def sign_message(private_key, message: str) -> str:
    """Sign a message with an RSA private key and return base64-encoded signature."""
    signature = private_key.sign(
        message.encode("utf-8"),
        padding.PKCS1v15(),
        hashes.SHA256()
    )
    return base64.b64encode(signature).decode("utf-8")


# ─── Fixtures ────────────────────────────────────────────────────────────────
client = TestClient(fastapi_app)


@pytest.fixture(scope="module")
def registered_agent():
    """
    Register a test agent with a known RSA keypair.
    Returns (agent_id, public_pem, private_key_obj).
    """
    public_pem, private_key, private_pem = generate_test_rsa_keypair()
    agent_name = f"TestAgent_{int(time.time())}"

    response = client.post("/api/agents/register", json={
        "name": agent_name,
        "publicKey": public_pem,
        "role": "agent"
    })
    assert response.status_code == 200, f"Registration failed: {response.text}"
    data = response.json()
    agent_id = data["agent_id"]
    assert agent_id is not None

    return agent_id, public_pem, private_key


# ─── Test 1: Valid ID + Valid Signature → Task Runs and is Logged ────────────
def test_valid_agent_valid_signature_task_runs(registered_agent):
    """
    Given a registered agent with valid RSA keys,
    when we sign a message with the correct private key and execute a task,
    then the task should succeed (200) and audit logs should record start + completion.
    """
    agent_id, _, private_key = registered_agent
    message = f"{agent_id}:echo:{int(time.time())}"
    signature = sign_message(private_key, message)

    response = client.post("/api/tasks/execute", json={
        "agent_id": agent_id,
        "signature": signature,
        "message": message,
        "task_type": "echo",
        "payload": {"test": "hello"}
    })
    assert response.status_code == 200, f"Task execution failed: {response.text}"
    data = response.json()
    assert data["agent_id"] == agent_id
    assert data["task_type"] == "echo"
    assert data["result"]["echoed"] == {"test": "hello"}

    # Verify audit logs were created
    time.sleep(0.5)  # Allow Firestore to process
    audit_response = client.get(f"/api/agents/{agent_id}/audit-log")
    assert audit_response.status_code == 200
    logs = audit_response.json()["audit_log"]

    # Find task_dynamic logs for this agent
    task_logs = [l for l in logs if l.get("action") == "task_dynamic"]
    assert len(task_logs) >= 2, f"Expected at least 2 task_dynamic audit logs, got {len(task_logs)}"

    # Check that we have both a 'start' (granted) and 'completion' (success) log
    results = [l.get("result") for l in task_logs]
    assert "granted" in results, "Expected a 'granted' (start) audit log entry"
    assert "success" in results, "Expected a 'success' (completion) audit log entry"


# ─── Test 2: Invalid Agent ID → Rejected (401) and Logged ───────────────────
def test_invalid_agent_id_rejected_and_logged():
    """
    Given a non-existent agent ID,
    when we attempt to execute a task,
    then the request should be rejected with 401 and the denial should be logged.
    """
    fake_agent_id = "NonExistentAgent_XYZ_12345"
    message = f"{fake_agent_id}:echo:{int(time.time())}"

    response = client.post("/api/tasks/execute", json={
        "agent_id": fake_agent_id,
        "signature": "fakesignature",
        "message": message,
        "task_type": "echo",
        "payload": {}
    })
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
    data = response.json()
    assert "not found" in data["detail"].lower() or "not found" in data.get("detail", "").lower()

    # Verify the denial was logged
    time.sleep(0.5)
    audit_response = client.get(f"/api/agents/{fake_agent_id}/audit-log")
    assert audit_response.status_code == 200
    logs = audit_response.json()["audit_log"]
    denied_logs = [l for l in logs if l.get("result") == "denied"]
    assert len(denied_logs) >= 1, "Expected at least 1 denial audit log for invalid agent ID"


# ─── Test 3: Valid ID + Invalid Signature → Rejected (401) and Logged ────────
def test_valid_agent_invalid_signature_rejected_and_logged(registered_agent):
    """
    Given a registered agent with valid credentials,
    when we send a request with a wrong/forged RSA signature,
    then the request should be rejected with 401 and the failure should be logged.
    """
    agent_id, _, _ = registered_agent
    message = f"{agent_id}:echo:{int(time.time())}"
    # Use a completely fake signature
    fake_signature = base64.b64encode(b"this-is-a-completely-invalid-rsa-signature").decode("utf-8")

    response = client.post("/api/tasks/execute", json={
        "agent_id": agent_id,
        "signature": fake_signature,
        "message": message,
        "task_type": "echo",
        "payload": {}
    })
    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
    data = response.json()
    assert "signature" in data["detail"].lower()

    # Verify the denial was logged
    time.sleep(0.5)
    audit_response = client.get(f"/api/agents/{agent_id}/audit-log")
    assert audit_response.status_code == 200
    logs = audit_response.json()["audit_log"]
    sig_denied_logs = [l for l in logs if l.get("result") == "denied" and "signature" in l.get("reason", "").lower()]
    assert len(sig_denied_logs) >= 1, "Expected at least 1 denial audit log for invalid signature"


# ─── Test 4: Task types listing ──────────────────────────────────────────────
def test_list_task_types():
    """Verify the task types endpoint returns all registered task types."""
    response = client.get("/api/tasks/types")
    assert response.status_code == 200
    data = response.json()
    task_types = data["task_types"]
    assert "echo" in task_types
    assert "calendar_sync" in task_types
    assert "payment_processing" in task_types
    assert "data_analysis" in task_types


# ─── Test 5: Agent registration creates Firestore documents ──────────────────
def test_registration_creates_firestore_documents():
    """
    Verify that registering an agent creates documents in the
    agents, credentials, and permissions Firestore collections.
    """
    public_pem, private_key, _ = generate_test_rsa_keypair()
    agent_name = f"FirestoreTestAgent_{int(time.time())}"

    response = client.post("/api/agents/register", json={
        "name": agent_name,
        "publicKey": public_pem,
        "role": "agent",
        "granted_actions": ["data:read", "data:write"]
    })
    assert response.status_code == 200
    data = response.json()
    agent_id = data["agent_id"]

    # Verify agent appears in list
    list_response = client.get("/api/agents")
    assert list_response.status_code == 200
    agents = list_response.json()
    agent_ids = [a["id"] for a in agents]
    assert agent_id in agent_ids

    # Find our agent and check its data
    our_agent = next(a for a in agents if a["id"] == agent_id)
    assert our_agent["status"] == "active"
    assert our_agent["credentials"]["active"] is True
    assert our_agent["credentials"]["public_key"] == public_pem
    assert "data:read" in our_agent["permissions"]
    assert "data:write" in our_agent["permissions"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
