import { env } from "cloudflare:workers";

export async function POST(request: Request) {
  let body: { doctorName?: string; patientName?: string; scheduledFor?: string }; try { body=await request.json() as typeof body; } catch { return Response.json({error:"Request body must be valid JSON"},{status:400}); }
  const doctorName=body.doctorName?.trim(),patientName=body.patientName?.trim(),scheduledFor=body.scheduledFor?.trim();
  if(!doctorName||!patientName||!scheduledFor)return Response.json({error:"doctorName, patientName, and scheduledFor are required"},{status:400});
  const now=Math.floor(Date.now()/1000),expires=now+300;
  try{
    await env.DB.prepare("DELETE FROM appointments WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?").bind(now).run();
    const existing=await env.DB.prepare("SELECT id, patient_name, status, hold_expires_at FROM appointments WHERE doctor_name = ? AND scheduled_for = ? LIMIT 1").bind(doctorName,scheduledFor).first<{id:string;patient_name:string;status:string;hold_expires_at:number|null}>();
    if(existing){if(existing.status==="held"&&existing.patient_name===patientName){await env.DB.prepare("UPDATE appointments SET hold_expires_at = ? WHERE id = ?").bind(expires,existing.id).run();return Response.json({holdId:existing.id,expiresAt:new Date(expires*1000).toISOString(),secondsRemaining:300});}return Response.json({error:"This appointment slot is no longer available"},{status:409});}
    const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO appointments (id, doctor_name, patient_name, scheduled_for, status, symptoms, urgency, hold_expires_at, created_at) VALUES (?, ?, ?, ?, 'held', 'Awaiting symptom information', 'low', ?, ?)").bind(id,doctorName,patientName,scheduledFor,expires,now).run();return Response.json({holdId:id,expiresAt:new Date(expires*1000).toISOString(),secondsRemaining:300},{status:201});
  }catch(error){const message=error instanceof Error?error.message:"";return Response.json({error:message.toLowerCase().includes("unique")?"Another patient reserved this slot first":"Your slot could not be held"},{status:message.toLowerCase().includes("unique")?409:503});}
}
