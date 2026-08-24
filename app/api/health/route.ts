import { env } from "cloudflare:workers";
export async function GET() { try { await env.DB.prepare("SELECT 1").first(); return Response.json({ status: "healthy", database: "connected", application: "MediFlow Healthcare Appointment Manager", timestamp: new Date().toISOString() }); } catch { return Response.json({ status: "degraded", database: "unavailable" }, { status: 503 }); } }
