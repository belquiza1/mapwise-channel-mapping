import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user || !user.email.toLowerCase().endsWith("@bookingpal.com")) {
    return Response.json({ error:"BookingPal employee access required." }, { status:403 });
  }
  try {
    const body = await request.json() as { propertyId?:string; checkId?:number; status?:string; confidence?:number };
    if (!body.propertyId || !Number.isInteger(body.checkId) || body.status !== "approved") {
      return Response.json({ error:"Invalid mapping decision." }, { status:400 });
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO mapping_decisions (property_id, check_id, status, confidence, approved_by, approved_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(property_id, check_id) DO UPDATE SET
          status=excluded.status, confidence=excluded.confidence, approved_by=excluded.approved_by, approved_at=excluded.approved_at`)
        .bind(body.propertyId,String(body.checkId),body.status,Math.max(95,Number(body.confidence)||95),user.email,now),
      env.DB.prepare("INSERT INTO audit_events (event_type, property_id, actor_email, details_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind("mapping_approved",body.propertyId,user.email,JSON.stringify({checkId:body.checkId}),now)
    ]);
    return Response.json({ ok:true, approvedBy:user.email, approvedAt:now });
  } catch {
    return Response.json({ error:"Unable to save the mapping decision." }, { status:500 });
  }
}
