import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("protects pages and API routes for BookingPal users", async () => {
  const [page, properties, decisions] = await Promise.all([
    read("app/page.tsx"),
    read("app/api/properties/route.ts"),
    read("app/api/decisions/route.ts"),
  ]);
  assert.match(page, /requireChatGPTUser/);
  assert.match(page, /@bookingpal\.com/);
  assert.match(properties, /@bookingpal\.com/);
  assert.match(decisions, /@bookingpal\.com/);
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