# MediFlow - Healthcare Appointment & Follow-up Manager

MediFlow is a full-stack healthcare operations platform with purpose-built patient, doctor, and administrator workspaces. It turns appointment booking into a connected care workflow: symptoms are structured into a safe AI visit brief, doctors create patient-friendly follow-up guidance, prescriptions become medication reminders, and operational updates are tracked through a reliable notification outbox.

The standout capability is **Care Continuity Intelligence**. Instead of treating booking, medication adherence, clinical urgency, and follow-up as separate screens, it combines them into an explainable care-continuity signal and surfaces the next useful action to the patient and clinic team.

## Product walkthrough

The application opens on a dedicated, matte-finish role selection and sign-in screen. Choose Patient, Doctor, or Administrator; the matching demonstration credentials are filled automatically. Signing in opens only the selected account's role-owned workspace. Use **Switch account** or **Sign out** to return to the account selection screen.

| Workspace | Demo email | Demo password | Available account views |
| --- | --- | --- | --- |
| Patient | `patient@mediflow.health` | `Patient@123` | Personal health profile, appointment history, saved card/UPI methods, invoices, prescriptions |
| Doctor | `doctor@mediflow.health` | `Doctor@123` | Verified clinician profile, assigned patient appointments, earnings and payout account |
| Administrator | `admin@mediflow.health` | `Admin@123` | Organisation profile, clinic-wide scheduling, collections, settlements and refunds |

These sign-in credentials are intentionally public demonstration credentials for a recruiter-facing prototype; they are not a production identity or access-control system.

- **Patient portal:** personal profile, specialist search, five-minute database-backed slot holds, symptom intake, real appointment persistence, appointment history, saved Visa/UPI payment prototypes, invoices, and an interactive care-navigation chatbot.
- **Doctor workspace:** practitioner profile, assigned appointments, urgency-labelled AI briefs, three suggested clinical questions, saved post-visit notes, persisted prescriptions, patient-friendly summaries, and frequency-based medication reminders.
- **Admin operations:** organisation profile, database-backed doctor creation, working hours and slot duration, leave-conflict resolution, affected-patient notifications, clinic-wide appointment records, and retry/dead-letter queue visibility.

All displayed people and clinical data are fictional demonstration records.

## Architecture

```mermaid
flowchart TD
    UI[Role-based Next.js UI] --> API[Vinext API routes]
    API --> D1[(Cloudflare D1)]
    API --> AI[LLM adapter + safe fallback]
    API --> OUTBOX[Transactional notification outbox]
    OUTBOX --> EMAIL[Email provider]
    OUTBOX --> CAL[Google Calendar OAuth]
    OUTBOX --> MED[Medication reminders]
```

## Technology

- Next.js 16, React 19, TypeScript, Vinext, and responsive custom CSS
- Cloudflare D1 with Drizzle ORM migrations
- Atomic D1 batches for appointment + outbox consistency
- Optional OpenAI-compatible LLM adapter with structured validation and deterministic fallback
- Working SendGrid delivery adapter, protected outbox processor, and Google Calendar OAuth/event synchronization; provider credentials and account consent are required for live delivery
- Cloudflare Sites deployment

## Local setup

Prerequisites: Node.js 22.13+, npm, Linux/WSL with `flock`, `curl`, and GNU `timeout`.

```bash
git clone <repository-url>
cd mediflow-healthcare-manager
npm ci
cp .env.example .env.local
npm run db:generate
npm run test:care
npm run dev
```

Open the development URL printed by Vite. For local D1 testing, use the binding simulation already configured by the Vinext starter. Never commit `.env.local`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | No | Enables model-generated chatbot replies, visit briefs, and post-visit summaries. Safe fallback is used when absent or unavailable. |
| `OPENAI_MODEL` | No | Model identifier; defaults to `gpt-4o-mini`. |
| `SENDGRID_API_KEY` | For live email | Transactional email delivery. |
| `SENDGRID_FROM_EMAIL` | For live email | Verified sender address. |
| `GOOGLE_CLIENT_ID` | For calendar sync | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | For calendar sync | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | For calendar sync | Exact OAuth callback URL. |
| `GOOGLE_CALENDAR_TIMEZONE` | No | Clinic timezone; defaults to `Asia/Kolkata`. |
| `JOB_RUNNER_SECRET` | For background jobs | Authorises scheduled queue processing. |
| `CLINIC_CONTACT_EMAIL` | Recommended for live email | Fallback recipient when an individual recipient is unavailable. |

