"""
AgentID Backend — v2.0
FastAPI backend connecting to REAL Cloud Firestore (no emulator).

Local dev: set GOOGLE_APPLICATION_CREDENTIALS to your service account key path.
    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\\path\\to\\serviceAccountKey.json"
    python functions/main.py

All Firestore reads/writes go straight to the live cloud database.
"""

import os
import re
import base64
import hashlib
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import nacl.signing
import nacl.encoding
import nacl.exceptions

import json
import tempfile

# ---------------------------------------------------------------------------
# Firebase Admin SDK initialisation
#
# Supports three credential modes (checked in order):
#   1. GOOGLE_CREDENTIALS_JSON env var — full service account JSON as a string.
#      Used on Render.com and other cloud hosts where you can't upload files.
#   2. GOOGLE_APPLICATION_CREDENTIALS env var — path to a local key file.
#      Used during local development via run-cloud.ps1.
#   3. Default application credentials — used inside Cloud Functions / Cloud Run.
#
# IMPORTANT: Never set FIRESTORE_EMULATOR_HOST — always talk to real Cloud Firestore.
# ---------------------------------------------------------------------------
if not firebase_admin._apps:
    project_id = "rift-2ef56"
    os.environ["GCLOUD_PROJECT"] = project_id

    cred_json_str = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if cred_json_str:
        # Render.com / env-var credentials: write JSON to a temp file then load it
        cred_dict = json.loads(cred_json_str)
        tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False)
        json.dump(cred_dict, tmp)
        tmp.flush()
        cred = credentials.Certificate(tmp.name)
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    else:
        # Local dev (GOOGLE_APPLICATION_CREDENTIALS) or Cloud Functions (ADC)
        firebase_admin.initialize_app(options={"projectId": project_id})

db = firestore.client()

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="AgentID API", version="2.0.0")

# Allow the Vite dev server (localhost:5173) and Firebase Hosting to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert any string to an uppercase alphanumeric slug, e.g. 'TravelAgent' → 'TRAVELAGENT'."""
    return re.sub(r"[^A-Z0-9]", "", text.upper())


def generate_ed25519_keypair() -> tuple[str, str]:
    """
    Generate an Ed25519 keypair.
    Returns (public_key_hex, secret_key_hex).
    The secret key is returned exactly once and must never be stored raw.
    """
    signing_key = nacl.signing.SigningKey.generate()
    secret_hex = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
    public_hex = signing_key.verify_key.encode(encoder=nacl.encoding.HexEncoder).decode("utf-8")
    return public_hex, secret_hex


def hash_secret_key(secret_hex: str) -> str:
    """SHA-256 of the raw hex secret key — the only thing we ever store."""
    return hashlib.sha256(secret_hex.encode("utf-8")).hexdigest()


def verify_ed25519_signature(public_key_hex: str, signature_b64: str, message: str) -> bool:
    """
    Verify an Ed25519 signature.
    public_key_hex : 64-char hex string (32 bytes)
    signature_b64  : base64-encoded 64-byte signature
    message        : the original plain-text string that was signed
    """
    try:
        verify_key = nacl.signing.VerifyKey(bytes.fromhex(public_key_hex))
        sig_bytes = base64.b64decode(signature_b64)
        verify_key.verify(message.encode("utf-8"), sig_bytes)
        return True
    except Exception as exc:
        print(f"[verify_ed25519_signature] failed: {exc}")
        return False


