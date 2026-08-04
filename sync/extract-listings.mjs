// VPN-local sync runner for Mapwise.
//
// Runs on a machine with read-only VPN access to the BookingPal platform MySQL
// (edb3.bookingpal.org). It executes the read-only extract in
// sql/platform_listing_extract.sql per `product.State = 'Created'` listing,
// assembles the normalized PlatformListing shape that lib/platform-data.ts expects,
// and either writes it to a JSON file or POSTs it to the Mapwise /api/sync endpoint.
//
// The hosted Mapwise app never holds MySQL credentials — this runner is the only
// component that touches the platform DB, and it issues SELECTs only.
//
// Requirements (same as db-tools.js): `mysql2` and `dotenv`, and a `.env` with
//   MYSQL_USER, MYSQL_PASS, MYSQL_DATABASE
// Optional for --post:
//   MAPWISE_SYNC_URL   (e.g. https://mapwise.example.com/api/sync)
//   MAPWISE_SYNC_TOKEN (matches the Worker's SYNC_TOKEN secret)
//
// Usage:
//   node sync/extract-listings.mjs --limit 50 --out listings.json
//   node sync/extract-listings.mjs --ids 123,456 --out listings.json
//   node sync/extract-listings.mjs --ids-from ids.txt --post
//
// Column-name tolerance: the documented schema and the prototype extract disagree
// on `product_bedroom.PrivatBathroom` vs `PrivateBathroom`, and `product.BpValidation`
// is not in the documented columns. This runner SELECTs whole rows and reads fields
// by whichever name is present, so a spelling mismatch cannot silently drop data.

import fs from "fs";
import { pathToFileURL } from "url";

const HOST = "edb3.bookingpal.org";
const ELIGIBLE_STATE = "Created";

// ---- pure assembly (unit-testable without a database) -----------------------

function pick(row, ...names) {
  for (const n of names) {
    if (row && row[n] !== undefined) return row[n];
  }
  return undefined;
}

