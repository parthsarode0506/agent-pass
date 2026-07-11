import os
import json
import base64
import hashlib
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Depends
from starlette.responses import JSONResponse
from starlette.requests import Request
import uvicorn
import nacl.signing
import nacl.encoding
import nacl.exceptions
import functions_framework
from mangum import Mangum

# Initialize Firebase Admin SDK
# In Cloud Functions or emulator, the default credentials are used.
if not firebase_admin._apps:
    project_id = "rift-2ef56"
    os.environ["GCLOUD_PROJECT"] = project_id
    try:
        # Eagerly check if default credentials can be resolved
        import google.auth
        google.auth.default()
        firebase_admin.initialize_app()
    except Exception:
        # Generate a valid RSA private key dynamically to satisfy the PEM parser
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.primitives import serialization
        private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        private_key_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ).decode("utf-8")

        # Fallback to dummy credentials for local emulator
        dummy_cred = credentials.Certificate({
            "type": "service_account",
            "project_id": project_id,
            "private_key_id": "dummy_key_id",
            "private_key": private_key_pem,
            "client_email": "dummy@example.com",
            "token_uri": "https://oauth2.googleapis.com/token"
        })
        firebase_admin.initialize_app(dummy_cred)

db = firestore.client()

# Initialize FastAPI app - renamed to fastapi_app to avoid name collision with function entry point
fastapi_app = FastAPI(title="AgentID Backend")

# Helper function for Ed25519 signing and verification using PyNaCl
def generate_keypair() -> tuple[str, str]:
    """Generate a new Ed25519 keypair and return hex-encoded public and secret keys."""
    signing_key = nacl.signing.SigningKey.generate()
    verifying_key = signing_key.verify_key
    public_key_hex = verifying_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
    secret_key_hex = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
    return public_key_hex, secret_key_hex

def hash_secret_key(secret_key_hex: str) -> str:
    """Hash the secret key for storage (we don't store the raw secret key)."""
    return hashlib.sha256(secret_key_hex.encode("utf-8")).hexdigest()

def verify_signature(public_key_str: str, signature_str: str, message: bytes) -> bool:
    """Verify an Ed25519 signature supporting both hex and base64 formats."""
    try:
        # Decode public key (Hex is 64 chars, base64 is 44 chars)
        if len(public_key_str) == 64:
            public_key_bytes = nacl.encoding.HexEncoder.decode(public_key_str.encode("utf-8"))
        else:
            public_key_bytes = base64.b64decode(public_key_str)

        # Decode signature (Hex is 128 chars, base64 is 88 chars)
        if len(signature_str) == 128:
            signature_bytes = nacl.encoding.HexEncoder.decode(signature_str.encode("utf-8"))
        else:
            signature_bytes = base64.b64decode(signature_str)

        verify_key = nacl.signing.VerifyKey(public_key_bytes)
        verify_key.verify(message, signature_bytes)
        return True
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False

# Endpoints mapping to both prefixed /api routes and non-prefixed routes for flexibility