def generate_risk_note(agent_id: str, action: str, identity_passed: bool, permission_passed: bool) -> str:
    """
    Generate a dynamic, security-oriented risk note.
    Runs a history query to add contextual intelligence.
    """
    if not identity_passed:
        return "CRITICAL: Connection refused. Signature missing, invalid, or credential revoked."
        
    # Query history
    try:
        # Resolve generator
        history = list(db.collection("audit_log").where("agent_id", "==", agent_id).limit(10).get())
        past_actions = [doc.to_dict().get("action") for doc in history]
    except Exception as exc:
        print(f"[generate_risk_note] History query failed: {exc}")
        past_actions = []

    is_payment = action in ["payments:make", "booking:buy"]
    has_past_payment = any(a in ["payments:make", "booking:buy"] for a in past_actions)

    if not permission_passed:
        return f"BLOCKED: Action '{action}' attempted without required permission profile."

    if is_payment and not has_past_payment and len(past_actions) > 0:
        return "WARNING: Unusual payment attempt from an agent that has only ever performed read/browse actions."
    
    # Check if there are only registrations or no past attempts
    valid_past = [a for a in past_actions if a != "register"]
    if len(valid_past) == 0:
        return "NEW AGENT: This is the very first action attempt recorded for this agent profile."

    return "Identity signature verified. Normal transaction profile with zero anomalies detected."


def write_audit_log(
    agent_id: str,
    agent_name: str,
    action: str,
    identity_check: bool,
    permission_check,   # bool | None  (None = skipped because identity failed)
    result: str,        # "granted" | "denied"
    reason: str,
    risk_note: str = "",
) -> None:
    """Append one audit log entry to Firestore with an auto-generated doc ID."""
    db.collection("audit_log").add({
        "agent_id": agent_id,
        "agent_name": agent_name,
        "action": action,
        "identity_check": identity_check,
        "permission_check": permission_check,
        "result": result,
        "reason": reason,
        "risk_note": risk_note,
        "timestamp": datetime.now(timezone.utc),
    })


def ts_to_iso(obj: dict) -> dict:
    """Convert any Firestore Timestamp values in a dict to ISO strings for JSON serialization."""
    for key, val in obj.items():
        if hasattr(val, "isoformat"):
            obj[key] = val.isoformat()
    return obj


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    """Quick liveness check."""
    return {"status": "ok", "version": "2.0.0"}


# ─── Register a new agent ────────────────────────────────────────────────────

