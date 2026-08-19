// Amenity rules — both requirement (count, required types) and mapping (two-gate coverage).
import type { Rule, RuleResult } from "./types.ts";
import amenityMap from "../reference/amenity-map.json" with { type: "json" };

const AMENITY_CODES: Record<string, { name: string; channels: string[] }> =
  (amenityMap as { codes: Record<string, { name: string; channels: string[] }> }).codes;

function amenityList(listing: Parameters<Rule["run"]>[0]): Array<{ code: string; name?: string | null }> {
  return listing.attributes.amenities ?? [];
}

// Minimum 14 amenities.
export const amenityCountRule: Rule = {
  id: "amenity-count",
  category: "Amenities & policies",
  run: (listing): RuleResult[] => {
    const count = amenityList(listing).length;
    const ok = count >= 14;
    return [{
      ruleId: "amenity-count", category: "Amenities & policies", channel: "all",
      label: `Amenities: ${count}`,
      target: ok ? "Accepted" : "Add amenities",
      status: ok ? "pass" : "block",
      detail: ok ? `${count} amenities.` : `${count} amenities — channels require at least 14.`,
      fix: ok ? undefined : `Add at least ${14 - count} more amenities.`,
    }];
  },
};

// Required types: Private bathroom AND Kitchen/Kitchenette.
export const requiredAmenitiesRule: Rule = {
  id: "required-amenities",
  category: "Amenities & policies",
  run: (listing): RuleResult[] => {
    const names = amenityList(listing).map(a => (a.name ?? "").toLowerCase());
    const hasBathroom = names.some(n => n.includes("private bath"));
    const hasKitchen = names.some(n => n.includes("kitchen"));
    const ok = hasBathroom && hasKitchen;
    const missing = [!hasBathroom ? "Private bathroom" : null, !hasKitchen ? "Kitchen/Kitchenette" : null].filter(Boolean).join(" and ");
    return [{
      ruleId: "required-amenities", category: "Amenities & policies", channel: "all",
      label: "Required amenities",
      target: ok ? "Accepted" : "Add required",
      status: ok ? "pass" : "block",
      detail: ok ? "Private bathroom and kitchen present." : `Missing required amenity: ${missing}.`,
      fix: ok ? undefined : `Add ${missing}.`,
    }];
  },
};

// Mapping (per channel): which of the listing's amenities carry to each channel.
export const amenityMappingRule: Rule = {
  id: "amenity-mapping",
  category: "Amenities & policies",
  run: (listing, channels): RuleResult[] => {
    const codes = amenityList(listing).map(a => a.code);
    return channels.map(channel => {
      // Only amenities we hold mapping info for can be judged; others are unknown.
      const known = codes.filter(c => AMENITY_CODES[c]);
      const unmapped = known.filter(c => !AMENITY_CODES[c].channels.includes(channel));
      const ok = unmapped.length === 0;
      const names = unmapped.slice(0, 4).map(c => AMENITY_CODES[c].name);
      return {
        ruleId: "amenity-mapping", category: "Amenities & policies", channel,
        label: `Amenities → ${channel}`,
        target: ok ? `All ${known.length} map` : `${unmapped.length} won't map`,
        status: ok ? "pass" : "review",
        detail: ok
          ? `All ${known.length} recognized amenities map to ${channel}.`
          : `${unmapped.length} of ${known.length} amenities have no ${channel} mapping${names.length ? `: ${names.join(", ")}${unmapped.length > 4 ? "…" : ""}` : ""}.`,
        fix: ok ? undefined : `These amenities won't appear on ${channel} — add a mapping or drop them.`,
      };
    });
  },
};
