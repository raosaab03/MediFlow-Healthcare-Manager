import { env } from "cloudflare:workers";
import { generatePostVisitSummary } from "@/lib/ai";

export async function POST(request: Request) {
  let body: { notes?: string; medications?: string[] }; try { body = await request.json() as typeof body; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  if (!body.notes?.trim()) return Response.json({ error: "notes is required" }, { status: 400 });
  const medications = Array.isArray(body.medications) ? body.medications.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json({ summary: await generatePostVisitSummary(body.notes.trim(), medications, runtime.OPENAI_API_KEY, runtime.OPENAI_MODEL) });
}
