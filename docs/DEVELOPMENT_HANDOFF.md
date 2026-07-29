# Development Handoff

## What works

- Internal Mapwise review interface
- BookingPal-domain authorization checks
- Guided property, room/bed, amenity/policy, and validation review
- Approval persistence and audit events
- D1 schema and initial migration
- Production build and Sites deployment

## Immediate correction

The current `Import supplier JSON` flow was built before the source boundary was clarified. Listing data must come from the BookingPal platform tables, not the Supplier API.

Treat these files as temporary integration code:

- `app/api/properties/route.ts`
- Import modal logic in `app/mapwise-client.tsx`
- Supplier-response parsing in `lib/mapwise-data.ts`

Retain the normalization, mapping-row generation, D1 persistence, authorization, and audit concepts while replacing the input contract.

## First development milestone

The corrected extract has been validated against one SGL product, one `OWN` / `MULTI_REP` parent, and linked children returned by the parent-discovery query (2026-07-29 — queries 1-4 confirmed against a live child). See "Validation findings" below.

1. Run query 5 for the validated parent, then run queries 1-4 for at least one returned child.
2. Confirm `PartofID`, `ParentID`, `MultiUnit`, and inherited content behavior.
3. Confirm how `product_attribute.attribute_id` joins to `attribute` for every attribute group.
4. Build a typed platform-listing DTO.
5. Implement a VPN-local sync runner or internal sync service.
6. Add a scoped ingestion endpoint to Mapwise.
7. Replace `Import supplier JSON` with `Sync platform listings`.
8. Show source version and last-sync timestamp.

See `docs/VALIDATION_RULES.md` and the redacted SGL fixture under `tests/fixtures`.

## Operational rules

- MySQL access is read-only.
- No write-back to the BookingPal platform in the pilot.
- Never place MySQL credentials in Sites environment variables if the hosted application cannot reach the VPN.
- Do not log tax numbers, street addresses, owner data, or raw credentials.
- Channel acceptance is separate from BookingPal validation.
- Blocking copy should use `Resolve before sync`.

## Validation findings (2026-07-29, live read-only DB)

The extraction SQL was run end to end against a real `OWN`/`MULTI_REP` parent and its
linked children. Schema is confirmed: every table and column the extract references
exists. Resolved questions:

- **Which product states are eligible for mapping review?** `Created` (the live/active
  state). See [Listing state](LISTING_STATE.md) — this **inverts** the prototype's
  original "block unless Final" rule; `Final` is retired/archived.
- **Which parent field is authoritative for `MULTI_REP`?** `ParentID`. Children link to
  the parent via `ParentID`; `PartofID` and `linked_id` were NULL. The parent carries
  zero Room/Bathroom/Bed (Bed is `NULL`, not `0`) but **can** carry a non-zero `Person`.
- **Are attribute codes always `CONCAT(attribute.List, attribute.ID)`?** **No.** Active
  listings carry `product_attribute.attribute_id` values (e.g. `RMA`/`HAC` codes in the
  5000–6000 range) that exist in **neither** `attribute` (via `CONCAT(List, ID)`) **nor**
  `attribute_mapping`, so their amenities resolve to blank. The `LEFT JOIN` correctly
  keeps them visible, but amenity mapping is **not yet functional** for these listings —
  a fuller resolution path is needed (see backlog). `PCT` property-type mapping works
  (`PCT8` -> "Condominium" via both paths).
- **Real data vs prototype fixtures:** `product.State` is a string enum, not numeric;
  `SpaceUnit` uses codes like `ft2`, not `SQ_FT`; a `Created` (live) product can still
  have only Created-state text (`isFinal = false`), which correctly blocks readiness.

## Still-open semantic questions

- Does `product.StandardPerson` represent maximum adults or standard/base occupancy?
  (Observed `StandardPerson = 0` while `Person = 4` on a live child — likely "unset".)
- How are `product_attribute.options` structures versioned by attribute group?
- What is the correct resolution table/scheme for attribute codes that miss
  `CONCAT(List, ID)` and `attribute_mapping`?

## Build and deployment

The checked-in `.openai/hosting.json` intentionally has no production project ID. A maintainer must bind the target Sites project through the approved deployment workflow.