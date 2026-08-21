// Amenity rules — both requirement (count, required types) and mapping (two-gate coverage).
import type { Rule, RuleResult } from "./types.ts";
import amenityMap from "../reference/amenity-map.json" with { type: "json" };
import amenityVocab from "../reference/channel-amenity-vocab.json" with { type: "json" };

const AMENITY_CODES: Record<string, { name: string; channels: string[] }> =
  (amenityMap as { codes: Record<string, { name: string; channels: string[] }> }).codes;
const VOCAB = amenityVocab as Record<string, string[]>;

function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
}
// Closest amenity the channel accepts. Requires the amenity's key noun (its longest token)
// to appear in the candidate, then ranks by token overlap, preferring the closest (shortest)
// term. Conservative — returns nothing rather than a misleading match.
function suggestAmenity(name: string, channel: string): string | undefined {
  const want = tokens(name);
  if (!want.length) return undefined;
  const key = want.reduce((a, b) => (b.length > a.length ? b : a));
  let best: string | undefined, bestScore = 0, bestLen = Infinity;
  for (const term of VOCAB[channel] ?? []) {
    const tt = tokens(term);
    const have = new Set(tt);
    if (!have.has(key)) continue; // the key noun must match
    const score = want.filter(t => have.has(t)).length / want.length;
    if (score > bestScore || (score === bestScore && tt.length < bestLen)) { bestScore = score; best = term; bestLen = tt.length; }
  }
  return best;
}

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

// Policies: parking, pets, and WiFi must be defined (children/smoking live elsewhere).
export const policiesRule: Rule = {
  id: "policies",
  category: "Amenities & policies",
  run: (listing): RuleResult[] => {
    const have = new Set(listing.listing.policyGroups ?? []);
    const required: Array<[string, string]> = [["Parking", "parking"], ["Pet", "pets"], ["Internet", "WiFi"]];
    const missing = required.filter(([g]) => !have.has(g)).map(([, label]) => label);
    const ok = missing.length === 0;
    return [{
      ruleId: "policies", category: "Amenities & policies", channel: "all",
      label: "Policies (parking / pets / WiFi)",
      target: ok ? "Accepted" : "Add policies",
      status: ok ? "pass" : "review",
      detail: ok ? "Parking, pet, and WiFi policies present." : `Missing policy: ${missing.join(", ")}.`,
      fix: ok ? undefined : `Add the ${missing.join(", ")} ${missing.length > 1 ? "policies" : "policy"}.`,
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
      const details = unmapped.map(c => {
        const nm = AMENITY_CODES[c].name;
        return { name: nm, suggestion: suggestAmenity(nm, channel) };
      });
      return {
        ruleId: "amenity-mapping", category: "Amenities & policies", channel,
        label: `Amenities → ${channel}`,
        target: ok ? `All ${known.length} map` : `${unmapped.length} won't map`,
        status: ok ? "pass" : "review",
        detail: ok
          ? `All ${known.length} recognized amenities map to ${channel}.`
          : `${unmapped.length} of ${known.length} amenities won't carry to ${channel}.`,
        fix: ok ? undefined : `These amenities won't appear on ${channel} — map or drop them (see the list).`,
        details: ok ? undefined : details,
      };
    });
  },
};
