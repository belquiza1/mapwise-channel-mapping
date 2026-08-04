import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { ValidationError } from "../../../lib/mapwise-data";
import { parsePlatformListing, type PlatformListing } from "../../../lib/platform-data";

// The "Sync platform listings" ingestion endpoint. It accepts the dataset produced
// by the VPN-local sync runner (sync/extract-listings.mjs). Two authenticated callers
// are allowed:
//   1. The automated runner — presents `Authorization: Bearer <SYNC_TOKEN>` (it does
//      NOT go through the ChatGPT employee proxy, so it cannot carry an employee session).
//   2. A signed-in BookingPal employee — for a manual sync triggered from the UI.
// Only State = 'Created' listings are ingested (docs/LISTING_STATE.md); others are
// skipped and reported. Restricted values are never logged.

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return request.headers.get("x-mapwise-sync-token");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function authorizeSync(request: Request): Promise<{ actor: string } | null> {
  const token = bearerToken(request);
  if (token && env.SYNC_TOKEN && constantTimeEquals(token, env.SYNC_TOKEN)) {
    return { actor: "sync-runner" };
  }
  const user = await getChatGPTUser();
  if (user && user.email.toLowerCase().endsWith("@bookingpal.com")) {
    return { actor: user.email };
  }
  return null;
}

type SyncBody = { listings?: unknown; syncedAt?: unknown; source?: unknown };

export async function POST(request: Request) {
  const auth = await authorizeSync(request);
  if (!auth) return Response.json({ error: "Valid sync token or BookingPal employee session required." }, { status: 403 });

  let body: SyncBody;
  try {
    body = (await request.json()) as SyncBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.listings)) {
    return Response.json({ error: "Body must include a 'listings' array." }, { status: 400 });
  }

  const syncedAt = typeof body.syncedAt === "string" ? body.syncedAt : new Date().toISOString();
  const sourceLabel = typeof body.source === "string" ? body.source : "platform-sync";

  const skipped: Array<{ productId: string; reason: string }> = [];
  const ingestible: PlatformListing[] = [];

  for (const raw of body.listings) {
    let listing: PlatformListing;
    try {
      listing = parsePlatformListing(raw);
    } catch (error) {
      const id = (raw as { source?: { productId?: unknown } })?.source?.productId;
      skipped.push({ productId: id === undefined ? "(unknown)" : String(id), reason: error instanceof ValidationError ? error.message : "unparseable" });
      continue;
    }
    // Lifecycle gate: only 'Created' listings are synced (LISTING_STATE.md).
    if (listing.source.productState !== "Created") {
      skipped.push({ productId: listing.source.productId, reason: `state ${listing.source.productState} not eligible` });
      continue;
    }
    ingestible.push(listing);
  }

  const statements = [];
  for (const listing of ingestible) {
    const l = listing.listing;
    const numericId = Number(listing.source.productId);
    if (!Number.isInteger(numericId)) {
      skipped.push({ productId: listing.source.productId, reason: "non-integer product id" });
      continue;
    }
    statements.push(
      env.DB.prepare(`INSERT INTO properties (
        id, name, display_name, property_type, bedrooms, bathrooms, max_guests,
        tax_number, raw_response_json, imported_by, created_at, updated_at,
        record_kind, product_state, structure, source_version, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'platform', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, display_name=excluded.display_name, property_type=excluded.property_type,
        bedrooms=excluded.bedrooms, bathrooms=excluded.bathrooms, max_guests=excluded.max_guests,
        tax_number=excluded.tax_number, raw_response_json=excluded.raw_response_json,
        imported_by=excluded.imported_by, updated_at=excluded.updated_at,
        record_kind='platform', product_state=excluded.product_state, structure=excluded.structure,
        source_version=excluded.source_version, synced_at=excluded.synced_at`)
        .bind(
          numericId,
          l.name,
          l.displayName ?? null,
          l.propertyTypeName ?? l.propertyTypeCode ?? null,
          l.rooms,
          l.bathrooms,
          l.maximumGuests,
          // Store only presence, never the value, for the restricted tax field.
          l.taxNumberPresent ? "present" : null,
          JSON.stringify(listing),
          auth.actor,
          syncedAt,
          syncedAt,
          listing.source.productState,
          listing.source.structure,
          listing.source.sourceVersion,
          syncedAt,
        ),
    );
  }

  const persisted = statements.length;
  if (persisted > 0) {
    statements.push(
      env.DB.prepare("INSERT INTO audit_events (event_type, property_id, actor_email, details_json, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind("platform_synced", null, auth.actor, JSON.stringify({ source: sourceLabel, ingested: persisted, skipped: skipped.length, syncedAt }), syncedAt),
    );
    try {
      await env.DB.batch(statements);
    } catch {
      return Response.json({ error: "Sync could not be persisted." }, { status: 500 });
    }
  }

  return Response.json({ syncedAt, ingested: persisted, skipped }, { status: 200 });
}
