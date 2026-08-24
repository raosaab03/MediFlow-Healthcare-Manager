import { env } from "cloudflare:workers";
import { generatePreVisitSummary } from "@/lib/ai";

type Booking = { id?: string; doctorName?: string; patientName?: string; patientEmail?: string; doctorEmail?: string; scheduledFor?: string; symptoms?: string; urgency?: string; action?: "cancel" | "reschedule"; newScheduledFor?: string };

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const doctor = query.get("doctorName")?.trim();
    const patient = query.get("patientName")?.trim();
    const statement = doctor ? env.DB.prepare("SELECT * FROM appointments WHERE doctor_name = ? ORDER BY created_at DESC LIMIT 100").bind(doctor) : patient ? env.DB.prepare("SELECT * FROM appointments WHERE patient_name = ? ORDER BY created_at DESC LIMIT 100").bind(patient) : env.DB.prepare("SELECT * FROM appointments ORDER BY created_at DESC LIMIT 100");
    const rows = await statement.all();
    return Response.json({ appointments: rows.results });
  } catch { return Response.json({ error: "Appointments are temporarily unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  let body: Booking; try { body = await request.json() as Booking; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const doctorName = body.doctorName?.trim(), patientName = body.patientName?.trim(), scheduledFor = body.scheduledFor?.trim(), symptoms = body.symptoms?.trim();
  if (!doctorName || !patientName || !scheduledFor || !symptoms) return Response.json({ error: "doctorName, patientName, scheduledFor, and symptoms are required" }, { status: 400 });
  const leaveDate = scheduledFor.split(" ")[0];
  try {
    const leave = await env.DB.prepare("SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ? LIMIT 1").bind(doctorName, leaveDate).first();
    if (leave) return Response.json({ error: "This doctor is on leave for the selected date. Please choose a different appointment." }, { status: 409 });
    const runtime = env as unknown as Record<string, string | undefined>;
    const summary = await generatePreVisitSummary(symptoms, runtime.OPENAI_API_KEY, runtime.OPENAI_MODEL);
    const urgency = ["low", "medium", "high"].includes(body.urgency || "") ? body.urgency! : summary.urgency;
    const now = Math.floor(Date.now() / 1000);
    const existingHold = await env.DB.prepare("SELECT id, patient_name, status, hold_expires_at FROM appointments WHERE doctor_name = ? AND scheduled_for = ? LIMIT 1").bind(doctorName, scheduledFor).first<{id:string;patient_name:string;status:string;hold_expires_at:number|null}>();
    if(existingHold&&!(existingHold.status==="held"&&existingHold.patient_name===patientName&&(existingHold.hold_expires_at||0)>now))return Response.json({error:"This slot is already reserved or booked. Choose another time."},{status:409});
    const appointmentId = existingHold?.id || crypto.randomUUID();
    const recipients = [body.patientEmail, body.doctorEmail].filter((email): email is string => typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
    const emailPayload = JSON.stringify({ event: "booking.confirmed", patientName, doctorName, scheduledFor, urgency, recipientEmails: recipients });
    const calendarPayload = JSON.stringify({ event: "calendar.create", patientName, doctorName, scheduledFor, appointmentId, accountEmails: recipients });
    await env.DB.batch([
      existingHold?env.DB.prepare("UPDATE appointments SET status = 'confirmed', symptoms = ?, urgency = ?, pre_visit_summary = ?, hold_expires_at = NULL WHERE id = ? AND status = 'held'").bind(symptoms,urgency,JSON.stringify(summary),appointmentId):env.DB.prepare("INSERT INTO appointments (id, doctor_name, patient_name, scheduled_for, status, symptoms, urgency, pre_visit_summary, created_at) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?)").bind(appointmentId, doctorName, patientName, scheduledFor, symptoms, urgency, JSON.stringify(summary), now),
      env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'email', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointmentId, emailPayload, now, `booking-email-${appointmentId}`),
      env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'calendar', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointmentId, calendarPayload, now, `booking-calendar-${appointmentId}`),
    ]);
    return Response.json({ appointment: { id: appointmentId, doctorName, patientName, scheduledFor, urgency, status: "confirmed", preVisitSummary: summary }, notificationsQueued: 2 }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : ""; return Response.json({ error: message.toLowerCase().includes("unique") ? "This slot was just booked. Choose another time." : "Booking failed safely; no partial appointment was saved." }, { status: message.toLowerCase().includes("unique") ? 409 : 503 }); }
}

export async function PATCH(request: Request) {
  let body: Booking; try { body = await request.json() as Booking; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body.id || !body.action || !["cancel", "reschedule"].includes(body.action)) return Response.json({ error: "id and a valid action (cancel or reschedule) are required" }, { status: 400 });
  try {
    const appointment = await env.DB.prepare("SELECT id, doctor_name, patient_name, scheduled_for, status FROM appointments WHERE id = ? LIMIT 1").bind(body.id).first<{id:string;doctor_name:string;patient_name:string;scheduled_for:string;status:string}>();
    if (!appointment) return Response.json({ error: "Appointment not found" }, { status: 404 });
    if (appointment.status === "cancelled") return Response.json({ error: "This appointment is already cancelled" }, { status: 409 });
    const now = Math.floor(Date.now()/1000);
    const changing = body.action === "reschedule";
    if (changing && !body.newScheduledFor?.trim()) return Response.json({ error: "newScheduledFor is required when rescheduling" }, { status: 400 });
    const nextTime = changing ? body.newScheduledFor!.trim() : appointment.scheduled_for;
    if (changing) {
      const leave = await env.DB.prepare("SELECT id FROM doctor_leaves WHERE doctor_id = ? AND leave_date = ? LIMIT 1").bind(appointment.doctor_name, nextTime.split(" ")[0]).first();
      if (leave) return Response.json({ error: "The doctor is on leave for the new appointment date" }, { status: 409 });
    }
    const event = changing ? "appointment.rescheduled" : "appointment.cancelled";
    const payload = JSON.stringify({ event, appointmentId: appointment.id, patientName: appointment.patient_name, doctorName: appointment.doctor_name, previousTime: appointment.scheduled_for, scheduledFor: nextTime });
    const update = changing ? env.DB.prepare("UPDATE appointments SET scheduled_for = ?, status = 'confirmed' WHERE id = ?").bind(nextTime, appointment.id) : env.DB.prepare("UPDATE appointments SET status = 'cancelled' WHERE id = ?").bind(appointment.id);
    await env.DB.batch([update, env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'email', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointment.id, payload, now, `${event}-email-${appointment.id}-${now}`), env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'calendar', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointment.id, payload, now, `${event}-calendar-${appointment.id}-${now}`)]);
    return Response.json({ appointment: { id: appointment.id, status: changing ? "confirmed" : "cancelled", scheduledFor: nextTime }, notificationsQueued: 2 });
  } catch (error) { const message = error instanceof Error ? error.message : ""; return Response.json({ error: message.toLowerCase().includes("unique") ? "The requested slot is already booked" : "Appointment change failed safely" }, { status: message.toLowerCase().includes("unique") ? 409 : 503 }); }
}
