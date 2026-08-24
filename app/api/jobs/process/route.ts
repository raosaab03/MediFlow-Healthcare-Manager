import { env } from "cloudflare:workers";
import { googleCalendarRequest, sendTransactionalEmail } from "@/lib/integrations";
import { decryptSecret } from "@/lib/secrets";

type Job = { id: string; appointment_id: string | null; channel: "email" | "calendar" | "medication"; payload: string; attempts: number; idempotency_key: string };

export async function POST(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.JOB_RUNNER_SECRET || request.headers.get("authorization") !== `Bearer ${runtime.JOB_RUNNER_SECRET}`) return Response.json({ error: "A valid job-runner bearer token is required" }, { status: 401 });
  const now = Math.floor(Date.now()/1000);
  try {
    const jobs = await env.DB.prepare("SELECT id, appointment_id, channel, payload, attempts, idempotency_key FROM notification_jobs WHERE status IN ('pending', 'retrying') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY rowid ASC LIMIT 25").bind(now).all<Job>();
    let delivered = 0, retrying = 0, deadLetter = 0;
    for (const job of jobs.results) {
      const payload = JSON.parse(job.payload) as Record<string, unknown>;
      let result: { delivered: boolean; provider: string; eventId?: string; detail?: string };
      try {
        if (job.channel === "email" || job.channel === "medication") result = await sendTransactionalEmail(payload, runtime);
        else {
          const connections = await env.DB.prepare("SELECT account_email, access_token FROM calendar_connections ORDER BY created_at DESC LIMIT 25").all<{ account_email: string; access_token: string }>();
          const accountEmails = Array.isArray(payload.accountEmails) ? payload.accountEmails.filter((email): email is string => typeof email === "string") : [];
          const connectedAccounts = accountEmails.length ? connections.results.filter(connection => accountEmails.includes(connection.account_email)) : connections.results;
          if (!connectedAccounts.length) result = { delivered: false, provider: "google-calendar", detail: "No matching patient or doctor Google Calendar account is connected" };
          else {
            result = { delivered: true, provider: "google-calendar" };
            for (const connection of connectedAccounts) {
              const existing = job.appointment_id ? await env.DB.prepare("SELECT provider_event_id FROM calendar_events WHERE appointment_id = ? AND account_email = ? LIMIT 1").bind(job.appointment_id, connection.account_email).first<{ provider_event_id: string }>() : null;
              const event = String(payload.event || "");
              const method = event.includes("cancel") ? "DELETE" : existing ? "PATCH" : "POST";
              if (method === "DELETE" && !existing) continue;
              const accessToken = await decryptSecret(connection.access_token, runtime.JOB_RUNNER_SECRET!);
              const accountResult = await googleCalendarRequest(accessToken, method, payload, existing?.provider_event_id);
              if (!accountResult.delivered) { result = accountResult; break; }
              if (accountResult.eventId && !existing && job.appointment_id) await env.DB.prepare("INSERT INTO calendar_events (id, appointment_id, account_email, provider_event_id, created_at) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), job.appointment_id, connection.account_email, accountResult.eventId, now).run();
              if (method === "DELETE" && existing && job.appointment_id) await env.DB.prepare("DELETE FROM calendar_events WHERE appointment_id = ? AND account_email = ?").bind(job.appointment_id, connection.account_email).run();
            }
          }
        }
      } catch (error) { result = { delivered: false, provider: job.channel, detail: error instanceof Error ? error.message : "Provider request failed" }; }
      const attempts = job.attempts + 1;
      if (result.delivered) { await env.DB.prepare("UPDATE notification_jobs SET status = 'delivered', attempts = ?, next_attempt_at = NULL WHERE id = ?").bind(attempts, job.id).run(); delivered++; }
      else if (attempts >= 5) { await env.DB.prepare("UPDATE notification_jobs SET status = 'dead_letter', attempts = ?, next_attempt_at = NULL WHERE id = ?").bind(attempts, job.id).run(); deadLetter++; }
      else { const delay = [60,300,1200,3600][Math.min(attempts-1,3)] + Math.floor(Math.random()*30); await env.DB.prepare("UPDATE notification_jobs SET status = 'retrying', attempts = ?, next_attempt_at = ? WHERE id = ?").bind(attempts, now+delay, job.id).run(); retrying++; }
    }
    return Response.json({ processed: jobs.results.length, delivered, retrying, deadLetter, checkedAt: new Date().toISOString() });
  } catch { return Response.json({ error: "Notification job processing is temporarily unavailable" }, { status: 503 }); }
}
