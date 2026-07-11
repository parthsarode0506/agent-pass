import os
import firebase_admin
from firebase_admin import credentials, firestore
import nacl.signing
import nacl.encoding
import bcrypt
from datetime import datetime, timezone

def main():
    # Initialize Firebase app (uses GOOGLE_APPLICATION_CREDENTIALS or emulator if configured)
    project_id = "rift-2ef56"
    os.environ["GCLOUD_PROJECT"] = project_id
    
    try:
        app = firebase_admin.get_app()
    except ValueError:
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
            print("Initialized Firebase using fallback emulator credentials.")

    db = firestore.client()

    # Seed default owner so registration API requests succeed
    owner_id = "owner_demo"
    owner_ref = db.collection("owners").document(owner_id)
    if not owner_ref.get().exists:
        owner_ref.set({
            "name": "Demo Owner",
            "created_at": datetime.now(timezone.utc)
        })
        print(f"Created default owner: {owner_id}")
    else:
        print(f"Owner '{owner_id}' already exists.")

    agents = [
        {
            "id": "TravelAgent",
            "owner_id": "owner_demo",
            "name": "TravelAgent",
            "purpose": "Manages travel bookings and calendar",
            "requested_permissions": ["calendar:read", "calendar:write", "calendar:create_event"]
        },
        {
            "id": "ShoppingAgent",
            "owner_id": "owner_demo",
            "name": "ShoppingAgent",
            "purpose": "Handles online shopping and payments",
            "requested_permissions": ["payments:read", "payments:make"]
        },
        {
            "id": "ResearchAgent",
            "owner_id": "owner_demo",
            "name": "ResearchAgent",
            "purpose": "Conducts research and reads data",
            "requested_permissions": ["data:read"]
        }
    ]

    created = []

    for agent_data in agents:
        agent_id = agent_data["id"]
        agent_ref = db.collection("agents").document(agent_id)
        snap = agent_ref.get()
        if snap.exists:
            print(f"Agent '{agent_id}' already exists. Skipping creation.")
            continue

        # Generate Ed25519 keypair
        signing_key = nacl.signing.SigningKey.generate()  # private key
        verify_key = signing_key.verify_key
        public_key = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode()
        secret_key = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode()

        # Hash secret key with bcrypt
        secret_hash = bcrypt.hashpw(secret_key.encode(), bcrypt.gensalt()).decode()

        now = datetime.now(timezone.utc)

        # Create agent document
        agent_ref.set({
            "owner_id": agent_data["owner_id"],
            "name": agent_data["name"],
            "purpose": agent_data["purpose"],
            "created_at": now,
            "updated_at": now,
            "status": "active"
        })

        # Create credentials document at root level (compatible with functions/main.py)
        cred_ref = db.collection("credentials").document(agent_id)
        cred_ref.set({
            "public_key": public_key,
            "secret_key_hash": secret_hash,
            "secret_hash": secret_hash,
            "active": True,
            "created_at": now,
            "issued_at": now
        })

        # Create permissions document at root level (compatible with functions/main.py)
        perm_ref = db.collection("permissions").document(agent_id)
        perm_ref.set({
            "granted_actions": agent_data["requested_permissions"],
            "updated_at": now
        })

        created.append((agent_id, secret_key))
        print(f"Created agent '{agent_id}' with public key {public_key}")

    # Output results
    if created:
        print("\n=== Created Agents (save these secret keys securely) ===")
        for agent_id, secret_key in created:
            print(f"Agent ID: {agent_id}")
            print(f"Secret Key: {secret_key}")
            print("---")
    else:
        print("\nNo new agents created (all already existed).")

if __name__ == "__main__":
    main()