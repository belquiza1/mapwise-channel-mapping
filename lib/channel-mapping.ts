// Two-gate channel validation for property type.
//
// Gate 1 — BookingPal mapping matrix: does the Channel Connector map this PCT code to
//          the channel at all? No mapping => we can't send it (a BookingPal-side gap).
// Gate 2 — Channel requirements: is the mapped value valid in the channel's own current
//          catalog (e.g. an allowed Booking.com unit type)? Catches stale/invalid mappings.
//
// Reference data is bundled (lib/reference/*.json) — the hosted app can't reach the
// Channel Connector API or the channel catalogs directly.

import ptMap from "./reference/property-type-map.json" with { type: "json" };
import bookingCatalog from "./reference/booking-unit-types.json" with { type: "json" };

export type MappingGate = "pass" | "review" | "block" | "n/a";

export type ChannelMappingResult = {
  channel: string;
  gate1Mapped: boolean;          // BookingPal matrix has a value for this channel
  mappedValue: string | null;    // what it maps to (channel's own term)
  gate2: MappingGate;            // does the mapped value satisfy the channel's catalog?
  status: MappingGate;          // overall (block if either gate blocks)
  detail: string;
};

const PT_INDEX: Record<string, Record<string, string>> = Object.fromEntries(
  (ptMap.propertyTypes as Array<{ code: string; channels: Record<string, string> }>).map(p => [p.code, p.channels]),
);
const PT_NAME: Record<string, string> = Object.fromEntries(
  (ptMap.propertyTypes as Array<{ code: string; name: string }>).map(p => [p.code, p.name]),
);

// Clean canonical name for a PCT code (e.g. PCT35 -> "Villa"), for display instead of the
// GROUP_CONCAT of every candidate catalog name.
export function propertyTypeName(pctCode: string | null | undefined): string | null {
  return pctCode ? (PT_NAME[pctCode] ?? null) : null;
}

// Booking.com allowed unit-type names + room names, lowercased, for the Gate-2 check.
const BOOKING_ALLOWED = new Set<string>();
for (const t of bookingCatalog.unitTypes as Array<{ unitType: string; allowedNames: string[] }>) {
  BOOKING_ALLOWED.add(t.unitType.toLowerCase());
  for (const n of t.allowedNames) BOOKING_ALLOWED.add(String(n).toLowerCase());
}

// Channels whose current catalog we can check for Gate 2. Others report gate2 = n/a
// (mapping present, but we don't yet hold their catalog to confirm the value).
const GATE2_CATALOG: Record<string, (value: string) => MappingGate> = {
  "Booking.com": v => (BOOKING_ALLOWED.has(v.toLowerCase()) ? "pass" : "block"),
};

// Channels whose property type comes from the Channel Connector PCT map. Expedia is not
// here — it maps property type via its own structureType catalog (handled separately), so
// a missing PCT entry for Expedia is "pending", not a hard block.
const PCT_MAPPED_CHANNELS = new Set(["Booking.com", "Vrbo", "AirBnB"]);

// Valid property-type values a rep can override to, per channel (for the picker).
// Booking.com: its 19 allowed unit types. Others: none held yet (rep confirms the suggestion).
export function propertyTypeOptions(channel: string): string[] {
  if (channel === "Booking.com") return (bookingCatalog.unitTypes as Array<{ unitType: string }>).map(t => t.unitType);
  return [];
}

export function validatePropertyType(pctCode: string | null | undefined, channels: string[]): ChannelMappingResult[] {
  const perChannel = pctCode ? PT_INDEX[pctCode] : undefined;
  return channels.map(channel => {
    const mappedValue = perChannel?.[channel] ?? null;
    if (!PCT_MAPPED_CHANNELS.has(channel)) {
      return { channel, gate1Mapped: false, mappedValue: null, gate2: "n/a", status: "review", detail: `${channel} maps property type via its structureType catalog — validation pending.` };
    }
    if (!pctCode) {
      return { channel, gate1Mapped: false, mappedValue: null, gate2: "n/a", status: "block", detail: "No property-type code on the listing." };
    }
    if (!mappedValue) {
      // Gate 1 fail: BookingPal has no mapping of this PCT to this channel.
      return { channel, gate1Mapped: false, mappedValue: null, gate2: "n/a", status: "block", detail: `${pctCode} has no BookingPal mapping for ${channel}.` };
    }
    const gate2 = GATE2_CATALOG[channel]?.(mappedValue) ?? "n/a";
    const status: MappingGate = gate2 === "block" ? "block" : gate2 === "n/a" ? "review" : "pass";
    const detail =
      gate2 === "block" ? `Mapped to "${mappedValue}", but that is not a current ${channel} unit type — the mapping is stale.`
      : gate2 === "n/a" ? `Mapped to "${mappedValue}". Confirm against the ${channel} catalog.`
      : `Mapped to "${mappedValue}" — valid ${channel} unit type.`;
    return { channel, gate1Mapped: true, mappedValue, gate2, status, detail };
  });
}