## Database schema

| Table | Responsibility | Key protection |
| --- | --- | --- |
| `users` | Identity and patient/doctor/admin role | Unique email |
| `doctors` | Speciality, hours, slot duration, calendar state | User foreign key |
| `appointments` | Slot, symptoms, urgency, summaries, status, hold expiry | Unique `(doctor_name, scheduled_for)` |
| `doctor_leaves` | Doctor/date leave records | Unique doctor/date |
| `prescriptions` | Medication, dosage, frequency, duration | Appointment foreign key |
| `notification_jobs` | Durable email, calendar, and reminder outbox | Unique idempotency key |
| `calendar_connections` | Per-account OAuth credentials | Unique account email; encrypted access and refresh tokens |
| `calendar_events` | Provider event IDs per appointment/account | Unique appointment/account pair |

Migrations are in `drizzle/0000_last_tusk.sql` and `drizzle/0001_married_paper_doll.sql`; the typed schema is in `db/schema.ts`.

## API reference

### `GET /api/health`

Reports application and D1 health.

### `GET /api/appointments`

Returns recent appointment records. Optional query parameters: `patientName` or `doctorName`.

### `POST /api/slots/hold`

Creates an exclusive five-minute, database-backed appointment hold. Expired holds are cleaned before a new reservation; competing requests receive `409`.

### `POST /api/appointments`

Atomically creates an appointment and queues email + calendar jobs.

```json
{
  "doctorName": "Dr. Ananya Sharma",
  "patientName": "Rhea Kapoor",
  "patientEmail": "rhea.kapoor@example.com",
  "doctorEmail": "ananya.sharma@mediflow.health",
  "scheduledFor": "2026-08-25 14:30",
  "symptoms": "Intermittent chest discomfort for four days",
  "urgency": "high"
}
```

Responses: `201` confirmed, `400` validation error, `409` slot conflict, `503` safe infrastructure failure.

### `PATCH /api/appointments`

Use `{ "id": "appointment-id", "action": "cancel" }`, or send `"action": "reschedule"` with `"newScheduledFor"`. Both operations queue email and calendar updates transactionally.

### `GET /api/doctors` and `POST /api/doctors`

List/search doctors or persist a new clinician, specialty, working hours, and appointment slot duration.

### `POST /api/ai/summary`, `/api/ai/chat`, and `/api/ai/post-visit`

Generate a structured pre-visit brief, an interactive care-navigation reply, or a patient-friendly clinical summary. Every endpoint validates its response and returns a safe deterministic fallback when no model key is configured.

### `GET /api/visits` and `POST /api/visits`

Read a completed appointment's prescriptions, or persist clinician notes, medications, generated follow-up guidance, and frequency-based medication reminder jobs in a single database batch.

### `POST /api/leave`

Creates doctor leave, marks same-day confirmed bookings `reschedule_required`, and queues one idempotent affected-patient notification per appointment in a single atomic batch.

### `GET /api/notifications`

Returns operational queue state for administrator visibility.

### `POST /api/jobs/process`

Processes up to 25 due email, medication, and calendar jobs. Requires `Authorization: Bearer <JOB_RUNNER_SECRET>`. Failed deliveries retry with exponential backoff and become dead-lettered after five attempts. Configure an external scheduler to call this protected endpoint regularly:

```bash
curl -X POST http://localhost:3000/api/jobs/process \
  -H "Authorization: Bearer YOUR_JOB_RUNNER_SECRET"
```

### `GET /api/calendar/connect` and `GET /api/calendar/callback`

Start Google OAuth with `/api/calendar/connect?email=patient@example.com`. The signed callback stores encrypted tokens per connected patient/doctor account. Queued booking, rescheduling, and cancellation jobs create, update, or delete the corresponding provider events.

