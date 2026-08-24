import { env } from "cloudflare:workers";
import { generatePostVisitSummary } from "@/lib/ai";

type Medicine = { medicationName?: string; dosage?: string; frequency?: string; durationDays?: number; instructions?: string };
type VisitRequest = { appointmentId?: string; doctorName?: string; patientName?: string; notes?: string; medications?: Medicine[] };

function medicationTimes(frequency: string): string[] { if (/three|3|thrice/i.test(frequency)) return ["08:00", "14:00", "20:00"]; if (/twice|2|two/i.test(frequency)) return ["08:00", "20:00"]; return ["08:00"]; }

export async function GET(request: Request) {
  const appointmentId = new URL(request.url).searchParams.get("appointmentId");
  if (!appointmentId) return Response.json({ error: "appointmentId is required" }, { status: 400 });
  try { const appointment = await env.DB.prepare("SELECT id, doctor_name, patient_name, status, post_visit_summary FROM appointments WHERE id = ? LIMIT 1").bind(appointmentId).first(); const medicines = await env.DB.prepare("SELECT * FROM prescriptions WHERE appointment_id = ?").bind(appointmentId).all(); return Response.json({ appointment, prescriptions: medicines.results }); } catch { return Response.json({ error: "Visit details are temporarily unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  let body: VisitRequest; try { body = await request.json() as VisitRequest; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body.appointmentId || !body.notes?.trim()) return Response.json({ error: "appointmentId and notes are required" }, { status: 400 });
  const medicines = Array.isArray(body.medications) ? body.medications.filter(item => item.medicationName?.trim() && item.dosage?.trim() && item.frequency?.trim()).slice(0, 15) : [];
  const labels = medicines.map(item => `${item.medicationName} ${item.dosage} — ${item.frequency} for ${Math.max(1, Math.min(item.durationDays || 7, 90))} days${item.instructions ? `; ${item.instructions}` : ""}`);
  const runtime = env as unknown as Record<string, string | undefined>;
  const summary = await generatePostVisitSummary(body.notes.trim(), labels, runtime.OPENAI_API_KEY, runtime.OPENAI_MODEL);
  try {
    const appointment = await env.DB.prepare("SELECT id, doctor_name, patient_name FROM appointments WHERE id = ? LIMIT 1").bind(body.appointmentId).first<{id:string;doctor_name:string;patient_name:string}>();
    if (!appointment) return Response.json({ error: "Appointment not found. Book an appointment before completing a visit." }, { status: 404 });
    const now = Math.floor(Date.now()/1000);
    const operations: ReturnType<typeof env.DB.prepare>[] = [env.DB.prepare("UPDATE appointments SET status = 'completed', post_visit_summary = ? WHERE id = ?").bind(JSON.stringify(summary), appointment.id)];
    for (const medicine of medicines) {
      const prescriptionId = crypto.randomUUID();
      const duration = Math.max(1, Math.min(medicine.durationDays || 7, 90));
      operations.push(env.DB.prepare("INSERT INTO prescriptions (id, appointment_id, medication_name, dosage, frequency, duration_days, instructions) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(prescriptionId, appointment.id, medicine.medicationName!, medicine.dosage!, medicine.frequency!, duration, medicine.instructions || null));
      for (const [index, time] of medicationTimes(medicine.frequency!).entries()) {
        const payload = JSON.stringify({ event: "medication.reminder", patientName: appointment.patient_name, doctorName: appointment.doctor_name, medicationName: medicine.medicationName, dosage: medicine.dosage, frequency: medicine.frequency, scheduledTime: time, durationDays: duration });
        operations.push(env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'medication', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointment.id, payload, now + (index + 1) * 3600, `medication-${prescriptionId}-${time}`));
      }
    }
    operations.push(env.DB.prepare("INSERT INTO notification_jobs (id, appointment_id, channel, payload, status, attempts, next_attempt_at, idempotency_key) VALUES (?, ?, 'email', ?, 'pending', 0, ?, ?)").bind(crypto.randomUUID(), appointment.id, JSON.stringify({ event: "visit.completed", patientName: appointment.patient_name, doctorName: appointment.doctor_name, summary }), now, `post-visit-email-${appointment.id}-${now}`));
    await env.DB.batch(operations);
    return Response.json({ appointmentId: appointment.id, summary, prescriptionsCreated: medicines.length, medicationRemindersQueued: operations.length - medicines.length - 2 }, { status: 201 });
  } catch { return Response.json({ error: "Visit could not be completed; no partial prescription was saved" }, { status: 503 }); }
}