@fastapi_app.post("/api/agents/register")
@fastapi_app.post("/api/agents")
@fastapi_app.post("/agents/register")
@fastapi_app.post("/agents")
async def register_agent(request: Request):
    """
    Register a new agent.
    Supports registration both by generating a keypair automatically
    and by accepting a client-provided public key.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Adapt to different parameter names from frontend/backend
    name = data.get("name")
    agent_id = data.get("agent_id") or name
    owner_id = data.get("owner_id") or data.get("owner") or "owner_demo"
    purpose = data.get("purpose") or f"Agent with role {data.get('role', 'agent')}"

    if not name:
        raise HTTPException(status_code=400, detail="Missing required field: name")

    # Clean agent_id
    if not agent_id:
        raise HTTPException(status_code=400, detail="Missing required field: agent_id or name")
    
    agent_id = str(agent_id).strip().replace(" ", "_")

    # Check if agent already exists
    agent_ref = db.collection("agents").document(agent_id)
    if agent_ref.get().exists:
        raise HTTPException(status_code=409, detail=f"Agent ID '{agent_id}' already exists")

    # Set up credentials (use client public key if provided, otherwise generate)
    client_pubkey = data.get("publicKey") or data.get("public_key")
    if client_pubkey:
        public_key_str = client_pubkey
        secret_key_str = None
        secret_key_hash = hash_secret_key(client_pubkey)
    else:
        public_key_str, secret_key_str = generate_keypair()
        secret_key_hash = hash_secret_key(secret_key_str)

    now = datetime.now(timezone.utc)

    # Create agent document
    agent_ref.set({
        "name": name,
        "owner_id": owner_id,
        "purpose": purpose,
        "created_at": now,
        "status": "active"
    })

    # Create credentials document (at root level)
    cred_ref = db.collection("credentials").document(agent_id)
    cred_ref.set({
        "public_key": public_key_str,
        "secret_key_hash": secret_key_hash,
        "secret_hash": secret_key_hash,  # compatible naming
        "issued_at": now,
        "created_at": now,  # compatible naming
        "active": True
    })

    # Create permissions document (at root level)
    perm_ref = db.collection("permissions").document(agent_id)
    # Default permissions if specified, otherwise empty
    granted_actions = data.get("granted_actions") or []
    perm_ref.set({
        "granted_actions": granted_actions,
        "updated_at": now
    })

    # Log registration attempt to audit log
    log_audit(
        agent_id=agent_id,
        action="register",
        result="success",
        reason="Agent registered successfully"
    )

    # Return response matching both frontend and backend requirements
    response_data = {
        "id": agent_id,
        "agent_id": agent_id,
        "name": name,
        "owner": owner_id,
        "owner_id": owner_id,
        "purpose": purpose,
        "created_at": now.isoformat(),
        "createdAt": now.isoformat(),
        "status": "active",
        "permissions": granted_actions,
        "public_key": public_key_str,
        "message": "Agent registered successfully."
    }
    
    if secret_key_str:
        response_data["secret_key"] = secret_key_str
        response_data["message"] += " Store the secret key securely."
        
    return JSONResponse(response_data)


@fastapi_app.post("/api/agents/{agent_id}/verify")
@fastapi_app.post("/agents/{agent_id}/verify")
async def verify_agent(agent_id: str, request: Request):
    """
    Verify an agent by checking a signature.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    signature_str = data.get("signature")
    message_str = data.get("message")

    if not signature_str or not message_str:
        raise HTTPException(status_code=400, detail="Missing signature or message")

    # The message can be base64-encoded or raw string
    try:
        # Try decoding as base64 first
        message = base64.b64decode(message_str)
    except Exception:
        # Fallback to UTF-8 bytes if not valid base64
        message = message_str.encode("utf-8")

    # Fetch the agent's public key from credentials root collection
    cred_ref = db.collection("credentials").document(agent_id)
    cred_snapshot = cred_ref.get()
    if not cred_snapshot.exists:
         # Fallback to check if credentials are stored as a subcollection
         agent_ref = db.collection("agents").document(agent_id)
         sub_creds = agent_ref.collection("credentials").limit(1).get()
         if sub_creds:
             cred_snapshot = sub_creds[0]
         else:
             raise HTTPException(status_code=404, detail="Agent credentials not found")

    cred_data = cred_snapshot.to_dict()
    if not cred_data.get("active", False):
        log_audit(
            agent_id=agent_id,
            action="verify",
            result="denied",
            reason="Agent credentials are not active"
        )
        raise HTTPException(status_code=403, detail="Agent credentials are not active")

    public_key_str = cred_data.get("public_key")
    if not public_key_str:
        raise HTTPException(status_code=500, detail="Public key not found in credentials")

    # Verify the signature
    is_valid = verify_signature(public_key_str, signature_str, message)

    # Log the verification attempt to audit log
    log_audit(
        agent_id=agent_id,
        action="verify",
        result="granted" if is_valid else "denied",
        reason="Signature verification successful" if is_valid else "Signature verification failed"
    )

    return JSONResponse({
        "agent_id": agent_id,
        "verified": is_valid
    })