@app.post("/api/agents/register")
async def register_agent(request: Request):
    """
    Register a new agent.

    Request body:
        {
            "name": "TravelAgent",
            "owner": "Rahul",
            "purpose": "Manages travel bookings",
            "permissions": ["booking:buy", "calendar:write"]
        }

    Agent ID generation rule (server-side, inside a transaction):
        AGT-{AGENT_TYPE_SLUG}-{OWNER_SLUG}-{SEQUENCE_NUMBER}
        e.g. AGT-TRAVELAGENT-RAHUL-001

    Returns the auto-generated Agent ID and the one-time secret key.
    Store the secret key — it is never retrievable again.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    name = (data.get("name") or "").strip()
    owner = (data.get("owner") or "").strip()
    purpose = (data.get("purpose") or "").strip()
    permissions = [p for p in (data.get("permissions") or []) if isinstance(p, str)]

    if not name:
        raise HTTPException(status_code=400, detail="'name' is required")
    if not owner:
        raise HTTPException(status_code=400, detail="'owner' is required")

    agent_type_slug = slugify(name)
    owner_slug = slugify(owner)

    # --- Use a counter document to atomically assign the next sequence number ---
    # counters/{prefix} stores { count: N } for each (agent_type_slug, owner_slug) pair.
    counter_key = f"{agent_type_slug}-{owner_slug}"
    counter_ref = db.collection("counters").document(counter_key)

    # Generate the keypair BEFORE the transaction (pure in-memory, no I/O)
    public_key_hex, secret_key_hex = generate_ed25519_keypair()
    secret_key_hash = hash_secret_key(secret_key_hex)
    now = datetime.now(timezone.utc)

    @firestore.transactional
    def create_in_transaction(tx):
        counter_snap = next(tx.get(counter_ref))
        seq = (counter_snap.get("count") + 1) if counter_snap.exists else 1
        agent_id = f"AGT-{agent_type_slug}-{owner_slug}-{seq:03d}"

        # Prevent duplicate IDs (should never happen given the transaction, but belt-and-suspenders)
        agent_ref = db.collection("agents").document(agent_id)
        if next(tx.get(agent_ref)).exists:
            raise HTTPException(status_code=409, detail=f"Agent '{agent_id}' already exists. This should not happen — please try again.")

        # Update counter
        tx.set(counter_ref, {"count": seq})

        # Write agents/{agent_id}
        tx.set(agent_ref, {
            "name": name,
            "owner": owner,
            "purpose": purpose,
            "agent_type_slug": agent_type_slug,
            "owner_slug": owner_slug,
            "sequence_number": seq,
            "status": "active",
            "created_at": now,
        })

        # Write credentials/{agent_id} — never returned to client except the public key
        tx.set(db.collection("credentials").document(agent_id), {
            "public_key": public_key_hex,
            "secret_key_hash": secret_key_hash,
            "issued_at": now,
            "active": True,
        })

        # Write permissions/{agent_id}
        tx.set(db.collection("permissions").document(agent_id), {
            "granted_actions": permissions,
        })

        return agent_id

    transaction = db.transaction()
    agent_id = create_in_transaction(transaction)

    # Write registration audit entry (outside the transaction is fine)
    write_audit_log(
        agent_id=agent_id,
        agent_name=name,
        action="register",
        identity_check=True,
        permission_check=None,
        result="granted",
        reason="Agent registered successfully",
    )

    return JSONResponse({
        "agent_id": agent_id,
        "name": name,
        "owner": owner,
        "purpose": purpose,
        "permissions": permissions,
        "status": "active",
        "created_at": now.isoformat(),
        # ⚠ Secret key shown ONCE — store it securely, it cannot be retrieved again
        "secret_key": secret_key_hex,
        "message": "Agent registered. Store the secret key — it will not be shown again.",
    }, status_code=201)


# ─── Attempt an action (two-step identity + permission check) ────────────────

@app.post("/api/agents/{agent_id}/attempt-action")
async def attempt_action(agent_id: str, request: Request):
    """
    Two-step verification for an agent attempting an action.

    Request body:
        {
            "action": "booking:buy",
            "signature": "<base64 ed25519 sig, optional>",
            "message": "<signed message string, optional>"
        }

    Step 1 — Identity Check:
      - credentials/{agent_id} must exist and have active == true
      - If signature + message are provided, the signature is verified against
        the stored public key (this is the genuine identity proof)
      - Without a signature, credential existence alone passes the check
        (demo mode — real agents always sign)

    Step 2 — Permission Check (only runs if Step 1 passes):
      - action must be in permissions/{agent_id}.granted_actions

    Either way, an audit_log entry is written and a structured response
    with identity_check, permission_check, result, and reason is returned.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    action = (data.get("action") or "").strip()
    signature = data.get("signature")
    message = data.get("message")

    if not action:
        raise HTTPException(status_code=400, detail="'action' is required")

    # Best-effort agent name fetch for audit log display
    agent_snap = db.collection("agents").document(agent_id).get()
    agent_name = agent_snap.to_dict().get("name", agent_id) if agent_snap.exists else agent_id

    # ─── Step 1: Identity ───────────────────────────────────────────────────
    cred_snap = db.collection("credentials").document(agent_id).get()
    identity_passed = False
    identity_reason = ""

    if not cred_snap.exists:
        identity_reason = "Agent not found — no credentials registered for this ID"
    else:
        cred = cred_snap.to_dict()
        if not cred.get("active", False):
            identity_reason = "Agent credentials have been revoked"
        elif signature and message:
            # Full cryptographic identity proof
            if verify_ed25519_signature(cred.get("public_key", ""), signature, message):
                identity_passed = True
                identity_reason = "Identity verified via Ed25519 signature ✓"
            else:
                identity_reason = "Signature verification failed — invalid or forged"
        else:
            # Demo mode: credential existence is sufficient
            identity_passed = True
            identity_reason = "Identity verified — agent credentials are active ✓"

    if not identity_passed:
        risk_note = generate_risk_note(agent_id, action, False, False)
        write_audit_log(agent_id, agent_name, action, False, None, "denied", identity_reason, risk_note)
        return JSONResponse({
            "agent_id": agent_id,
            "action": action,
            "identity_check": False,
            "identity_reason": identity_reason,
            "permission_check": None,
            "permission_reason": "Skipped — identity check failed",
            "result": "denied",
            "reason": identity_reason,
            "risk_note": risk_note,
        })

    # ─── Step 2: Permission ─────────────────────────────────────────────────
    perm_snap = db.collection("permissions").document(agent_id).get()
    permission_passed = False
    permission_reason = ""

    if not perm_snap.exists:
        permission_reason = "No permissions record found for this agent"
    else:
        granted = perm_snap.to_dict().get("granted_actions", [])
        if action in granted:
            permission_passed = True
            permission_reason = f"'{action}' is in the agent's granted permissions ✓"
        else:
            permission_reason = (
                f"'{action}' is not granted. "
                f"Agent has: [{', '.join(granted) or 'none'}]"
            )

    final_result = "granted" if permission_passed else "denied"
    risk_note = generate_risk_note(agent_id, action, True, permission_passed)
    write_audit_log(agent_id, agent_name, action, True, permission_passed, final_result, permission_reason, risk_note)

    return JSONResponse({
        "agent_id": agent_id,
        "action": action,
        "identity_check": True,
        "identity_reason": identity_reason,
        "permission_check": permission_passed,
        "permission_reason": permission_reason,
        "result": final_result,
        "reason": permission_reason,
        "risk_note": risk_note,
    })


