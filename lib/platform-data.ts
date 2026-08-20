// Platform-listing data model, validation, and mapping transform.
//
// This is the "Sync platform listings" replacement for the temporary Supplier-API
// importer (see docs/DEVELOPMENT_HANDOFF.md). The input shape here is the normalized
// per-product record produced by the VPN-local sync runner (sync/extract-listings.mjs),
// which runs the read-only queries in sql/platform_listing_extract.sql. Nothing in this
// module talks to MySQL — the hosted app never holds platform credentials.
//
// Validation rules implement docs/VALIDATION_RULES.md and the corrected lifecycle
// semantics in docs/LISTING_STATE.md (product.State = 'Created' is the live/eligible
// state — the prototype had this inverted).

import { ValidationError, type ImportedSample, type MappingRow, type Status } from "./mapwise-data.ts";
import { propertyTypeName } from "./channel-mapping.ts";
import { runRules } from "./rules/index.ts";
import type { RuleStatus } from "./rules/types.ts";

export type CheckStatus = "pass" | "review" | "block" | "pending";
export type ValidationResult = { rule: string; status: CheckStatus; message?: string };

const BLOCK_COPY = "Resolve before sync";

// product.MultiUnit enum: OWN, PRM, SGL, MLT, SUB. product.ProductGroup: KEY, MULTI_REP, MULTI_KEY.
export type PlatformChild = {
  id: string;
  relationshipSource: string; // ParentID | PartofID | linked_id
  multiUnit?: string | null;
  productGroup?: string | null;
  state?: string | null;
};

export type PlatformListing = {
  source: {
    productId: string;
    structure: string;            // product.MultiUnit
    productGroup?: string | null; // product.ProductGroup
    productState: string;         // product.State
    sourceVersion: string;        // product.version (timestamp)
  };
  listing: {
    name: string;
    displayName?: string | null;
    useDisplayName?: boolean;
    rooms: number;                // product.Room
    bathrooms: number;            // product.Bathroom
    toilets?: number | null;      // product.Toilet
    reportedBeds: number;         // product.Bed
    maximumGuests: number;        // product.Person
    standardGuests?: number | null;
    childGuests?: number | null;  // product.Child
    infantGuests?: number | null; // product.Infant
    propertyTypeCode?: string | null; // PCT%
    propertyTypeName?: string | null;
    checkInTime?: string | null;
    checkInToTime?: string | null;
    checkOutTime?: string | null;
    currency?: string | null;
    space?: string | null;        // product.Space (varchar)
    spaceUnit?: string | null;    // product.SpaceUnit: m2 | ft2
    // Restricted fields are represented as presence flags only — never values.
    taxNumberPresent?: boolean;
    // English listing text presence (product_text State 3 = Final, 2 = Created).
    finalEnglishTextPresent?: boolean;
    createdEnglishTextPresent?: boolean;
    descriptionLength?: number; // English Description length (chars, not the text)
    shortDescriptionPresent?: boolean;
    houseRulesPresent?: boolean;
    addressPresent?: boolean;
    policyGroups?: string[]; // Parking / Pet / Internet groups the product has defined
  };
  bedroomConfiguration: {
    bedrooms?: number;            // count of product_bedroom rows
    bedCount?: number;            // sum of product_bedroom_bed.BedCount
    guestCapacity?: number;       // sum of product_bedroom.Guests
    matchesProductHeader?: boolean;
    rows?: number;                // raw row count (0 expected at MULTI_REP parent)
  };
  attributes: {
    unresolvedCount: number;
    unresolvedCodes?: string[] | string;
    resolved?: Array<{ code: string; displayName?: string | null; category?: string | null }>;
    propertyTypeFanoutCollapsed?: boolean;
    amenities?: Array<{ code: string; name?: string | null }>;
  };
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
    // Consistency signals computed by the runner (raw address/coords never leave the VPN).
    cityAndCoordinatesAgree?: boolean;
    postalCodesAgree?: boolean;
  };
  childUnits?: PlatformChild[];
  // Property manager (party.Name via product.SupplierID) — the business account, not guest PII.
  manager?: { name?: string | null; contact?: string | null };
  // Current status on each report channel (Booking.com / Vrbo / Expedia). onChannel=false
  // means no channel_product_map row yet — a candidate to push. State labels are already
  // resolved by the runner from the ChannelState / portal_state enums.
  channels?: PlatformChannelStatus[];
  // Photo summary (counts only — never the image data).
  photos?: { count: number; belowResolution: number; hasMainPhoto: boolean; taggedCount: number };
};

export type PlatformChannelStatus = {
  channel: string;
  onChannel: boolean;
  channelState?: string | null;
  portalState?: string | null;
  reviewStatus?: string | null;
  rejectedReason?: string | null;
};

/** True for a MULTI_REP parent, where zero room/bath/bed counts are expected. */
export function isMultiRepParent(listing: PlatformListing): boolean {
  return listing.source.structure === "OWN" && listing.source.productGroup === "MULTI_REP";
}

