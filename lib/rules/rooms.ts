// Requirement rules for room/occupancy counts (Maximum Requirement sheet).
import type { Rule, RuleResult } from "./types.ts";

// Inlined (avoids a value import cycle with platform-data): a MULTI_REP parent
// legitimately carries zero room/bath counts — the counts live on its child units.
function isMultiRepParent(listing: Parameters<Rule["run"]>[0]): boolean {
  return listing.source.structure === "OWN" && listing.source.productGroup === "MULTI_REP";
}

export const bedroomsBathroomsRule: Rule = {
  id: "bedrooms-bathrooms",
  category: "Rooms & beds",
  run: (listing): RuleResult[] => {
    const l = listing.listing;
    if (isMultiRepParent(listing)) {
      return [{ ruleId: "bedrooms-bathrooms", category: "Rooms & beds", channel: "all", label: "Bedrooms / bathrooms", target: "Not applicable", status: "pass", detail: "Multi-rep parent — counts live on the child units." }];
    }
    const roomsOk = (l.rooms ?? 0) > 0;
    const bathsOk = (l.bathrooms ?? 0) > 0;
    const ok = roomsOk && bathsOk;
    const missing = [!roomsOk ? "bedroom" : null, !bathsOk ? "bathroom" : null].filter(Boolean).join(" and ");
    return [{
      ruleId: "bedrooms-bathrooms", category: "Rooms & beds", channel: "all",
      label: `Bedrooms ${l.rooms ?? 0} / bathrooms ${l.bathrooms ?? 0}`,
      target: ok ? "Accepted" : "Add counts",
      status: ok ? "pass" : "block",
      detail: ok ? "Bedroom and bathroom counts present." : `Missing ${missing} count — required by all channels.`,
      fix: ok ? undefined : "Set the bedroom and bathroom counts.",
    }];
  },
};

export const occupancyRule: Rule = {
  id: "min-occupancy",
  category: "Rooms & beds",
  run: (listing): RuleResult[] => {
    const g = listing.listing.maximumGuests ?? 0;
    const ok = g > 0;
    return [{
      ruleId: "min-occupancy", category: "Rooms & beds", channel: "all",
      label: `Max occupancy: ${g}`,
      target: ok ? "Accepted" : "Set occupancy",
      status: ok ? "pass" : "block",
      detail: ok ? `Sleeps ${g}.` : "Occupancy not set — required by all channels.",
      fix: ok ? undefined : "Set the maximum occupancy.",
    }];
  },
};
