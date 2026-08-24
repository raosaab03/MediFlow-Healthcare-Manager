import { env } from "cloudflare:workers";
import { generateCareChat } from "@/lib/ai";

export async function POST(request: Request) {
  let body: { message?: string }; try { body = await request.json() as { message?: string }; } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }
  const message = body.message?.trim();
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  if (message.length > 4000) return Response.json({ error: "message must be 4,000 characters or fewer" }, { status: 400 });
  const runtime = env as unknown as Record<string, string | undefined>;
  return Response.json({ reply: await generateCareChat(message, runtime.OPENAI_API_KEY, runtime.OPENAI_MODEL) });
}
