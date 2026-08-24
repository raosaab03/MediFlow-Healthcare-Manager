import { env } from "cloudflare:workers";

type DoctorInput = { name?: string; email?: string; specialty?: string; slotDurationMinutes?: number; workingHours?: string };

export async function GET(request: Request) {
  try {
    const specialty = new URL(request.url).searchParams.get("specialty")?.trim();
    const statement = specialty ? env.DB.prepare("SELECT d.id, u.name, u.email, d.specialty, d.working_hours, d.slot_duration_minutes, d.calendar_connected FROM doctors d JOIN users u ON u.id = d.user_id WHERE lower(d.specialty) LIKE lower(?) ORDER BY u.name").bind(`%${specialty}%`) : env.DB.prepare("SELECT d.id, u.name, u.email, d.specialty, d.working_hours, d.slot_duration_minutes, d.calendar_connected FROM doctors d JOIN users u ON u.id = d.user_id ORDER BY u.name");
    const rows = await statement.all(); return Response.json({ doctors: rows.results });
  } catch { return Response.json({ error: "Doctor profiles are temporarily unavailable" }, { status: 503 }); }
}

export async function POST(request: Request) {
  let input: DoctorInput; try { input = await request.json() as DoctorInput; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const name = input.name?.trim(), email = input.email?.trim().toLowerCase(), specialty = input.specialty?.trim();
  if (!name || !email || !specialty || !email.includes("@")) return Response.json({ error: "A valid name, email address, and specialty are required" }, { status: 400 });
  const duration = Math.max(10, Math.min(input.slotDurationMinutes || 30, 120));
  const userId = crypto.randomUUID(), doctorId = crypto.randomUUID(), now = Math.floor(Date.now()/1000);
  const hours = JSON.stringify({ display: input.workingHours?.trim() || "Mon–Fri, 9:00 AM–5:00 PM" });
  try { await env.DB.batch([env.DB.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, 'doctor', ?)").bind(userId,email,name,now),env.DB.prepare("INSERT INTO doctors (id, user_id, specialty, working_hours, slot_duration_minutes, calendar_connected) VALUES (?, ?, ?, ?, ?, 0)").bind(doctorId,userId,specialty,hours,duration)]); return Response.json({ doctor: { id: doctorId, name, email, specialty, slotDurationMinutes: duration, workingHours: JSON.parse(hours) } }, { status: 201 }); } catch (error) { const message=error instanceof Error?error.message:""; return Response.json({ error: message.toLowerCase().includes("unique")?"A doctor with this email address already exists":"Doctor profile could not be saved" },{status:message.toLowerCase().includes("unique")?409:503}); }
}
