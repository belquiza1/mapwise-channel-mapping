# Platform Listing Validation Rules

These rules were refined using a redacted SGL validation run against the live read-only platform database. They govern Mapwise readiness; they do not represent channel acceptance.

## Blocking rules

Use the status copy `Resolve before sync`.

1. **Product lifecycle:** Only `product.State = 'Created'` listings are eligible for mapping review — `Created` is the live/active state (verified against booking activity; see [Listing state](LISTING_STATE.md)). Exclude `Final` (retired/archived), `Suspended` (paused), and `Initial` (abandoned). `Incomplete` is an active onboarding pipeline that may be enabled for pre-launch mapping but is out of pilot scope. Do **not** confuse `product.State = 'Final'` (retired) with `product_text.State = 3` ("Final" = finalized text, which is good).
2. **English listing text:** Prefer Final (`State = 3`) text. If only Created (`State = 2`) text exists, display it as evidence with `isFinal = false` and block readiness.
3. **Location consistency:** Block when city/region and coordinates disagree materially. A postal-code-only disagreement when city and coordinates agree is a review item, not an automatic blocker. Restricted address and coordinate values must not appear in client-facing evidence or logs.

## Mapping-review rules

1. **Bedroom consistency:** Compare `product.Room`, `product.Bed`, and `product.Person` with bedroom and bed-detail totals. A match passes; a mismatch requires review.
2. **Property type:** Resolve only `PCT%` codes through product-type mappings. Aggregate distinct mapping names so synonyms do not create duplicate rows.
3. **Amenities and policies:** Keep unresolved attribute codes in the review queue. Do not drop them through an inner join.
4. **Attribute options:** Preserve options JSON for internal interpretation, but expose only safe, normalized evidence.
5. **MULTI_REP parent:** For `MultiUnit = OWN` and `ProductGroup = MULTI_REP`, zero room, bathroom, and bed counts with no bedroom rows are expected at the parent. Do not create a count blocker at that level; discover linked children through `ParentID`, `PartofID`, or `linked_id` and validate their sellable configuration.
6. **Minor location mismatch:** When city and coordinates agree but postal codes differ, create an internal review item and retain the evidence without exposing the raw address.

## Evidence and readiness

Available source content may be displayed even when it is not Final. Evidence availability and channel readiness are separate states. Booking.com, Vrbo, and Expedia responses are also separate from BookingPal validation and must be captured independently.

## Redaction

Do not commit or log raw tax numbers, physical addresses, precise coordinates, owner/contact data, credentials, or unredacted live result sets. Test fixtures must replace customer identifiers and restricted values with synthetic or summarized fields.