## LLM prompts and safety

Prompts are versionable constants in `lib/ai.ts`. The pre-visit prompt requires strict JSON, uses a low temperature, declares patient text untrusted, disallows diagnosis, and explicitly escalates red-flag symptom categories. Output is shape-validated. Timeout, provider error, malformed output, or a missing key routes to the deterministic fallback; booking never depends on model availability.

The post-visit prompt forbids invented diagnoses, medication, or dosages and requests plain-language follow-up and urgent-care guidance. In production, store the prompt version and model alongside each output for auditability. A clinician remains responsible for the source notes and final summary.

## Google Calendar OAuth 2.0 setup

1. Create a Google Cloud project and enable Google Calendar API.
2. Configure the OAuth consent screen with the minimum calendar event scope.
3. Create a Web application OAuth client.
4. Add local and deployed `/api/calendar/callback` redirect URIs exactly.
5. Put credentials in local environment variables; use encrypted hosted secrets in production.
6. Open `/api/calendar/connect?email=patient@example.com` for the patient, then repeat for the doctor; approve access for both Google accounts.
7. The callback stores AES-GCM-encrypted tokens server-side and separate event IDs for each account. No tokens are stored in browser storage.
8. Schedule `/api/jobs/process` to execute queued create, update, and delete operations. Refresh-token rotation and long-running token renewal should be added before production deployment.

## Email and reminder processing

The booking write and notification jobs are committed together. The protected processing endpoint picks due jobs, sends them, and marks them delivered. Failures use exponential backoff with jitter (approximately 1, 5, 20, and 60 minutes), five maximum attempts, and a dead-letter state visible to the admin. Unique outbox keys prevent duplicate queue insertion. Prescription frequency creates one, two, or three daily reminder jobs. A recurring external scheduler, verified SendGrid sender, and connected Google accounts are necessary for unattended real-world delivery.

## Role-based authentication

The recruiter-facing application uses clearly labelled demonstration role sign-in and role-specific presentation. It does **not** implement production patient registration, verified identity, server-side sessions, or record-level authorization. Before handling real healthcare information, integrate a trusted identity provider, map identities to `users.role`, enforce ownership in every server route, and audit privileged writes. UI visibility alone is not authorization.

## Integration readiness and honest limitations

| Capability | Included in this submission | External requirement |
| --- | --- | --- |
| Chatbot, symptom brief, and post-visit summary | Functional immediately with tested safe fallback | `OPENAI_API_KEY` for genuine model-generated responses |
| Booking, holds, leave, doctors, visits, and prescriptions | Functional database-backed application routes | Working D1 binding and applied migrations |
| Email and medication reminders | SendGrid adapter, durable queue, retries, protected processor | Verified SendGrid credentials and recurring scheduler |
| Google Calendar | OAuth consent, signed state, encrypted token storage, per-account event sync | Google OAuth credentials, patient/doctor account consent, recurring scheduler |
| Login and payment methods | Polished role-login and payment UX prototypes | Real identity provider/authorization and payment gateway for production |

## Failure behaviour

- LLM unavailable: validated deterministic summary, clearly marked `fallback`.
- Concurrent bookings: database uniqueness makes exactly one request win; others receive `409`.
- Email/calendar unavailable: booking succeeds, outbox retries independently.
- Doctor leave conflict: affected bookings change state and notifications enter the same transaction.
- Partial database failure: D1 batch rolls back appointment and its initial side effects together.

See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for the evaluation-focused design write-up.

## Submission checklist

- Complete source and lockfile
- `.env.example`
- API, database, prompts, and Calendar setup documented
- Generated migration committed
- Responsive three-role experience
- Seven automated AI safety, fallback, encryption, and OAuth-signature tests: `npm run test:care`
- Hosted URL
- System design under 800 words

## License and healthcare disclaimer

Assignment demonstration only. MediFlow is not a diagnostic tool and is not production-certified for handling protected health information without a formal security, privacy, clinical safety, and compliance review.