export function parsePlatformListing(value: unknown): PlatformListing {
  if (!value || typeof value !== "object") throw new ValidationError("Platform listing must be a JSON object.");
  const v = value as Record<string, unknown>;
  const source = v.source as PlatformListing["source"] | undefined;
  const listing = v.listing as PlatformListing["listing"] | undefined;
  if (!source || typeof source !== "object" || !listing || typeof listing !== "object") {
    throw new ValidationError("Platform listing requires 'source' and 'listing' objects.");
  }
  if (source.productId === undefined || source.productId === null || String(source.productId).length === 0) {
    throw new ValidationError("Platform listing is missing source.productId.");
  }
  if (!source.productState) throw new ValidationError("Platform listing is missing source.productState.");
  if (!listing.name) throw new ValidationError("Platform listing is missing listing.name.");
  if (!Number.isFinite(listing.rooms) || !Number.isFinite(listing.bathrooms) || !Number.isFinite(listing.maximumGuests) || !Number.isFinite(listing.reportedBeds)) {
    throw new ValidationError("Platform listing requires numeric rooms, bathrooms, reportedBeds, and maximumGuests.");
  }
  // Normalize productId to a string so downstream keys/ids are stable.
  return { ...(value as PlatformListing), source: { ...source, productId: String(source.productId) } };
}

/**
 * Apply the Mapwise readiness rules. Order and rule names follow
 * docs/VALIDATION_RULES.md. Returns one result per applicable rule.
 */
export function validatePlatformListing(listing: PlatformListing): ValidationResult[] {
  const results: ValidationResult[] = [];
  const parent = isMultiRepParent(listing);

  // Blocking rule 1 — product lifecycle (LISTING_STATE.md).
  const state = listing.source.productState;
  if (state === "Created") {
    results.push({ rule: "product-lifecycle", status: "pass" });
  } else if (state === "Incomplete") {
    results.push({ rule: "product-lifecycle", status: "review", message: "Onboarding draft — out of pilot scope" });
  } else {
    results.push({ rule: "product-lifecycle", status: "block", message: BLOCK_COPY });
  }

  // Blocking rule 2 — English listing text (prefer Final, block Created-only/missing).
  if (listing.listing.finalEnglishTextPresent) {
    results.push({ rule: "final-english-text", status: "pass" });
  } else if (listing.listing.createdEnglishTextPresent) {
    results.push({ rule: "final-english-text", status: "block", message: BLOCK_COPY });
  } else {
    results.push({ rule: "final-english-text", status: "block", message: "Listing text missing — " + BLOCK_COPY });
  }

  // Blocking rule 3 — location consistency (postal-only mismatch is review, not block).
  if (listing.location) {
    if (listing.location.cityAndCoordinatesAgree === false) {
      results.push({ rule: "location-consistency", status: "block", message: BLOCK_COPY });
    } else if (listing.location.postalCodesAgree === false) {
      results.push({ rule: "location-consistency", status: "review", message: "Postal code differs; city and coordinates agree" });
    } else {
      results.push({ rule: "location-consistency", status: "pass" });
    }
  }

  // Counts — MULTI_REP parent vs sellable unit.
  if (parent) {
    const zeroed = listing.listing.rooms === 0 && listing.listing.bathrooms === 0 && listing.listing.reportedBeds === 0;
    results.push({
      rule: "multi-rep-parent-counts",
      status: zeroed ? "pass" : "review",
      message: zeroed ? undefined : "Non-zero counts at a MULTI_REP parent are unexpected",
    });
    results.push({
      rule: "child-unit-validation",
      status: (listing.childUnits && listing.childUnits.length > 0) ? "pending" : "review",
      message: (listing.childUnits && listing.childUnits.length > 0)
        ? "Validate each linked child unit"
        : "No linked children discovered via ParentID/PartofID/linked_id",
    });
  } else {
    results.push({
      rule: "bedroom-consistency",
      status: listing.bedroomConfiguration.matchesProductHeader ? "pass" : "review",
      message: listing.bedroomConfiguration.matchesProductHeader ? undefined : "Room/bed/guest totals differ from bedroom detail",
    });
  }

  // Mapping-review — property type (PCT resolution).
  if (listing.listing.propertyTypeCode && listing.listing.propertyTypeName) {
    results.push({ rule: "property-type-resolution", status: "pass" });
  } else if (listing.listing.propertyTypeCode) {
    results.push({ rule: "property-type-resolution", status: "review", message: "PCT code did not resolve to a mapping name" });
  } else {
    results.push({ rule: "property-type-resolution", status: "review", message: "No PCT property-type code present" });
  }

  // Mapping-review — unresolved attributes stay in the queue.
  results.push({
    rule: "unresolved-attributes",
    status: listing.attributes.unresolvedCount > 0 ? "review" : "pass",
    message: listing.attributes.unresolvedCount > 0 ? `${listing.attributes.unresolvedCount} unresolved attribute code(s)` : undefined,
  });

  return results;
}

