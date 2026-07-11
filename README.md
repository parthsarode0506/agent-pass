# AgentID — Agent Identity & Permission Verification Infrastructure

AgentID is a security verification system for AI agents, allowing you to register agents, assign cryptographic keys and permission profiles, and simulate action checks end-to-end. Every event is written live to **Cloud Firestore** and instantly visible in the Firebase Console.

---

## Architecture & Core Design

The system runs on **real Cloud Firestore** (no local emulators used).

1. **Deterministic Agent ID**: Formed server-side inside a Firestore transaction:
   `AGT-{AGENT_TYPE_SLUG}-{OWNER_SLUG}-{SEQUENCE_NUMBER}`
   e.g., first TravelAgent registered by Rahul gets the ID `AGT-TRAVELAGENT-RAHUL-001`.
2. **Ed25519 Cryptography**: Each agent gets an Ed25519 keypair. The public key is stored in Firestore, while the secret key is returned exactly **once** at registration.
3. **Multi-Doc References**: `agents`, `credentials`, and `permissions` use the **same generated Agent ID as their document ID**, making resource fetching fast and simple.
4. **Hardened Security Rules**: Strict read/write permissions prevent clients from altering registry details or forging audit log entries directly.

---

## Setup Steps

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (v3.11+)
- **Firebase CLI** installed (`npm install -g firebase-tools`)

### 2. Firestore Setup
1. Log in to Firebase:
   ```bash
   firebase login
   ```
2. Deploy the security rules and indexes directly to your live project:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes
   ```

### 3. Local Authentication for Firestore
To let your local FastAPI server authenticate with the real Cloud Firestore database, you need to configure Application Default Credentials (ADC) or a service account key.

- **Option A (Recommended)**: Log in via Google Cloud CLI:
  ```bash
  gcloud auth application-default login
  ```
- **Option B**: Download a Service Account JSON key from **Firebase Console → Project Settings → Service Accounts**, save it locally, and export the environment variable:
  ```powershell
  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
  ```

---

## Running the Application

To run the standalone FastAPI backend and the frontend React app simultaneously, open a PowerShell terminal and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-cloud.ps1
```

- **Backend**: Runs standalone on [http://localhost:8080](http://localhost:8080)
- **Frontend**: Runs on [http://localhost:5173](http://localhost:5173)

---

## Live Demo Walkthrough Scenarios

Open the interface at [http://localhost:5173](http://localhost:5173) and complete these three verification scenarios:

### Scenario 1: Genuine Agent with Permission (Succeeds)
1. Go to the **Register Agent** tab.
2. Fill out the form:
   - **Agent Name**: `TravelAgent`
   - **Owner Name**: `Rahul`
   - Check the permission: `booking:buy`
3. Click **Register Agent**.
4. Save the generated **Agent ID** (e.g. `AGT-TRAVELAGENT-RAHUL-001`) and the secret key displayed on the confirmation screen.
5. Go to the **Simulate Action** tab.
6. Select your new agent from the dropdown.
7. Select the action **`booking:buy`**.
8. Click **Run**.
9. Watch the animated sequence:
   - **Identity Check**: passes successfully ✓
   - **Permission Check**: passes successfully (since `booking:buy` was granted) ✓
   - **Final Result**: Access Granted (Green glow)
10. Open **Firebase Console → Firestore Database** and confirm that a matching record was appended to the `audit_log` collection.

### Scenario 2: Genuine Agent without Permission (Denied)
1. Go to the **Simulate Action** tab.
2. Select your `AGT-TRAVELAGENT-RAHUL-001` agent.
3. Select an action the agent does *not* have, such as **`payments:make`**.
4. Click **Run**.
5. Watch the animated sequence:
   - **Identity Check**: passes successfully ✓
   - **Permission Check**: fails (not in the granted list) ✗
   - **Final Result**: Access Denied (Red glow)
6. Check the **Audit Log** tab (or Firebase Console) to see the denied attempt recorded.

### Scenario 3: Fake/Unregistered Agent (Blocked at Step 1)
1. Go to the **Simulate Action** tab.
2. Click **Simulate Fake Agent**.
3. Watch the animated sequence:
   - **Identity Check**: fails immediately (Agent ID is not found in `credentials`) ✗
   - **Permission Check**: skipped entirely (never reaches the permission database) —
   - **Final Result**: Access Denied (Red glow)
4. Confirm the verification is recorded in the Audit Log as "Identity not verified".
