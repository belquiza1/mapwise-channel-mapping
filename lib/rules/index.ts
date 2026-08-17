// The validation rule registry. Add a rule here and it runs for every listing.
import type { PlatformListing } from "../platform-data.ts";
import type { Rule, RuleResult } from "./types.ts";
import { propertyTypeRule } from "./property-type.ts";
import { nameQualityRule, squareFootageRule } from "./content.ts";

export const RULES: Rule[] = [
  propertyTypeRule,
  nameQualityRule,
  squareFootageRule,
  // Batch 2 (photos), Batch 3 (availability, policies, contacts), and room-type/amenity
  // mapping rules are added here as their data lands.
];

export function runRules(listing: PlatformListing, channels: string[]): RuleResult[] {
  return RULES.flatMap(rule => rule.run(listing, channels));
}

export type { Rule, RuleResult } from "./types.ts";
