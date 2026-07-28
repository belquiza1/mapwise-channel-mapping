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

The corrected extract has been validated against one SGL product. The next validation run is one MLT parent and one child product.

1. Run `sql/platform_listing_extract.sql` for an MLT parent and child.
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

## Known semantic questions

- Does `product.StandardPerson` represent maximum adults or standard/base occupancy?
- Which parent field is authoritative for each `MultiUnit` mode: `PartofID`, `ParentID`, or both?
- How are `product_attribute.options` structures versioned by attribute group?
- Are attribute codes always `CONCAT(attribute.List, attribute.ID)`?
- Which product states are eligible for mapping review?

## Build and deployment

The checked-in `.openai/hosting.json` intentionally has no production project ID. A maintainer must bind the target Sites project through the approved deployment workflow.