function num(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

// Approximate coordinate agreement: both product and location coords present and
// within ~0.05 degrees (~5km). Raw coordinates are used only to derive this boolean
// and are never included in the output.
function coordsAgree(pLat, pLng, lLat, lLng) {
  const a = [pLat, pLng, lLat, lLng].map(Number);
  if (a.some(x => !Number.isFinite(x) || x === 0)) return undefined;
  return Math.abs(a[0] - a[2]) <= 0.05 && Math.abs(a[1] - a[3]) <= 0.05;
}

// Extract a ZIP-like token from the free-text Physicaladdress for a coarse compare.
function zipFromAddress(addr) {
  if (!addr || typeof addr !== "string") return null;
  const m = addr.match(/\b(\d{4,10}(?:-\d{4})?)\b/);
  return m ? m[1] : null;
}

/**
 * Build a normalized PlatformListing from the five raw result sets.
 * @param {{product:object, texts:object[], bedrooms:object[], beds:object[], attributes:object[], children:object[]}} sets
 */
export function buildListingFromRows(sets) {
  const p = sets.product || {};
  const texts = sets.texts || [];
  const bedroomRows = sets.bedrooms || [];
  const bedRows = sets.beds || [];
  const attrRows = sets.attributes || [];
  const children = sets.children || [];

  const productId = String(pick(p, "ID", "id"));
  const structure = pick(p, "MultiUnit") ?? "SGL";
  const productGroup = pick(p, "ProductGroup") ?? null;
  const productState = pick(p, "State") ?? null;
  const sourceVersion = String(pick(p, "version", "sourceVersion") ?? "");

  // English text presence: State 3 = Final, 2 = Created (product_text).
  // DB stores the language code uppercase ('EN'); compare case-insensitively so the
  // English text rows are not silently dropped (a strict === "en" match misses them).
  const englishTexts = texts.filter(t => String(pick(t, "Language") ?? "en").toLowerCase() === "en");
  const finalEnglishTextPresent = englishTexts.some(t => num(pick(t, "State", "textState")) === 3 || num(pick(t, "isFinal")) === 1);
  const createdEnglishTextPresent = englishTexts.some(t => num(pick(t, "State", "textState")) === 2);

  // Bedroom configuration.
  const bedrooms = bedroomRows.length;
  const guestCapacity = bedroomRows.reduce((s, r) => s + num(pick(r, "Guests")), 0);
  const bedCount = bedRows.reduce((s, r) => s + num(pick(r, "BedCount"), 1), 0);
  const headerRooms = num(pick(p, "Room"));
  const headerBeds = num(pick(p, "Bed"));
  const headerGuests = num(pick(p, "Person"));
  const matchesProductHeader = bedrooms > 0 && bedrooms === headerRooms && (bedCount === 0 || bedCount === headerBeds);

  // Attributes: PCT property type resolution + unresolved count.
  let propertyTypeCode = null, propertyTypeName = null, unresolvedCount = 0;
  for (const a of attrRows) {
    const code = pick(a, "attribute_id", "AttributeCode");
    const displayName = pick(a, "displayName", "DisplayName");
    const mappedTypeNames = pick(a, "mappedTypeNames");
    if (typeof code === "string" && code.startsWith("PCT")) {
      if (!propertyTypeCode) {
        propertyTypeCode = code;
        propertyTypeName = mappedTypeNames || pick(a, "attributeName") || null;
      }
    }
    // "unresolved" = neither a display name nor a mapping name resolved the code.
    if (!displayName && !mappedTypeNames && !pick(a, "attributeName")) unresolvedCount++;
  }

  // Location consistency signals (no raw address/coords in output).
  const cityAndCoordinatesAgree = coordsAgree(pick(p, "Latitude"), pick(p, "Longitude"), pick(p, "locationLatitude"), pick(p, "locationLongitude"));
  const addrZip = zipFromAddress(pick(p, "Physicaladdress"));
  const locZip = pick(p, "ZipCode");
  const postalCodesAgree = (addrZip && locZip) ? String(addrZip) === String(locZip) : undefined;

  const childUnits = children.map(c => ({
    id: String(pick(c, "ID", "id")),
    relationshipSource: pick(c, "relationshipSource") ?? "unknown",
    multiUnit: pick(c, "MultiUnit") ?? null,
    productGroup: pick(c, "ProductGroup") ?? null,
    state: pick(c, "State") ?? null,
  }));

  return {
    source: { productId, structure, productGroup, productState, sourceVersion },
    listing: {
      name: pick(p, "Name") ?? "",
      displayName: pick(p, "DisplayName") ?? null,
      useDisplayName: num(pick(p, "UseDisplayName")) === 1,
      rooms: headerRooms,
      bathrooms: num(pick(p, "Bathroom")),
      toilets: pick(p, "Toilet") ?? null,
      reportedBeds: headerBeds,
      maximumGuests: headerGuests,
      standardGuests: pick(p, "StandardPerson") ?? null,
      childGuests: pick(p, "Child") ?? null,
      infantGuests: pick(p, "Infant") ?? null,
      propertyTypeCode,
      propertyTypeName,
      checkInTime: pick(p, "CheckInTime") ?? null,
      checkInToTime: pick(p, "checkInToTime", "CheckInToTime") ?? null,
      checkOutTime: pick(p, "CheckOutTime") ?? null,
      currency: pick(p, "Currency") ?? null,
      space: pick(p, "Space") ?? null,
      spaceUnit: pick(p, "SpaceUnit") ?? null,
      // presence flags only — never the value
      taxNumberPresent: Boolean(pick(p, "TaxNumber")),
      finalEnglishTextPresent,
      createdEnglishTextPresent,
    },
    bedroomConfiguration: { bedrooms, bedCount, guestCapacity, matchesProductHeader, rows: bedrooms },
    attributes: { unresolvedCount },
    location: { city: pick(p, "city") ?? null, region: pick(p, "region") ?? null, country: pick(p, "Country") ?? null, cityAndCoordinatesAgree, postalCodesAgree },
    childUnits,
  };
}

// ---- CLI / DB plumbing ------------------------------------------------------

function parseArgs(argv) {
  const args = { limit: 50, ids: null, idsFrom: null, out: null, outDir: null, post: false, state: ELIGIBLE_STATE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--post") args.post = true;
    else if (a === "--limit") args.limit = parseInt(argv[++i], 10);
    else if (a === "--ids") args.ids = argv[++i].split(/[\s,;]+/).filter(Boolean);
    else if (a === "--ids-from") args.idsFrom = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--state") args.state = argv[++i];
  }
  return args;
}

function assertSelectOnly(sql) {
  if (/\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|GRANT)\b/i.test(sql)) {
    throw new Error("Refusing to run a non-SELECT statement.");
  }
}

