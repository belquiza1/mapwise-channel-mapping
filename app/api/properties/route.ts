import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { buildImportedSample, parseProductResponse, ValidationError, type ImportedSample } from "../../../lib/mapwise-data";
import { buildPlatformSample, parsePlatformListing } from "../../../lib/platform-data";

async function authorizedUser() {
  const user = await getChatGPTUser();
  return user && user.email.toLowerCase().endsWith("@bookingpal.com") ? user : null;
}

export async function GET() {
  const user = await authorizedUser();
  if (!user) return Response.json({ error:"BookingPal employee access required." }, { status:403 });
  const propertyResult = await env.DB.prepare("SELECT raw_response_json, record_kind, source_version, synced_at FROM properties ORDER BY updated_at DESC").all<{raw_response_json:string;record_kind:string;source_version:string|null;synced_at:string|null}>();
  const decisionResult = await env.DB.prepare("SELECT property_id, check_id, status, confidence FROM mapping_decisions").all<{property_id:string;check_id:string;status:string;confidence:number}>();
  // Parse each stored row defensively by its record_kind: one legacy/corrupt row
  // must not 500 the entire list. Bad rows are skipped rather than failing.
  const properties = propertyResult.results.reduce<ImportedSample[]>((acc, row) => {
    try {
      const raw = JSON.parse(row.raw_response_json);
      const sample = row.record_kind === "platform"
        ? buildPlatformSample(parsePlatformListing(raw))
        : buildImportedSample(parseProductResponse(raw).data);
      sample.recordKind = row.record_kind === "platform" ? "platform" : "supplier";
      if (row.source_version) sample.sourceVersion = row.source_version;
      if (row.synced_at) sample.syncedAt = row.synced_at;
      acc.push(sample);
    } catch {
      // Skip unparseable row; keep serving the rest.
    }
    return acc;
  }, []);
  return Response.json({ properties, decisions:decisionResult.results });
}

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return Response.json({ error:"BookingPal employee access required." }, { status:403 });
  try {
    const body = await request.json() as { response?:unknown };
    const parsed = parseProductResponse(body.response);
    const data = parsed.data;
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO properties (
        id, alt_id, supplier_id, name, display_name, property_type, bedrooms, bathrooms, max_guests,
        latitude, longitude, location_json, tax_number, owner_info_json, policy_json, raw_response_json,
        imported_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        alt_id=excluded.alt_id, supplier_id=excluded.supplier_id, name=excluded.name,
        display_name=excluded.display_name, property_type=excluded.property_type,
        bedrooms=excluded.bedrooms, bathrooms=excluded.bathrooms, max_guests=excluded.max_guests,
        latitude=excluded.latitude, longitude=excluded.longitude, location_json=excluded.location_json,
        tax_number=excluded.tax_number, owner_info_json=excluded.owner_info_json,
        policy_json=excluded.policy_json, raw_response_json=excluded.raw_response_json,
        imported_by=excluded.imported_by, updated_at=excluded.updated_at`)
        .bind(data.id,data.altId ?? null,data.supplierId ?? null,data.name,data.displayName ?? null,data.propertyType ?? null,data.bedrooms,data.bathrooms,data.maxGuests,data.latitude ?? null,data.longitude ?? null,JSON.stringify(data.location ?? null),data.taxNumber ?? null,JSON.stringify(data.ownerInfo ?? null),JSON.stringify(data.policy ?? null),JSON.stringify(parsed.response),user.email,now,now),
      env.DB.prepare("INSERT INTO audit_events (event_type, property_id, actor_email, details_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind("property_imported",String(data.id),user.email,JSON.stringify({altId:data.altId ?? null,name:data.name}),now)
    ]);
    return Response.json({ property:buildImportedSample(data) }, { status:201 });
  } catch (error) {
    // Only surface our own validation messages. Anything else (D1/SQL/internal)
    // is returned as a generic 500 so raw engine detail never reaches the client.
    if (error instanceof ValidationError) {
      return Response.json({ error:error.message }, { status:400 });
    }
    return Response.json({ error:"Unable to import this response. Please check the payload and try again." }, { status:500 });
  }
}
