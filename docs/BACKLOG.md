# Development Backlog

## P0 - Correct the data source

- [ ] Validate the platform extraction SQL against one SGL and one MLT product.
- [ ] Replace the Supplier API input contract with a typed platform-listing DTO.
- [ ] Build a read-only VPN-local sync runner or internal sync service.
- [ ] Add scoped service authentication for Mapwise ingestion.
- [ ] Replace `Import supplier JSON` with `Sync platform listings`.
- [ ] Preserve source `product.ID`, `product.version`, and last-sync timestamp.
- [ ] Prevent restricted fields from appearing in client-facing evidence or logs.

## P0 - Mapping integrity

- [ ] Confirm PCT property-type joins and channel mappings.
- [ ] Confirm RMA bed-code capacity and channel mappings.
- [ ] Reconcile `product.Room`, `product.Bed`, and bedroom configuration.
- [ ] Resolve occupancy semantics for `Person`, `StandardPerson`, `Child`, and `Infant`.
- [ ] Resolve SGL/MLT parent inheritance and unit structure.
- [ ] Parse attribute `options` JSON by attribute group.

## P1 - Workflow

- [ ] Persist selected channel resolutions, not only approvals.
- [ ] Add reviewer notes, assignment, and due dates.
- [ ] Add exception states: open, awaiting supplier, resolved, waived.
- [ ] Add source refresh and stale-data warnings.
- [ ] Add audit-history view.

## P1 - Channel feedback

- [ ] Store Booking.com rejection responses.
- [ ] Store Vrbo rejection responses.
- [ ] Store Expedia rejection responses.
- [ ] Separate source errors, mapping errors, authentication errors, rate limits, and channel rejections.

## P2 - Additional listing domains

- [ ] Rates and availability
- [ ] Fees and taxes
- [ ] Cancellation policies
- [ ] Images
- [ ] Licenses and compliance
- [ ] Channel activation status

## Release gate

- [ ] Production build passes.
- [ ] No secrets or personal database credentials are committed.
- [ ] Non-BookingPal access is rejected server-side.
- [ ] One supplier client is piloted end to end.
- [ ] Every channel rejection is captured and classified.