@fastapi_app.post("/api/agents/{agent_id}/authorize")
@fastapi_app.post("/agents/{agent_id}/authorize")
@fastapi_app.post("/api/agents/{agent_id}/request")
@fastapi_app.post("/agents/{agent_id}/request")
async def authorize_agent(agent_id: str, request: Request):
    """
    Check if an agent is authorized for a specific action.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    action = data.get("action")
    signature_str = data.get("signature")
    message_str = data.get("message")

    if not all([action, signature_str, message_str]):
        raise HTTPException(status_code=400, detail="Missing action, signature, or message")

    try:
        message = base64.b64decode(message_str)
    except Exception:
        message = message_str.encode("utf-8")

    # Fetch agent credentials and permissions from root level
    cred_ref = db.collection("credentials").document(agent_id)
    perm_ref = db.collection("permissions").document(agent_id)

    cred_snapshot = cred_ref.get()
    perm_snapshot = perm_ref.get()

    # Mismatch/fallback safety checks
    if not cred_snapshot.exists:
        raise HTTPException(status_code=404, detail="Agent credentials not found")
        
    cred_data = cred_snapshot.to_dict()
    if not cred_data.get("active", False):
        raise HTTPException(status_code=403, detail="Agent credentials are not active")

    public_key_str = cred_data.get("public_key")
    if not public_key_str:
        raise HTTPException(status_code=500, detail="Public key not found in credentials")

    # Verify signature
    is_valid = verify_signature(public_key_str, signature_str, message)
    if not is_valid:
        log_audit(
            agent_id=agent_id,
            action=f"authorize_{action}",
            result="denied",
            reason="Invalid signature"
        )
        return JSONResponse({
            "agent_id": agent_id,
            "action": action,
            "authorized": False,
            "reason": "Invalid signature"
        })

    # Check permissions
    granted_actions = []
    if perm_snapshot.exists:
        granted_actions = perm_snapshot.to_dict().get("granted_actions", [])

    if action in granted_actions:
        log_audit(
            agent_id=agent_id,
            action=f"authorize_{action}",
            result="granted",
            reason="Action permitted"
        )
        return JSONResponse({
            "agent_id": agent_id,
            "action": action,
            "authorized": True
        })
    else:
        log_audit(
            agent_id=agent_id,
            action=f"authorize_{action}",
            result="denied",
            reason="Action not in granted permissions"
        )
        return JSONResponse({
            "agent_id": agent_id,
            "action": action,
            "authorized": False,
            "reason": "Action not permitted"
        })


@fastapi_app.get("/api/agents/{agent_id}/audit-log")
@fastapi_app.get("/agents/{agent_id}/audit-log")
async def get_agent_audit_log(agent_id: str, limit: int = 50):
    """
    Retrieve the audit log for a specific agent.
    """
    audit_ref = db.collection("audit_log")
    query = audit_ref.where("agent_id", "==", agent_id).order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
    results = query.stream()

    logs = []
    for doc in results:
        log_data = doc.to_dict()
        log_data["id"] = doc.id
        if "timestamp" in log_data and hasattr(log_data["timestamp"], "isoformat"):
            log_data["timestamp"] = log_data["timestamp"].isoformat()
        logs.append(log_data)

    return JSONResponse({
        "agent_id": agent_id,
        "audit_log": logs
    })


@fastapi_app.get("/api/audit-log")
@fastapi_app.get("/audit-log")
async def get_all_audit_logs(limit: int = 50):
    """
    Retrieve all audit logs, ordered by timestamp descending.
    Matches the array structure expected by the frontend's AuditLogViewer.
    """
    audit_ref = db.collection("audit_log")
    try:
        query = audit_ref.order_by("timestamp", direction=firestore.Query.DESCENDING).limit(limit)
        results = query.stream()
    except Exception as e:
        # If the index is not yet built, query without ordering and sort in Python as a fallback
        print(f"Firestore ordering failed, falling back to unordered retrieval: {e}")
        query = audit_ref.limit(limit)
        results = query.stream()

    logs = []
    for doc in results:
        log_data = doc.to_dict()
        log_data["id"] = doc.id
        if "timestamp" in log_data and hasattr(log_data["timestamp"], "isoformat"):
            log_data["timestamp"] = log_data["timestamp"].isoformat()
        if "agent_id" in log_data:
            log_data["agent"] = log_data["agent_id"]
        logs.append(log_data)

    # Sort in memory if the database query was not ordered
    if results and len(logs) > 0 and "timestamp" in logs[0] and not hasattr(results, 'params'):
        logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    return JSONResponse(logs)


@fastapi_app.get("/api/agents")
@fastapi_app.get("/agents")
async def list_agents():
    """
    List all agents with their permissions and credentials (excluding secret key hash).
    Matches the JSON array structure expected directly by App.jsx.
    """
    agents_ref = db.collection("agents")
    agents_snapshot = agents_ref.stream()

    agents_list = []
    for agent_doc in agents_snapshot:
        agent_id = agent_doc.id
        agent_data = agent_doc.to_dict()

        # Fetch permissions and credentials for this agent from root level
        perm_ref = db.collection("permissions").document(agent_id)
        cred_ref = db.collection("credentials").document(agent_id)

        perm_snapshot = perm_ref.get()
        cred_snapshot = cred_ref.get()

        perm_data = perm_snapshot.to_dict() if perm_snapshot.exists else {}
        cred_data = cred_snapshot.to_dict() if cred_snapshot.exists else {}

        # Merge data, exposing properties under both camelCase and snake_case for compatibility
        created_at_val = agent_data.get("created_at") or agent_data.get("createdAt")
        created_at_iso = None
        if created_at_val:
            created_at_iso = created_at_val.isoformat() if hasattr(created_at_val, "isoformat") else str(created_at_val)

        merged = {
            "id": agent_id,
            "agent_id": agent_id,
            "name": agent_data.get("name"),
            "owner": agent_data.get("owner_id"),
            "owner_id": agent_data.get("owner_id"),
            "purpose": agent_data.get("purpose"),
            "created_at": created_at_iso,
            "createdAt": created_at_iso,
            "status": agent_data.get("status", "active"),
            "permissions": perm_data.get("granted_actions", []),
            "credentials": {
                "public_key": cred_data.get("public_key"),
                "active": cred_data.get("active", False)
            }
        }
        agents_list.append(merged)

    return JSONResponse(agents_list)


@fastapi_app.delete("/api/agents/{agent_id}")
@fastapi_app.delete("/agents/{agent_id}")
async def revoke_agent(agent_id: str):
    """
    Revoke an agent by deleting/disabling credentials.
    """
    cred_ref = db.collection("credentials").document(agent_id)
    cred_snapshot = cred_ref.get()
    if not cred_snapshot.exists:
        raise HTTPException(status_code=404, detail="Agent credentials not found")

    cred_ref.update({
        "active": False
    })

    agent_ref = db.collection("agents").document(agent_id)
    agent_ref.update({
        "status": "revoked"
    })

    log_audit(
        agent_id=agent_id,
        action="revoke",
        result="success",
        reason="Agent credentials revoked"
    )

    return JSONResponse({
        "id": agent_id,
        "agent_id": agent_id,
        "message": f"Agent '{agent_id}' credentials successfully revoked."
    })


def log_audit(agent_id: str, action: str, result: str, reason: str = ""):
    """
    Helper function to log an audit entry.
    """
    try:
        audit_ref = db.collection("audit_log").document()  # auto-generated ID
        audit_ref.set({
            "timestamp": firestore.SERVER_TIMESTAMP,
            "agent_id": agent_id,
            "action": action,
            "result": result,
            "reason": reason
        })
    except Exception as e:
        print(f"Failed to log audit event: {e}")


# mangum handler for Google Cloud Functions python runtime
handler = Mangum(fastapi_app)

@functions_framework.http
def api(request):
    return handler(request)

@functions_framework.http
def app(request):
    # Defining entry point function 'app' to match firebase.json's rewrite function: "app"
    return handler(request)

if __name__ == "__main__":
    uvicorn.run("main:fastapi_app", host="0.0.0.0", port=8080, reload=True)