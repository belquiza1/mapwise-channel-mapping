// On-demand platform-listing bridge.
//
// Runs on a VPN-connected machine with read-only access to the BookingPal platform
// MySQL DB. A Cloudflare Tunnel (cloudflared) exposes it to the Mapwise Worker, which
// calls it to pre-validate a single listing on demand — the hosted app never touches
// the DB or the VPN itself. See docs/BRIDGE.md for the tunnel setup.
//
// Auth: every request must carry `Authorization: Bearer <BRIDGE_TOKEN>` matching the
// BRIDGE_TOKEN in this machine's environment (the same value as the Worker's secret).
//
//   BRIDGE_TOKEN=... node bridge/server.mjs             # listens on 127.0.0.1:8787
//   BRIDGE_PORT=9000 BRIDGE_TOKEN=... node bridge/server.mjs
//
// It reuses the exact read-only extraction from sync/extract-listings.mjs, so its
// output is the same redacted PlatformListing shape (presence/consistency flags only —
// never raw tax numbers, addresses, or coordinates).

import http from "http";
import { openConnection, extractProduct } from "../sync/extract-listings.mjs";

const PORT = Number(process.env.BRIDGE_PORT) || 8787;
const TOKEN = process.env.BRIDGE_TOKEN || "";

// Lazily-held connection, revalidated per request and reopened if the DB dropped it.
let conn = null;
async function getConnection() {
  if (conn) {
    try {
      await conn.query("SELECT 1");
      return conn;
    } catch {
      try { await conn.end(); } catch { /* already gone */ }
      conn = null;
    }
  }
  conn = await openConnection();
  return conn;
}

function constantTimeEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return Boolean(TOKEN) && Boolean(token) && constantTimeEquals(token, TOKEN);
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // Unauthenticated liveness check for the tunnel / monitoring.
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, { ok: true });
  }

  if (!authorized(req)) return send(res, 401, { error: "Unauthorized." });

  // GET /listing/<id>  or  /listing?id=<id>
  const match = url.pathname.match(/^\/listing\/(.+)$/);
  const id = match ? decodeURIComponent(match[1]) : url.searchParams.get("id");
  if (req.method !== "GET" || !id) return send(res, 400, { error: "GET /listing/<productId> required." });
  if (!/^\d+$/.test(id)) return send(res, 400, { error: "productId must be numeric." });

  try {
    const listing = await extractProduct(await getConnection(), id);
    if (!listing) return send(res, 404, { error: `Product ${id} not found.` });
    return send(res, 200, { listing });
  } catch {
    // Detailed error stays server-side; never leak DB/internal details to the caller.
    return send(res, 502, { error: "Platform extraction failed." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  if (!TOKEN) console.error("WARNING: BRIDGE_TOKEN is empty — every request will be rejected. Set BRIDGE_TOKEN.");
  console.error(`Mapwise bridge listening on http://127.0.0.1:${PORT}`);
});
