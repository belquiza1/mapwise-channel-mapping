import assert from "node:assert/strict";
import test from "node:test";
import { buildListingFromRows } from "../sync/extract-listings.mjs";
import { parsePlatformListing, validatePlatformListing } from "../lib/platform-data.ts";

test("assembles a Created SGL listing from raw platform rows and validates clean", () => {
  const listing = buildListingFromRows({
    product: {
      ID: 555, Name: "Lake House", DisplayName: "Lake House 3BR", UseDisplayName: 1,
      MultiUnit: "SGL", ProductGroup: "KEY", State: "Created", version: "2026-07-30T00:00:00Z",
      Room: 3, Bathroom: 2, Bed: 4, Person: 8, Toilet: 2, Child: 2, Infant: 1,
      Currency: "USD", Space: "140", SpaceUnit: "m2", TaxNumber: "SECRET-TAX-1",
      CheckInTime: "15:00:00", CheckOutTime: "11:00:00",
      Latitude: 40.1, Longitude: -105.2, locationLatitude: 40.11, locationLongitude: -105.19,
      Physicaladdress: "12 Lake Rd Boulder 80301 US", ZipCode: "80301",
      city: "Boulder", region: "CO", Country: "US",
    },
    texts: [
      { Type: "Name", Language: "en", textState: 3, isFinal: 1 },
      { Type: "Description", Language: "en", textState: 2, isFinal: 0 },
    ],
    bedrooms: [
      { ID: 1, Guests: 4, Beds: 2, PrivatBathroom: 1 },   // note the documented (typo) spelling
      { ID: 2, Guests: 4, Beds: 2, PrivateBathroom: 0 },  // and the extract-SQL spelling — both tolerated
      { ID: 3, Guests: 0, Beds: 0 },
    ],
    beds: [{ BedroomID: 1, BedCount: 2, BedType: "RMA10" }, { BedroomID: 2, BedCount: 2, BedType: "RMA20" }],
    attributes: [
      { attribute_id: "PCT34", mappedTypeNames: "Vacation home" },
      { attribute_id: "ACC50", displayName: "Home theater" },
      { attribute_id: "RMA9999" }, // unresolved
    ],
    children: [],
  });

  // Restricted values must not appear anywhere in the assembled listing.
  const blob = JSON.stringify(listing);
  assert.doesNotMatch(blob, /SECRET-TAX-1|12 Lake Rd|40\.1/);
  assert.equal(listing.listing.taxNumberPresent, true);

  assert.equal(listing.source.productId, "555");
  assert.equal(listing.source.structure, "SGL");
  assert.equal(listing.listing.propertyTypeCode, "PCT34");
  assert.equal(listing.listing.propertyTypeName, "Vacation home");
  assert.equal(listing.bedroomConfiguration.bedrooms, 3);
  assert.equal(listing.bedroomConfiguration.bedCount, 4);
  assert.equal(listing.listing.finalEnglishTextPresent, true);
  assert.equal(listing.attributes.unresolvedCount, 1);
  assert.equal(listing.location.postalCodesAgree, true);
  assert.equal(listing.location.cityAndCoordinatesAgree, true);

  // Round-trips through the app's parser + validator with no blockers.
  const parsed = parsePlatformListing(listing);
  const blockers = validatePlatformListing(parsed).filter(r => r.status === "block");
  assert.equal(blockers.length, 0);
});

test("resolves English text when the DB stores the language code uppercase ('EN')", () => {
  // The live platform DB stores product_text.Language as 'EN', not 'en'. A case-sensitive
  // comparison silently dropped every English row and forced the text-presence flags false.
  // This fixture mirrors the real casing so that regression cannot return unnoticed.
  const listing = buildListingFromRows({
    product: { ID: 42, Name: "Casing Check", MultiUnit: "SGL", ProductGroup: "KEY", State: "Created", version: "v", Room: 1, Bed: 1, Person: 2 },
    texts: [
      { Type: "Name", Language: "EN", textState: 3, isFinal: 1 },
      { Type: "Description", Language: "EN", textState: 2, isFinal: 0 },
    ],
    bedrooms: [], beds: [], attributes: [], children: [],
  });
  assert.equal(listing.listing.finalEnglishTextPresent, true);
  assert.equal(listing.listing.createdEnglishTextPresent, true);
});

test("MULTI_REP parent: zero counts, children discovered, no count blocker", () => {
  const listing = buildListingFromRows({
    product: {
      ID: 900, Name: "Resort Parent", MultiUnit: "OWN", ProductGroup: "MULTI_REP",
      State: "Created", version: "v", Room: 0, Bathroom: 0, Bed: 0, Person: 4,
    },
    texts: [{ Type: "Name", Language: "en", textState: 3, isFinal: 1 }],
    bedrooms: [],
    beds: [],
    attributes: [{ attribute_id: "PCT20", mappedTypeNames: "Hotel" }],
    children: [
      { ID: 901, ParentID: 900, MultiUnit: "MLT", ProductGroup: "MULTI_REP", State: "Created", relationshipSource: "ParentID" },
    ],
  });
  assert.equal(listing.source.productGroup, "MULTI_REP");
  assert.equal(listing.childUnits.length, 1);
  assert.equal(listing.childUnits[0].id, "901");
  const results = validatePlatformListing(parsePlatformListing(listing));
  const by = Object.fromEntries(results.map(r => [r.rule, r.status]));
  assert.equal(by["multi-rep-parent-counts"], "pass");
  assert.equal(by["child-unit-validation"], "pending");
});