# ─── Parse natural language permissions ──────────────────────────────────────

@app.post("/api/agents/parse-permissions")
async def parse_permissions(request: Request):
    """
    Parse a natural language description of permissions into structured checkboxes.
    """
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
        
    text = (data.get("text") or "").strip().lower()
    
    # Define keyword mappings to permission IDs
    mappings = {
        "web:browse": ["browse", "internet", "web", "surf", "read pages"],
        "booking:buy": ["buy", "purchase", "booking", "ticket", "hotel", "flight"],
        "calendar:write": ["write calendar", "create event", "add calendar", "schedule", "modify calendar"],
        "calendar:read": ["read calendar", "view calendar", "check calendar", "calendar events"],
        "email:read": ["read email", "inbox", "view email", "check email"],
        "payments:make": ["pay", "payment", "make payment", "wire", "transfer money", "credit card"],
        "data:read": ["read data", "fetch data", "view data", "query data"],
        "files:write": ["write file", "save file", "create file", "export file"]
    }
    
    granted = []
    denied = []
    
    # Split the sentence by clauses or separators to analyze negatives vs positives
    clauses = re.split(r"[;.,]|\band\b|\bbut\b", text)
    for clause in clauses:
        is_negative = any(neg in clause for neg in ["never", "dont", "don't", "no ", "cannot", "can't", "except", "block", "restrict", "prevent"])
        for perm_id, keywords in mappings.items():
            if any(kw in clause for kw in keywords):
                if is_negative:
                    denied.append(perm_id)
                else:
                    granted.append(perm_id)
                    
    # Exclude denied permissions from granted ones
    granted = list(set(granted) - set(denied))
    
    # Special catch-all
    if "all" in text or "every" in text:
        granted = list(mappings.keys())
        
    return JSONResponse({"permissions": granted})


# ─── List all agents ─────────────────────────────────────────────────────────

@app.get("/api/agents")
async def list_agents():
    """
    Return all registered agents with their permissions and credential status merged in.
    Credentials collection is never returned — only the boolean active/revoked status.
    """
    result = []
    for doc in db.collection("agents").stream():
        agent = ts_to_iso(doc.to_dict())
        agent["id"] = doc.id

        perm_snap = db.collection("permissions").document(doc.id).get()
        agent["permissions"] = perm_snap.to_dict().get("granted_actions", []) if perm_snap.exists else []

        cred_snap = db.collection("credentials").document(doc.id).get()
        agent["credential_active"] = cred_snap.to_dict().get("active", False) if cred_snap.exists else False

        result.append(agent)

    result.sort(key=lambda a: a.get("created_at", ""), reverse=True)
    return JSONResponse(result)


