// Mapping rule: property type (two-gate, per channel). Wraps validatePropertyType.
import type { Rule, RuleResult } from "./types.ts";
import { validatePropertyType, propertyTypeOptions } from "../channel-mapping.ts";

export const propertyTypeRule: Rule = {
  id: "property-type",
  category: "Property",
  run: (listing, channels): RuleResult[] => {
    const code = listing.listing.propertyTypeCode ?? null;
    return validatePropertyType(code, channels).map(r => ({
      ruleId: "property-type",
      category: "Property",
      channel: r.channel,
      label: `Property type ${code ?? "(none)"}`,
      target: r.mappedValue ?? "No mapping",
      status: r.status,
      detail: r.detail,
      fix: r.status === "block" ? "No BookingPal mapping for this channel — needs a mapping added, or a different property type." : undefined,
      suggested: r.mappedValue ?? undefined,
      options: propertyTypeOptions(r.channel),
      gate1: r.gate1Mapped,
      gate2: r.gate2,
    }));
  },
};
