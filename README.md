<<<<<<< HEAD
# SIH25018 — Nabha Rural Telemedicine Platform

A complete, production-grade, offline-first telemedicine platform designed for rural healthcare delivery in India. Optimized for low-bandwidth networks, intermittent connectivity, ASHA field workers, doctors, patients, and health administrators.


## 1. What Was Built



## 2. Full Workflow for Every Role

### Role 1: PATIENT Workflow
```text
1. Public Self-Registration / Login
   └─► Accesses /patient-registration.html or /login.html
   └─► Enters name, mobile, age, gender, village, address, emergency contact
   └─► Account created instantly with PATIENT role & auto-generated Patient Code (NAB-XXXXXX)

2. Patient Health Portal (/patient-dashboard.html)
   └─► Views personal medical history, past vitals charts, and upcoming appointments
   └─► Changes interface language (English, Hindi, Punjabi)

3. Self-Reporting Vitals & Symptoms
   └─► Inputs current symptoms or vitals (SpO2, Blood Pressure, Temperature)
   └─► Triggers AI Preliminary Triage for immediate guidance

4. Prescription Access
   └─► Views issued digital prescriptions and downloads printable PDF Rx documents

5. Emergency Escalation
   └─► One-tap emergency escalation trigger (/emergency.html) alerting local ASHA and health center
```


### Role 2: ASHA FIELD WORKER Workflow (Primary Rural Field Application)
```text
1. Login & Operational Scope
   └─► Admin provisions account (/api/v1/admin/asha/invite) binding ASHA to Health Center & Village
   └─► ASHA logs in via mobile/email and password on /login.html

2. Offline-First Patient Onboarding
   └─► Opens /patient-registration.html in rural field (with or without WAN internet)
   └─► Data saved instantly to local IndexedDB store (nabhaTelemedicine)
   └─► Assigned human-friendly Patient Code (e.g. NAB-104928)

3. Vitals & Clinical Data Collection
   └─► Records patient SpO2, Systolic/Diastolic BP, Heart Rate, Temperature, and symptoms
   └─► Saved offline in Sync Queue with unique operationId

4. AI Preliminary Triage Request
   └─► Requests AI triage assessment (/api/v1/ai/triage)
   └─► System calculates Risk Level (LOW, MODERATE, HIGH, EMERGENCY) with clinical warnings

5. Consultation Scheduling & Assistance
   └─► Books teleconsultation appointment for patient (/appointments.html)
   └─► Assists patient during live video/audio session with Duty Doctor (/consultation.html)

6. Sync Center Management (/sync.html)
   └─► Monitors sync queue states (✓ Synced, ⚠ Saved Offline, ↻ Synchronizing)
   └─► Auto-sync flushes operations to central PostgreSQL backend upon network restoration
```


### Role 3: DOCTOR Workflow
```text
1. Application & Admin Verification
   └─► Doctor submits application via /login.html -> "Apply as Doctor"
   └─► Submits MBBS/MD qualification, medical license number, specialization, and experience
   └─► Account registered with status PENDING (No doctor permissions granted initially)
   └─► Admin verifies credentials and approves application -> Role upgraded to DOCTOR, status ACTIVE

2. Doctor Portal & Consultation Queue (/doctor-dashboard.html)
   └─► Views real-time consultation queue sorted by AI Triage Risk Priority (EMERGENCY -> HIGH -> MODERATE -> LOW)
   └─► Inspects patient medical history, vitals history, and ASHA field notes

3. Teleconsultation Session (/consultation.html)
   └─► Initiates video consultation (Agora/Zoom) or falls back to audio/phone call
   └─► Records real-time clinical notes during the session

4. Diagnosis & Digital Prescription Generation (/prescription.html)
   └─► Formulates diagnosis and adds medicine items (dosage, frequency, duration, instructions)
   └─► Server-side PDF engine generates official digital prescription document
   └─► Consultation state updated: IN_PROGRESS -> COMPLETED
```


### Role 4: HEALTH ADMINISTRATOR Workflow
```text
1. Secure Administrative Login
   └─► Authenticates on /login.html using administrative credentials
   └─► System grants system-wide or organization-wide operational scope

2. Doctor Application Review Workflow (/admin-dashboard.html)
   └─► Views pending doctor applications
   └─► Inspects medical council registration numbers & qualifications
   └─► Approves application (Upgrades user to DOCTOR, sets ACTIVE status, logs audit event) or Rejects with notes

3. ASHA Account Provisioning
   └─► Invites/provisions ASHA accounts
   └─► Binds ASHA to specific Health Center (PHC/CHC) and assigned Village

4. User Account Lifecycle Management
   └─► Manages user account states (ACTIVE, SUSPENDED, REJECTED, DEACTIVATED)

5. District Health Analytics & Audit Monitoring
   └─► Monitors district consultation volume, high-risk triage cases, and sync queue health
   └─► Reviews security & operational audit logs (/api/v1/admin/audit-logs)
```


## 3. Monorepo Directory Structure