export function summarizeValidation(results: ValidationResult[]): { passes: number; blockers: number; reviews: number; pending: number } {
  return {
    passes: results.filter(r => r.status === "pass").length,
    blockers: results.filter(r => r.status === "block").length,
    reviews: results.filter(r => r.status === "review").length,
    pending: results.filter(r => r.status === "pending").length,
  };
}

const CHECK_TO_ROW_STATUS: Record<CheckStatus, Status> = {
  pass: "approved",
  review: "review",
  block: "rejected",
  pending: "review",
};

const RULE_CATEGORY: Record<string, string> = {
  "product-lifecycle": "Validation",
  "final-english-text": "Validation",
  "location-consistency": "Validation",
  "bedroom-consistency": "Room & beds",
  "multi-rep-parent-counts": "Room & beds",
  "child-unit-validation": "Room & beds",
  "property-type-resolution": "Property",
  "unresolved-attributes": "Amenities & policies",
};

/**
 * Build the mapping-review sample the UI renders, from a platform listing.
 * Mirrors buildImportedSample's ImportedSample shape so the client is unchanged,
 * but the evidence and checks come from the platform record + validation rules.
 * Restricted values (tax number, address, coordinates) are never emitted here —
 * only presence/consistency flags.
 */
export function buildPlatformSample(listing: PlatformListing): ImportedSample {
  const l = listing.listing;
  const results = validatePlatformListing(listing);
  const propertyType = propertyTypeName(l.propertyTypeCode) || l.propertyTypeCode || "Not provided";
  const bookingName = l.useDisplayName && l.displayName ? l.displayName : l.name;
  const channels = ["Booking.com", "Vrbo", "Expedia"];
  let id = 2000;
  const rows: MappingRow[] = [];

  // Validation rule registry — property-type mapping (two-gate, per channel) plus the
  // requirement rules from the Maximum Requirement sheet. Each rule is independent; add
  // more in lib/rules. Runs alongside the legacy validatePlatformListing checks below
  // until those migrate into the registry too.
  const RULE_TO_ROW: Record<RuleStatus, Status> = { pass: "approved", review: "review", block: "rejected", "n/a": "review" };
  for (const r of runRules(listing, channels)) {
    rows.push({
      id: id++,
      category: r.category,
      supplier: r.label,
      channel: r.channel === "all" ? "All channels" : r.channel,
      target: r.target,
      confidence: r.status === "pass" ? 96 : r.status === "block" ? 20 : 60,
      status: RULE_TO_ROW[r.status],
      note: r.fix ? `${r.detail} ${r.fix}` : r.detail,
      suggested: r.suggested,
      options: r.options,
      gate1: r.gate1,
      gate2: r.gate2,
    });
  }

  // One row per validation result (spread across channels round-robin for display).
  // Skip property-type-resolution — the two-gate property rows above already cover it.
  results.filter(r => r.rule !== "property-type-resolution").forEach((r, i) => {
    rows.push({
      id: id++,
      category: RULE_CATEGORY[r.rule] ?? "Validation",
      supplier: describeEvidence(r.rule, listing),
      channel: channels[i % channels.length],
      target: r.status === "pass" ? "Accepted" : r.rule.replace(/-/g, " "),
      confidence: r.status === "pass" ? 96 : r.status === "block" ? 20 : 60,
      status: CHECK_TO_ROW_STATUS[r.status],
      note: r.status === "block" ? BLOCK_COPY : r.message,
    });
  });

  const beds = listing.bedroomConfiguration.bedCount ?? l.reportedBeds;
  return {
    name: bookingName,
    id: String(listing.source.productId),
    kind: `Platform ${listing.source.structure}`,
    rooms: l.rooms,
    beds,
    guests: l.maximumGuests,
    space: l.space && l.spaceUnit ? `${l.space} ${l.spaceUnit}` : "Not provided",
    propertyType,
    rows,
    channels: listing.channels ?? [],
    propertyManager: listing.manager?.name ?? null,
    managerContact: listing.manager?.contact ?? null,
  };
}

// Human-readable, redaction-safe evidence string for a rule.
function describeEvidence(rule: string, listing: PlatformListing): string {
  const l = listing.listing;
  switch (rule) {
    case "product-lifecycle": return `State = ${listing.source.productState}`;
    case "final-english-text": return l.finalEnglishTextPresent ? "Final English text present" : l.createdEnglishTextPresent ? "Created text only (not Final)" : "No English text";
    case "location-consistency": return "City/coordinate/postal consistency";
    case "bedroom-consistency": return `rooms=${l.rooms} / beds=${l.reportedBeds} / guests=${l.maximumGuests}`;
    case "multi-rep-parent-counts": return `MULTI_REP parent counts (rooms=${l.rooms}, baths=${l.bathrooms}, beds=${l.reportedBeds})`;
    case "child-unit-validation": return `${listing.childUnits?.length ?? 0} linked child unit(s)`;
    case "property-type-resolution": return `${l.propertyTypeCode ?? "no PCT"} → ${l.propertyTypeName ?? "unresolved"}`;
    case "unresolved-attributes": return `${listing.attributes.unresolvedCount} unresolved code(s)`;
    default: return rule;
  }
}
