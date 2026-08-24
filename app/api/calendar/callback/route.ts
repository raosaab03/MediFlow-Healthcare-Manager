import { env } from "cloudflare:workers";
import { encryptSecret, verifyState } from "@/lib/secrets";

export async function GET(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_CLIENT_SECRET || !runtime.GOOGLE_REDIRECT_URI || !runtime.JOB_RUNNER_SECRET) return Response.json({ error: "Google Calendar OAuth credentials and JOB_RUNNER_SECRET are not configured" }, { status: 503 });
  const query = new URL(request.url).searchParams; const code = query.get("code"), state = query.get("state");
  if (!code || !state) return Response.json({ error: "OAuth code and state are required" }, { status: 400 });
  const verifiedState = await verifyState(state, runtime.JOB_RUNNER_SECRET);
  if (!verifiedState) return Response.json({ error: "Invalid OAuth state signature" }, { status: 400 });
  let account: { email?: string; issuedAt?: number }; try { account = JSON.parse(verifiedState) as typeof account; } catch { return Response.json({ error: "Invalid OAuth state" }, { status: 400 }); }
  if (!account.email || !account.issuedAt || Date.now()-account.issuedAt>10*60*1000) return Response.json({ error: "OAuth state is missing, invalid, or expired" }, { status: 400 });
  const body = new URLSearchParams({ code, client_id: runtime.GOOGLE_CLIENT_ID, client_secret: runtime.GOOGLE_CLIENT_SECRET, redirect_uri: runtime.GOOGLE_REDIRECT_URI, grant_type: "authorization_code" });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(12000) });
  if (!response.ok) return Response.json({ error: `Google token exchange failed with HTTP ${response.status}` }, { status: 502 });
  const token = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!token.access_token) return Response.json({ error: "Google did not return an access token" }, { status: 502 });
  const now = Math.floor(Date.now()/1000);
  const accessToken = await encryptSecret(token.access_token, runtime.JOB_RUNNER_SECRET);
  const refreshToken = token.refresh_token ? await encryptSecret(token.refresh_token, runtime.JOB_RUNNER_SECRET) : null;
  await env.DB.prepare("INSERT INTO calendar_connections (id, account_email, access_token, refresh_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(account_email) DO UPDATE SET access_token=excluded.access_token, refresh_token=COALESCE(excluded.refresh_token, calendar_connections.refresh_token), expires_at=excluded.expires_at").bind(crypto.randomUUID(), account.email, accessToken, refreshToken, now+(token.expires_in||3600), now).run();
  return Response.redirect(new URL("/?calendar=connected", request.url).toString(), 302);
}
