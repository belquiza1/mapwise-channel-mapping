# Platform Listing Validation Rules

These rules were refined using a redacted SGL validation run against the live read-only platform database. They govern Mapwise readiness; they do not represent channel acceptance.

## Blocking rules

Use the status copy `Resolve before sync`.

1. **Product lifecycle:** Block when `product.State` is not Final.
2. **English listing text:** Prefer Final (`State = 3`) text. If only Created (`State = 2`) text exists, display it as evidence with `isFinal = false` and block readiness.
3. **Location consistency:** Block when physical address, the joined location record, and coordinates disagree materially. Restricted address and coordinate values must not appear in client-facing evidence or logs.

## Mapping-review rules

1. **Bedroom consistency:** Compare `product.Room`, `product.Bed`, and `product.Person` with bedroom and bed-detail totals. A match passes; a mismatch requires review.
2. **Property type:** Resolve only `PCT%` codes through product-type mappings. Aggregate distinct mapping names so synonyms do not create duplicate rows.
3. **Amenities and policies:** Keep unresolved attribute codes in the review queue. Do not drop them through an inner join.
4. **Attribute options:** Preserve options JSON for internal interpretation, but expose only safe, normalized evidence.

## Evidence and readiness

Available source content may be displayed even when it is not Final. Evidence availability and channel readiness are separate states. Booking.com, Vrbo, and Expedia responses are also separate from BookingPal validation and must be captured independently.

## Redaction

Do not commit or log raw tax numbers, physical addresses, precise coordinates, owner/contact data, credentials, or unredacted live result sets. Test fixtures must replace customer identifiers and restricted values with synthetic or summarized fields.
