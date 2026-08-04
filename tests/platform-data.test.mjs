import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePlatformListing,
  validatePlatformListing,
  summarizeValidation,
  buildPlatformSample,
  isMultiRepParent,
} from "../lib/platform-data.ts";

// A live, well-formed SGL listing that should pass cleanly.
const cleanSgl = {
  source: { productId: 1234, structure: "SGL", productGroup: "KEY", productState: "Created", sourceVersion: "2026-07-29T00:00:00Z" },
  listing: {
    name: "Harbor Loft", displayName: "Harbor Loft 2BR", useDisplayName: true,
    rooms: 2, bathrooms: 1.5, reportedBeds: 3, maximumGuests: 4,
    propertyTypeCode: "PCT34", propertyTypeName: "Vacation home",
    finalEnglishTextPresent: true, createdEnglishTextPresent: true,
    taxNumberPresent: true, space: "95", spaceUnit: "m2",
  },
  bedroomConfiguration: { bedrooms: 2, bedCount: 3, guestCapacity: 4, matchesProductHeader: true },
  attributes: { unresolvedCount: 0 },
  location: { city: "X", cityAndCoordinatesAgree: true, postalCodesAgree: true },
};

test("parse rejects malformed input and normalizes productId to string", () => {
  assert.throws(() => parsePlatformListing(null), /JSON object/);
  assert.throws(() => parsePlatformListing({ source: {}, listing: {} }), /productId/);
  const parsed = parsePlatformListing(cleanSgl);
  assert.equal(parsed.source.productId, "1234");
  assert.equal(typeof parsed.source.productId, "string");
});

test("Created + Final text + consistent location passes lifecycle/text/location", () => {
  const r = validatePlatformListing(cleanSgl);
  const by = Object.fromEntries(r.map(x => [x.rule, x.status]));
  assert.equal(by["product-lifecycle"], "pass");
  assert.equal(by["final-english-text"], "pass");
  assert.equal(by["location-consistency"], "pass");
  assert.equal(by["bedroom-consistency"], "pass");
  assert.equal(by["property-type-resolution"], "pass");
});

test("non-Created state blocks lifecycle; Incomplete is review", () => {
  const finalState = { ...cleanSgl, source: { ...cleanSgl.source, productState: "Final" } };
  assert.equal(validatePlatformListing(finalState).find(r => r.rule === "product-lifecycle").status, "block");
  const incomplete = { ...cleanSgl, source: { ...cleanSgl.source, productState: "Incomplete" } };
  assert.equal(validatePlatformListing(incomplete).find(r => r.rule === "product-lifecycle").status, "review");
});

test("Created-only text blocks; postal-only mismatch is review not block", () => {
  const createdOnly = { ...cleanSgl, listing: { ...cleanSgl.listing, finalEnglishTextPresent: false } };
  assert.equal(validatePlatformListing(createdOnly).find(r => r.rule === "final-english-text").status, "block");
  const postal = { ...cleanSgl, location: { cityAndCoordinatesAgree: true, postalCodesAgree: false } };
  assert.equal(validatePlatformListing(postal).find(r => r.rule === "location-consistency").status, "review");
  const cityBad = { ...cleanSgl, location: { cityAndCoordinatesAgree: false } };
  assert.equal(validatePlatformListing(cityBad).find(r => r.rule === "location-consistency").status, "block");
});

test("MULTI_REP parent: zero counts pass, children go pending, no count blocker", () => {
  const parent = {
    source: { productId: "p1", structure: "OWN", productGroup: "MULTI_REP", productState: "Created", sourceVersion: "v" },
    listing: { name: "Parent", rooms: 0, bathrooms: 0, reportedBeds: 0, maximumGuests: 4, propertyTypeCode: "PCT20", propertyTypeName: "Hotel", finalEnglishTextPresent: true },
    bedroomConfiguration: { rows: 0 },
    attributes: { unresolvedCount: 7 },
    childUnits: [{ id: "c1", relationshipSource: "ParentID" }],
  };
  assert.equal(isMultiRepParent(parent), true);
  const r = validatePlatformListing(parent);
  const by = Object.fromEntries(r.map(x => [x.rule, x.status]));
  assert.equal(by["multi-rep-parent-counts"], "pass");
  assert.equal(by["child-unit-validation"], "pending");
  assert.equal(by["bedroom-consistency"], undefined); // not applied at parent
});

test("summarize counts pass/block/review/pending", () => {
  const s = summarizeValidation(validatePlatformListing(cleanSgl));
  assert.equal(s.blockers, 0);
  assert.ok(s.passes >= 4);
});

test("buildPlatformSample never leaks restricted values and maps blocks to rejected", () => {
  const blocked = { ...cleanSgl, source: { ...cleanSgl.source, productState: "Final" }, listing: { ...cleanSgl.listing, finalEnglishTextPresent: false } };
  const sample = buildPlatformSample(blocked);
  const serialized = JSON.stringify(sample);
  // No raw restricted field names/values should appear in UI evidence.
  assert.doesNotMatch(serialized, /Physicaladdress|TaxNumber|latitude|longitude|SupplierID/i);
  assert.equal(sample.id, "1234");
  assert.ok(sample.rows.some(row => row.status === "rejected")); // lifecycle/text blocks
  assert.ok(sample.rows.length >= 8);
});
