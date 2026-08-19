// The validation rule registry. Add a rule here and it runs for every listing.
import type { PlatformListing } from "../platform-data.ts";
import type { Rule, RuleResult } from "./types.ts";
import { propertyTypeRule } from "./property-type.ts";
import { nameQualityRule, squareFootageRule, descriptionLengthRule } from "./content.ts";
import { bedroomsBathroomsRule, occupancyRule } from "./rooms.ts";
import { amenityCountRule, requiredAmenitiesRule, amenityMappingRule } from "./amenities.ts";
import { mainPhotoRule, photoCountRule, photoResolutionRule } from "./photos.ts";

export const RULES: Rule[] = [
  propertyTypeRule,
  mainPhotoRule,
  photoCountRule,
  photoResolutionRule,
  nameQualityRule,
  descriptionLengthRule,
  squareFootageRule,
  bedroomsBathroomsRule,
  occupancyRule,
  amenityCountRule,
  requiredAmenitiesRule,
  amenityMappingRule,
  // Batch 3 (availability, policies, contacts) and room-type mapping added here next.
];

export function runRules(listing: PlatformListing, channels: string[]): RuleResult[] {
  return RULES.flatMap(rule => rule.run(listing, channels));
}

export type { Rule, RuleResult } from "./types.ts";
