# MediFlow System Design

## Core boundary

MediFlow separates synchronous clinical workflow from asynchronous integrations. Booking, rescheduling, leave, prescriptions, and summaries are authoritative database records. Email, Calendar, and reminder delivery are durable outbox jobs. This keeps the user-facing workflow responsive and prevents a temporary third-party failure from corrupting clinical state.

## Double-booking prevention

The database, not the UI, is the final concurrency authority. `appointments` has a unique index on `(doctor_name, scheduled_for)`. Availability reads are advisory: when simultaneous requests choose the same slot, both may initially see it, but only one insert can commit. The winner receives `201`; the loser maps the uniqueness violation to `409 Conflict` and refreshes alternatives. This works across multiple application instances because enforcement is inside D1.

Booking and its first email/Calendar outbox records execute in one D1 batch. Either all records commit or none do. A production refinement would use immutable `doctor_id`, UTC timestamps, timezone identifiers, and a partial uniqueness strategy that excludes cancelled appointments. Rescheduling would reserve the new slot before releasing the old one.

## Slot hold mechanism

Before symptom entry, the client requests a five-minute hold. A hold is represented by an appointment row with `status='held'` and `hold_expires_at`; it competes under the same doctor/slot uniqueness rule. Confirming changes the same row to `confirmed` only when its patient identifier matches and the hold has not expired. New hold requests remove expired reservations first. Server time is authoritative; a visible countdown is only guidance. Production deployment should replace demonstration patient identifiers with verified server-side identity.

## Doctor leave conflicts

Leave creation first identifies confirmed appointments for the doctor/date. In one atomic batch it inserts the unique leave record, changes each booking to `reschedule_required`, and creates an idempotent notification job for every affected patient. Notifications contain the previous appointment time. The original appointment is retained and is never silently moved. New bookings check leave before confirmation; stronger cross-request serialization and ranked replacement-slot suggestions are appropriate production refinements.

## Notification reliability

Direct provider calls never happen inside booking requests. A bearer-protected processing endpoint reads due outbox jobs, delivers SendGrid messages or Google Calendar changes, and persists delivery state. Failures use exponential backoff with jitter and become `dead_letter` after five attempts. Unique queue keys prevent duplicate insertion. Calendar records retain separate patient and doctor event IDs so rescheduling and cancellation target the correct provider resources. Integration failure does not roll back a valid appointment. Prescription frequency generates one, two, or three reminder jobs. A recurring external scheduler and provider credentials must be configured; worker leases, token renewal, and provider-side idempotency are production improvements.

## LLM reliability and safety

LLM calls sit behind a typed adapter. The pre-visit prompt requests only urgency, chief complaint, and three clinician questions; it explicitly forbids diagnosis and treats patient input as untrusted. Output is parsed, schema-validated, labelled with source/model/prompt version, and stored. Timeout, rate limit, malformed JSON, or missing credentials uses a deterministic fallback so the appointment remains usable. Red-flag term rules provide conservative escalation independent of the model. Doctors see the original symptoms beside the generated brief and remain responsible for assessment. Post-visit text is generated only from clinician-authored notes; it cannot invent medications or dosage, and the doctor approves it before patient release.

## Security and observability

The recruiter build uses clearly labelled demonstration role login, not production authentication or server-enforced record ownership. A real deployment must add verified identity, route-level authorization, audit logging, and healthcare-specific privacy controls before handling patient data. Google OAuth state is signed; provider tokens are AES-GCM encrypted and never returned to the browser. Health checks and durable queue states make infrastructure failures visible without blocking the clinical workflow.
