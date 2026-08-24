type RuntimeConfig = Record<string, string | undefined>;
type QueuePayload = Record<string, unknown>;

export async function sendTransactionalEmail(payload: QueuePayload, runtime: RuntimeConfig): Promise<{ delivered: boolean; provider: string; detail?: string }> {
  if (!runtime.SENDGRID_API_KEY || !runtime.SENDGRID_FROM_EMAIL) return { delivered: false, provider: "sendgrid", detail: "SENDGRID_API_KEY and SENDGRID_FROM_EMAIL must be configured" };
  const explicitRecipients = Array.isArray(payload.recipientEmails) ? payload.recipientEmails.filter((email): email is string => typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) : [];
  const recipients = [...new Set(explicitRecipients.length ? explicitRecipients : typeof payload.recipientEmail === "string" ? [payload.recipientEmail] : runtime.CLINIC_CONTACT_EMAIL ? [runtime.CLINIC_CONTACT_EMAIL] : [])];
  if (!recipients.length) return { delivered: false, provider: "sendgrid", detail: "A verified patient, doctor, or clinic recipient email is required" };
  const event = String(payload.event || "care.update");
  const subject = event === "booking.confirmed" ? "Your MediFlow appointment is confirmed" : event === "appointment.cancelled" ? "Your MediFlow appointment was cancelled" : event === "appointment.rescheduled" ? "Your MediFlow appointment was rescheduled" : event === "medication.reminder" ? "Your MediFlow medication reminder" : "An update from your MediFlow care team";
  const body = [`Hello ${String(payload.patientName || "there")},`, "", `Update: ${event.replaceAll(".", " ")}`, payload.doctorName ? `Clinician: ${String(payload.doctorName)}` : "", payload.scheduledFor ? `Appointment: ${String(payload.scheduledFor)}` : "", payload.medicationName ? `Medication: ${String(payload.medicationName)} ${String(payload.dosage || "")}` : "", "", "Your MediFlow care team"].filter(Boolean).join("\n");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${runtime.SENDGRID_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ personalizations: recipients.map(email => ({ to: [{ email }] })), from: { email: runtime.SENDGRID_FROM_EMAIL }, subject, content: [{ type: "text/plain", value: body }] }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) return { delivered: false, provider: "sendgrid", detail: `Provider returned HTTP ${response.status}` };
  return { delivered: true, provider: "sendgrid" };
}

export async function googleCalendarRequest(accessToken: string, method: "POST" | "PATCH" | "DELETE", payload: QueuePayload, eventId?: string): Promise<{ delivered: boolean; provider: string; eventId?: string; detail?: string }> {
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const url = eventId ? `${base}/${encodeURIComponent(eventId)}` : base;
  const scheduledFor = String(payload.scheduledFor || "").replace(" ", "T");
  const start = scheduledFor.length === 16 ? `${scheduledFor}:00` : scheduledFor;
  const date = new Date(start);
  const end = Number.isNaN(date.getTime()) ? start : new Date(date.getTime()+30*60*1000).toISOString();
  const body = method === "DELETE" ? undefined : JSON.stringify({ summary: `MediFlow: ${String(payload.patientName || "Patient")} with ${String(payload.doctorName || "Doctor")}`, description: "Healthcare consultation scheduled through MediFlow.", start: { dateTime: start, timeZone: "Asia/Kolkata" }, end: { dateTime: end, timeZone: "Asia/Kolkata" }, extendedProperties: { private: { mediflowAppointmentId: String(payload.appointmentId || "") } } });
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return { delivered: false, provider: "google-calendar", detail: `Google Calendar returned HTTP ${response.status}` };
  if (method === "DELETE") return { delivered: true, provider: "google-calendar" };
  const result = await response.json() as { id?: string };
  return { delivered: true, provider: "google-calendar", eventId: result.id };
}
