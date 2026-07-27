# Architecture

## Objective

Mapwise reads authoritative listing content from the BookingPal platform, normalizes it, applies mapping and validation rules, and records channel-specific decisions. It does not write to the BookingPal platform during the initial rollout.

## Source boundary

Authoritative listing data comes from MySQL tables available only over the BookingPal VPN:

- `product`
- `product_text`
- `product_bedroom`
- `product_bedroom_bed`
- `product_attribute`
- `attribute`
- `attribute_mapping`
- `location`

The Supplier API is documentation and response context, not the production source of listing records.

## Recommended sync pattern

The hosted Mapwise application cannot enter the BookingPal VPN. Use one of these patterns:

1. **Internal sync service (preferred):** A small service inside the BookingPal network queries MySQL with a `SELECT`-only service account and sends normalized records to Mapwise over HTTPS.
2. **Local sync runner (pilot):** A developer or operator runs a signed utility while connected to VPN. Credentials remain in the local secret store.
3. **Scheduled export (fallback):** An internal job creates a controlled JSON/CSV export for Mapwise ingestion.

Do not expose MySQL publicly or send database credentials to the browser.

## Mapwise persistence

D1 stores normalized listing snapshots, mapping decisions, exception status, resolution history, approver identity, and audit events. MySQL remains the source of truth. Each snapshot should include `product.ID` and `product.version` so Mapwise can identify stale data.

## Authorization

All page and API access must be checked server-side. The current implementation requires a signed-in email ending in `@bookingpal.com`. A future internal service endpoint should use separate scoped authentication and must not reuse an employee session.

## Data classification

Restricted fields include `product.TaxNumber`, `product.Physicaladdress`, owner/contact information, and raw listing payloads. Restrict these fields to internal operations views, exclude them from client-facing evidence, and avoid writing them to application logs.

## Channel boundary

Booking.com, Vrbo, and Expedia can reject mappings even when source validation passes. Store channel responses separately from source-data errors and mapping approvals.