import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("protects pages and API routes for BookingPal users", async () => {
  const [page, properties, decisions, auth] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/properties/route.ts"),
    read("app/api/decisions/route.ts"),
    read("app/access-auth.ts"),
  ]);
  assert.match(page, /requireUser/);
  // The employee-domain gate is centralized in access-auth (isEmployee) and covers
  // both BookingPal domains; every protected surface must route through it.
  assert.match(auth, /@bookingpal\.com/);
  assert.match(auth, /@mybookingpal\.com/);
  assert.match(page, /isEmployee/);
  assert.match(properties, /isEmployee/);
  assert.match(decisions, /isEmployee/);
  // The employee gate must verify the Cloudflare Access JWT signature, not merely
  // trust the forwarded identity header, so the gate holds if Access is bypassed.
  assert.match(auth, /cf-access-jwt-assertion/i);
  assert.match(auth, /crypto\.subtle\.verify/);
});

test("keeps the platform source boundary explicit", async () => {
  const [readme, architecture, sql] = await Promise.all([
    read("README.md"),
    read("docs/ARCHITECTURE.md"),
    read("sql/platform_listing_extract.sql"),
  ]);
  assert.match(readme, /MySQL platform over VPN/);
  assert.match(architecture, /Supplier API is documentation and response context/);
  assert.match(sql, /FROM product p/);
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\b/i);
});

test("does not bind the handoff repository to production hosting", async () => {
  const hosting = JSON.parse(await read(".openai/hosting.json"));
  assert.equal(hosting.project_id, null);
  assert.equal(hosting.d1, "DB");
});

test("preserves Created text evidence without marking it Final", async () => {
  const sql = await read("sql/platform_listing_extract.sql");
  assert.match(sql, /pt\.State IN \(2, 3\)/);
  assert.match(sql, /AS isFinal/);
  assert.match(sql, /preferred\.State > pt\.State/);
  assert.match(sql, /SET @product_id = 0;/);
});

test("limits property type mappings and retains unresolved attributes", async () => {
  const sql = await read("sql/platform_listing_extract.sql");
  assert.match(sql, /pa\.attribute_id LIKE 'PCT%'/);
  assert.match(sql, /GROUP_CONCAT\(DISTINCT Name/);
  assert.match(sql, /AND `ignore` = 0/);
  assert.doesNotMatch(sql, /AND ignore = 0/);
  assert.match(sql, /LEFT JOIN attribute a/);
});

test("keeps the SGL validation fixture redacted", async () => {
  const fixture = JSON.parse(await read("tests/fixtures/sgl-validation-redacted.json"));
  const serialized = JSON.stringify(fixture);
  assert.equal(fixture.source.structure, "SGL");
  assert.equal(fixture.source.productState, "Created");
  assert.equal(fixture.summary.blockers, 3);
  assert.doesNotMatch(
    serialized,
    /Physicaladdress|TaxNumber|latitude|longitude|SupplierID/i,
  );
});

test("discovers candidate child units through every known relationship", async () => {
  const sql = await read("sql/platform_listing_extract.sql");
  assert.match(sql, /child\.ParentID = @product_id/);
  assert.match(sql, /child\.PartofID = @product_id/);
  assert.match(sql, /child\.linked_id = @product_id/);
  assert.match(sql, /AS relationshipSource/);
});

test("keeps the MULTI_REP parent validation fixture redacted", async () => {
  const fixture = JSON.parse(
    await read("tests/fixtures/multi-rep-parent-validation-redacted.json"),
  );
  const serialized = JSON.stringify(fixture);
  assert.equal(fixture.source.multiUnit, "OWN");
  assert.equal(fixture.source.productGroup, "MULTI_REP");
  assert.equal(fixture.bedroomConfiguration.expectedAtParent, true);
  assert.equal(fixture.bedroomConfiguration.childValidationRequired, true);
  assert.equal(fixture.location.severity, "review");
  assert.doesNotMatch(
    serialized,
    /Physicaladdress|TaxNumber|latitude|longitude|SupplierID/i,
  );
});