async function query(conn, sql, params = []) {
  assertSelectOnly(sql);
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function extractProduct(conn, id) {
  const productRows = await query(conn, `
    SELECT p.*, l.Name AS city, l.GName AS alternateCityName, l.AdminArea_lvl_1 AS region,
           l.Country, l.ZipCode, l.TimeZoneID, l.Latitude AS locationLatitude, l.Longitude AS locationLongitude
    FROM product p LEFT JOIN location l ON l.ID = p.LocationID
    WHERE p.ID = ?`, [id]);
  if (!productRows.length) return null;
  const product = productRows[0];

  const texts = await query(conn, `
    SELECT pt.Type, pt.Value, pt.Version, pt.State AS textState, pt.Language,
           CASE WHEN pt.State = 3 THEN 1 ELSE 0 END AS isFinal
    FROM product_text pt
    WHERE pt.ProductID = ? AND pt.Language = 'en' AND pt.State IN (2,3)
      AND pt.Type IN ('Name','Description','ShortDescription','HouseRules')`, [id]);

  const bedrooms = await query(conn, `SELECT * FROM product_bedroom WHERE ProductID = ? ORDER BY ID`, [id]);
  const beds = await query(conn, `SELECT * FROM product_bedroom_bed WHERE ProductID = ? ORDER BY BedroomID, ID`, [id]);

  const attributes = await query(conn, `
    SELECT pa.attribute_id, pa.Quantity, pa.options,
           ad.DisplayName AS displayName, ad.DisplayCategory AS displayCategory,
           am.Names AS mappedTypeNames, a.Name AS attributeName
    FROM product_attribute pa
    LEFT JOIN attribute_display ad ON ad.AttributeCode = pa.attribute_id
    LEFT JOIN (
      SELECT Code, GROUP_CONCAT(DISTINCT Name ORDER BY Name SEPARATOR ' | ') AS Names
      FROM attribute_mapping WHERE Type = 2 AND \`ignore\` = 0 GROUP BY Code
    ) am ON pa.attribute_id LIKE 'PCT%' AND am.Code = pa.attribute_id
    LEFT JOIN attribute a ON pa.attribute_id = CONCAT(a.List, a.ID)
    WHERE pa.product_id = ? ORDER BY pa.attribute_id`, [id]);

  const children = await query(conn, `
    SELECT child.*, CASE
       WHEN child.ParentID = ? THEN 'ParentID'
       WHEN child.PartofID = ? THEN 'PartofID'
       WHEN child.linked_id = ? THEN 'linked_id' END AS relationshipSource
    FROM product child
    WHERE child.ParentID = ? OR child.PartofID = ? OR child.linked_id = ? ORDER BY child.ID`,
    [id, id, id, id, id, id]);

  return buildListingFromRows({ product, texts, bedrooms, beds, attributes, children });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [{ default: dotenv }, { default: mysql }] = await Promise.all([import("dotenv"), import("mysql2/promise")]);
  dotenv.config();

  const conn = await mysql.createConnection({
    host: HOST, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DATABASE, connectTimeout: 90000,
  });

  try {
    let ids = args.ids;
    if (!ids && args.idsFrom) {
      ids = fs.readFileSync(args.idsFrom, "utf8").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
    }
    if (!ids) {
      const rows = await query(conn, `SELECT ID FROM product WHERE State = ? ORDER BY version DESC LIMIT ?`, [args.state, args.limit]);
      ids = rows.map(r => String(r.ID));
    }
    console.error(`Extracting ${ids.length} product(s) in state '${args.state}'...`);

    const listings = [];
    for (const id of ids) {
      try {
        const listing = await extractProduct(conn, id);
        if (listing) listings.push(listing);
        else console.error(`  ${id}: not found`);
      } catch (e) {
        console.error(`  ${id}: extract failed — ${e.message}`);
      }
    }

    const payload = { syncedAt: new Date().toISOString(), source: `edb3:${args.state}`, listings };

    if (args.out) {
      fs.writeFileSync(args.out, JSON.stringify(payload, null, 2));
      console.error(`Wrote ${listings.length} listing(s) to ${args.out}`);
    }
    if (args.outDir) {
      fs.mkdirSync(args.outDir, { recursive: true });
      for (const listing of listings) {
        const id = String(listing.source?.productId || "unknown").replace(/[^\w.-]/g, "_");
        fs.writeFileSync(`${args.outDir}/${id}.json`, JSON.stringify(listing, null, 2));
      }
      // A manifest keeps the envelope (syncedAt/source) that per-listing files drop.
      fs.writeFileSync(`${args.outDir}/_manifest.json`, JSON.stringify({
        syncedAt: payload.syncedAt, source: payload.source, count: listings.length,
        productIds: listings.map(l => l.source?.productId),
      }, null, 2));
      console.error(`Wrote ${listings.length} per-listing file(s) + _manifest.json to ${args.outDir}/`);
    }
    if (args.post) {
      const url = process.env.MAPWISE_SYNC_URL, token = process.env.MAPWISE_SYNC_TOKEN;
      if (!url || !token) throw new Error("--post requires MAPWISE_SYNC_URL and MAPWISE_SYNC_TOKEN in the environment.");
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      console.error(`POST ${url} -> ${res.status}`);
      console.error(await res.text());
    }
    if (!args.out && !args.outDir && !args.post) {
      process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
    }
  } finally {
    await conn.end();
  }
}

// Only run main() when invoked directly, so the pure function can be imported in tests.
// pathToFileURL normalizes Windows paths (C:\...) to a file:// URL that matches import.meta.url;
// the previous `file://${argv[1]}` concatenation never matched on Windows, so main() was skipped.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(err => { console.error("Sync failed:", err.message); process.exit(1); });
}
