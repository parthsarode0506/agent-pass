import os
import hashlib
from datetime import datetime, timezone
import firebase_admin
from firebase_admin import credentials, firestore
import nacl.signing
import nacl.encoding

def generate_ed25519_keypair():
    signing_key = nacl.signing.SigningKey.generate()
    verify_key = signing_key.verify_key
    public_key_hex = verify_key.encode(encoder=nacl.encoding.HexEncoder).decode('utf-8')
    secret_key_hex = signing_key.encode(encoder=nacl.encoding.HexEncoder).decode('utf-8')
    return public_key_hex, secret_key_hex

def hash_secret_key(secret_key_hex: str) -> str:
    return hashlib.sha256(secret_key_hex.encode('utf-8')).hexdigest()

def main():
    project_id = "rift-2ef56"
    os.environ["GCLOUD_PROJECT"] = project_id
    
    # Resolve ADC path from Firebase CLI profile
    appdata = os.environ.get("APPDATA", "")
    adc_path = os.path.join(appdata, "firebase", "parthsarode05_gmail_com_application_default_credentials.json")
    if os.path.exists(adc_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = adc_path

    try:
        firebase_admin.initialize_app()
    except Exception as exc:
        print(f"Failed to initialize Firebase Admin: {exc}")
        return

    db = firestore.client()

    agents = [
        {
            "id": "AGT-TRAVELAGENT-RAHUL-001",
            "name": "TravelAgent",
            "owner": "Rahul",
            "purpose": "Manages calendar operations and hotel searches",
            "permissions": ["calendar:read", "calendar:write", "web:browse"],
            "agent_type_slug": "TRAVELAGENT",
            "owner_slug": "RAHUL",
            "seq": 1
        },
        {
            "id": "AGT-SHOPPINGAGENT-RAHUL-001",
            "name": "ShoppingAgent",
            "owner": "Rahul",
            "purpose": "Handles secure purchases and online commerce transactions",
            "permissions": ["payments:make", "booking:buy", "web:browse"],
            "agent_type_slug": "SHOPPINGAGENT",
            "owner_slug": "RAHUL",
            "seq": 1
        },
        {
            "id": "AGT-RESEARCHAGENT-RAHUL-001",
            "name": "ResearchAgent",
            "owner": "Rahul",
            "purpose": "Reads general data and index documents",
            "permissions": ["data:read"],
            "agent_type_slug": "RESEARCHAGENT",
            "owner_slug": "RAHUL",
            "seq": 1
        }
    ]

    print(f"Connecting to live Firestore database ({project_id})...")
    created = []

    for agent_data in agents:
        agent_id = agent_data["id"]
        agent_ref = db.collection("agents").document(agent_id)
        
        if agent_ref.get().exists:
            print(f"Agent '{agent_id}' already exists. Skipping.")
            continue

        public_key_hex, secret_key_hex = generate_ed25519_keypair()
        secret_key_hash = hash_secret_key(secret_key_hex)
        now = datetime.now(timezone.utc)

        # Write to agents/
        agent_ref.set({
            "name": agent_data["name"],
            "owner": agent_data["owner"],
            "purpose": agent_data["purpose"],
            "agent_type_slug": agent_data["agent_type_slug"],
            "owner_slug": agent_data["owner_slug"],
            "sequence_number": agent_data["seq"],
            "status": "active",
            "created_at": now
        })

        # Write to credentials/
        db.collection("credentials").document(agent_id).set({
            "public_key": public_key_hex,
            "secret_key_hash": secret_key_hash,
            "issued_at": now,
            "active": True
        })

        # Write to permissions/
        db.collection("permissions").document(agent_id).set({
            "granted_actions": agent_data["permissions"]
        })

        created.append((agent_id, secret_key_hex))
        print(f"Seeded agent: {agent_id}")

    if created:
        print("\n=== SEEDED ED25519 PRIVATE KEYS ===")
        for agent_id, sec_key in created:
            print(f"Agent ID: {agent_id}")
            print(f"Secret Key (Hex): {sec_key}")
            print("---")
    else:
        print("\nAll seed agents already exist in database.")

if __name__ == "__main__":
    main()