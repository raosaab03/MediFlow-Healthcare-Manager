import { env } from "cloudflare:workers";
export async function POST(request: Request) {
  let body: { doctorName?: string; date?: string; reason?: string }; try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.doctorName || !body.date) return Response.json({ error: "doctorName and date are required" }, { status: 400 });
  try {
    const affected = await env.DB.prepare("SELECT id, patient_name, scheduled_for FROM appointments WHERE doctor_name = ? AND scheduled_for LIKE ? AND status = 'confirmed'").bind(body.doctorName, `${body.date}%`).all<{ id: string; patient_name: string; scheduled_for: string }>();
    const statements = [env.DB.prepare("INSERT INTO doctor_leaves (id, doctor_id, leave_date, reason, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), body.doctorName, body.date, body.reason || null, Math.floor(Date.now()/1000)), ...affected.results.flatMap(row => [env.DB.prepare("UPDATE appointments SET status = 'reschedule_required' WHERE id = ?").bind(row.id), env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, idempotency_key) VALUES (?, ?, 'email', ?, 'pending', 0, ?)").bind(crypto.randomUUID(), row.id, JSON.stringify({ event: "doctor.leave", patientName: row.patient_name, doctorName: body.doctorName, previousTime: row.scheduled_for }), `leave-${body.date}-${row.id}`)])];
    await env.DB.batch(statements); return Response.json({ leaveDate: body.date, affectedAppointments: affected.results.length, notificationsQueued: affected.results.length, appointments: affected.results }, { status: 201 });
  } catch (error) { const detail = error instanceof Error ? error.message : ""; return Response.json({ error: detail.toLowerCase().includes("unique") ? "Leave already exists for this doctor and date" : "Leave update failed safely" }, { status: detail.toLowerCase().includes("unique") ? 409 : 503 }); }
}