```text
nabha-telemedicine/
├── frontend/                   # Offline-first PWA frontend (Port 8000)
│   ├── index.html
│   ├── login.html
│   ├── patient-dashboard.html
│   ├── asha-dashboard.html
│   ├── doctor-dashboard.html
│   ├── admin-dashboard.html
│   ├── patient-registration.html
│   ├── patient-profile.html
│   ├── consultation.html
│   ├── appointments.html
│   ├── prescription.html
│   ├── sync.html
│   ├── emergency.html
│   ├── offline.html
│   ├── manifest.json
│   ├── service-worker.js
│   ├── css/                    # Modular stylesheets (variables, responsive, accessibility)
│   └── js/                     # Application logic, IndexedDB, Sync engine, API Gateway
│
├── backend/                    # Node.js/Express REST API (Port 5000)
│   ├── src/
│   │   ├── config/             # Environment validator & PostgreSQL pool
│   │   ├── controllers/        # Route controllers (Auth, Onboarding, Patient, Consultation, Sync, Admin)
│   │   ├── middleware/         # JWT Auth, RBAC, Center Scope, Rate limit, Request ID
│   │   ├── routes/             # Versioned routes (/api/v1/)
│   │   ├── services/           # Business logic & PDF builder
│   │   ├── repositories/       # Data access repositories (NAB-XXXXXX patient codes)
│   │   └── integrations/       # AI, Video, and IVR providers
│   ├── tests/                  # Integration & Onboarding security test suites
│   ├── package.json
│   └── README.md
│
├── ai-service/                 # Python FastAPI AI Triage Microservice (Port 8001)
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint & CORS
│   │   ├── models/schemas.py   # Pydantic schemas
│   │   ├── services/triage_service.py # Clinical triage engine
│   │   └── routes/triage.py    # Triage route endpoint
│   ├── tests/test_triage.py   # Pytest suite
│   ├── requirements.txt
│   └── README.md
│
├── worker/                     # Background Job Worker Microservice
│   ├── src/worker.js           # Asynchronous task processor
│   ├── package.json
│   └── README.md
│
├── gateway/                    # Local Health Center Gateway Component (Port 8080)
│   ├── src/gateway.js          # WAN outage resilience proxy
│   └── README.md
│
├── database/                   # Schema migrations & seed files
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_multicenter_schema.sql
│   │   └── 003_onboarding_schema.sql
│   └── seed/seed_data.sql
│
├── docs/                       # Engineering specifications & operational runbooks
│   ├── PRODUCTION_READINESS_AUDIT.md
│   ├── NABHA_PILOT_DEPLOYMENT.md
│   ├── USER_ONBOARDING.md
│   ├── PRODUCTION_ARCHITECTURE.md
│   ├── DISASTER_RECOVERY.md
│   ├── OPERATIONS.md
│   ├── MONITORING.md
│   └── INCIDENT_RESPONSE.md
│
├── docker-compose.yml          # Multi-container orchestration stack
└── README.md                   # Master monorepo documentation
```


## 4. Demo Credentials

| Role | Mobile Number | Password / OTP | Default Portal Route |
| :--- | :--- | :--- | :--- |
| **ASHA Worker** | `9876543211` | `[removed demo OTP/password]` | `/asha-dashboard.html` |
| **Doctor** | `9876543210` | `[removed demo password]` | `/doctor-dashboard.html` |
| **Patient** | `9876543212` | `[removed demo OTP/password]` | `/patient-dashboard.html` |
| **Administrator** | `9876543213` | `[removed demo password]` | `/admin-dashboard.html` |


## 5. Local Execution Guide

### Step 1: Run Frontend Static Server (Port 8000)
```bash
cd frontend
python -m http.server 8000
```
Open **`http://localhost:8000/index.html`** in any browser.

### Step 2: Run Backend REST Server (Port 5000)
```bash
cd backend
npm install
npm test
npm start
```
API root active at **`http://localhost:5000/api/v1`**, interactive Swagger docs at **`http://localhost:5000/api-docs`**.

### Step 3: Run Python FastAPI AI Microservice (Port 8001)
```bash
cd ai-service
pip install -r requirements.txt
pytest
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001
```
Interactive FastAPI docs active at **`http://localhost:8001/docs`**.


## 6. Docker Deployment

Launch the multi-container stack (PostgreSQL + Node Backend + Python AI Service):
```bash
docker compose up --build -d
```


## 7. Testing Results Overview



## 8. Prototype Disclaimer & Medical Safety Notice

This system is an engineering prototype developed for the SIH25018 Problem Statement. AI preliminary triage assessments are strictly labeled as **"AI-assisted preliminary triage ONLY"** and do not constitute a definitive diagnosis. Final clinical decisions belong to qualified medical professionals.
## Docker startup

Run from the repository root:

```powershell
docker compose up --build
```

The migration service is built from the repository root so it can access the canonical `database/migrations/` directory. It must complete successfully before the backend starts.

If you previously ran a failed migration container, rerun the same `docker compose up --build` command; Compose will recreate the migration service when its image changes.


## 4.0.1 production dashboard release
This release consolidates role dashboards, professional verification, private credential documents, notifications, audit history, appointment/consultation lifecycle hooks, dashboard timeout/retry handling, production fail-closed AI/video behavior, migration tracking, container health checks, and PostgreSQL backup tooling. See `docs/RELEASE_V4_0_0.md`.

## Consultation Workflow v5.0
Patient doctor selection is disabled. Patients submit consultation requests; active approved administrators assign doctors; assigned doctors accept requests; only then can the doctor start the consultation/video session. Clinical documentation is saved against the assigned appointment/request and is released to the patient when the consultation is completed. Every state transition creates notifications and an audit event.

## Consultation workflow (v5)

Patients do not select doctors. The controlled workflow is:

`Patient request -> Admin notification -> Admin assigns approved doctor -> Doctor accepts -> Doctor starts -> Patient joins -> Doctor records clinical notes -> Doctor completes -> Patient receives released clinical record`

The request, assignment, acceptance, start and completion states are persisted in the database and linked through `consultation_requests`, `appointments` and `consultations`.

See `docs/CONSULTATION_WORKFLOW.md` for the state machine and security rules.
=======
# Telemedicine-
This is an aid to villages
>>>>>>> origin/main
