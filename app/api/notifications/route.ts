import { env } from "cloudflare:workers";
export async function GET() { try { const rows = await env.DB.prepare("SELECT id, appointment_id, channel, status, attempts, next_attempt_at FROM notification_jobs ORDER BY rowid DESC LIMIT 100").all(); return Response.json({ jobs: rows.results }); } catch { return Response.json({ error: "Notification queue unavailable" }, { status: 503 }); } }
