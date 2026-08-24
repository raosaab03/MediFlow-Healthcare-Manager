import { env } from "cloudflare:workers";
import { generatePreVisitSummary } from "@/lib/ai";
export async function POST(request: Request) {
  let body: { symptoms?: string }; try { body = await request.json() as { symptoms?: string }; } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.symptoms?.trim()) return Response.json({ error: "symptoms is required" }, { status: 400 });
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json({ summary: await generatePreVisitSummary(body.symptoms.trim(), runtime.OPENAI_API_KEY, runtime.OPENAI_MODEL) });
}
