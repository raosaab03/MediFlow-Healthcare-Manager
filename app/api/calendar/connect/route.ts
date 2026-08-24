import { env } from "cloudflare:workers";
import { signState } from "@/lib/secrets";

export async function GET(request: Request) {
  const runtime = env as unknown as Record<string, string | undefined>;
  if (!runtime.GOOGLE_CLIENT_ID || !runtime.GOOGLE_REDIRECT_URI || !runtime.JOB_RUNNER_SECRET) return Response.json({ error: "GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI, and JOB_RUNNER_SECRET must be configured before connecting Calendar", configured: false }, { status: 503 });
  const email = new URL(request.url).searchParams.get("email")?.trim();
  if (!email) return Response.json({ error: "email is required" }, { status: 400 });
  const state = await signState(JSON.stringify({ email, nonce: crypto.randomUUID(), issuedAt: Date.now() }), runtime.JOB_RUNNER_SECRET);
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", runtime.GOOGLE_CLIENT_ID); target.searchParams.set("redirect_uri", runtime.GOOGLE_REDIRECT_URI); target.searchParams.set("response_type", "code"); target.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events"); target.searchParams.set("access_type", "offline"); target.searchParams.set("prompt", "consent"); target.searchParams.set("state", state);
  return Response.redirect(target.toString(), 302);
}