# ─── Audit log endpoints ──────────────────────────────────────────────────────

@app.get("/api/audit-log")
async def get_audit_log():
    """Full audit history across all agents, newest first (max 200 entries)."""
    logs = []
    try:
        query = db.collection("audit_log").order_by(
            "timestamp", direction=firestore.Query.DESCENDING
        ).limit(200)
        for doc in query.stream():
            entry = ts_to_iso(doc.to_dict())
            entry["id"] = doc.id
            logs.append(entry)
    except Exception:
        # Fallback if index isn't built yet — sort in-memory
        for doc in db.collection("audit_log").limit(200).stream():
            entry = ts_to_iso(doc.to_dict())
            entry["id"] = doc.id
            logs.append(entry)
        logs.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return JSONResponse(logs)


@app.get("/api/agents/{agent_id}/audit-log")
async def get_agent_audit_log(agent_id: str):
    """Audit history for one agent, newest first."""
    logs = []
    try:
        query = (
            db.collection("audit_log")
            .where("agent_id", "==", agent_id)
            .order_by("timestamp", direction=firestore.Query.DESCENDING)
            .limit(100)
        )
        for doc in query.stream():
            entry = ts_to_iso(doc.to_dict())
            entry["id"] = doc.id
            logs.append(entry)
    except Exception:
        for doc in db.collection("audit_log").where("agent_id", "==", agent_id).limit(100).stream():
            entry = ts_to_iso(doc.to_dict())
            entry["id"] = doc.id
            logs.append(entry)
        logs.sort(key=lambda e: e.get("timestamp", ""), reverse=True)
    return JSONResponse(logs)


# ─── Revoke an agent ─────────────────────────────────────────────────────────

@app.post("/api/agents/{agent_id}/revoke")
async def revoke_agent(agent_id: str):
    """
    Revoke an agent's credentials.
    Sets credentials/{agent_id}.active = false and agents/{agent_id}.status = "revoked".
    All future identity checks for this agent will fail.
    """
    cred_ref = db.collection("credentials").document(agent_id)
    if not cred_ref.get().exists:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")

    cred_ref.update({"active": False})
    db.collection("agents").document(agent_id).update({"status": "revoked"})

    write_audit_log(
        agent_id=agent_id,
        agent_name=agent_id,
        action="revoke",
        identity_check=True,
        permission_check=None,
        result="granted",
        reason="Agent credentials revoked by administrator",
    )
    return JSONResponse({"agent_id": agent_id, "status": "revoked"})


# ---------------------------------------------------------------------------
# Firebase Cloud Functions HTTP entrypoint
# The function name "app" must match firebase.json → hosting.rewrites[0].function
# Uses a2wsgi to bridge FastAPI's ASGI interface to the WSGI interface that
# functions_framework expects.
# ---------------------------------------------------------------------------
try:
    import functions_framework
    from a2wsgi import ASGIMiddleware as _ASGIMiddleware

    _wsgi_app = _ASGIMiddleware(app)

    @functions_framework.http
    def app_cf(request):  # named differently to avoid shadowing FastAPI app
        """Cloud Functions HTTP entry-point."""
        return _wsgi_app(request.environ, lambda s, h: None)

    # Alias so firebase.json → "function: app" resolves correctly
    app = app_cf  # type: ignore[assignment]
except ImportError:
    pass  # Not running in Cloud Functions — local dev uses uvicorn below


# ---------------------------------------------------------------------------
# Local development entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("Starting AgentID backend on http://localhost:8080")
    print("Connecting to REAL Cloud Firestore (rift-2ef56)")
    print("Set GOOGLE_APPLICATION_CREDENTIALS if not already configured.")
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)