// Validation rule registry — one independent, testable rule per requirement.
//
// Two kinds of rule share this interface:
//   - Mapping rules (property type, room type, amenities): two-gate, per-channel results
//     (a different suggested value/status per channel).
//   - Requirement rules (from the Maximum Requirement sheet): a threshold check, applied
//     to "all" channels or a specific one.
// Both return RuleResult[], so they roll up together into the per-channel verdict and the
// prioritized readout. Each rule is added independently and unit-tested on its own.

import type { PlatformListing } from "../platform-data.ts";

export type RuleStatus = "pass" | "review" | "block" | "n/a";

export type RuleResult = {
  ruleId: string;
  category: string;         // Property | Content | Rooms & beds | Amenities & policies | Compliance
  channel: string;          // "all" for channel-agnostic checks, else a channel name
  label: string;            // the evidence / what's being checked (supplier side)
  target: string;           // the value or verdict (channel side)
  status: RuleStatus;
  detail: string;           // plain-language evidence
  fix?: string;             // what to do about it
  suggested?: string;       // mapping rules: the suggested value
  options?: string[];       // mapping rules: allowed values to override to
  gate1?: boolean;          // mapping rules: mapped in BookingPal matrix
  gate2?: RuleStatus;       // mapping rules: valid per channel catalog
};

export type Rule = {
  id: string;
  category: string;
  run: (listing: PlatformListing, channels: string[]) => RuleResult[];
};
