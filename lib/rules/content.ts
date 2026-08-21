// Requirement rules from the "Maximum Requirement" sheet (content/data thresholds).
import type { Rule, RuleResult, RuleStatus } from "./types.ts";

// Subjective descriptors the channels reject in names/titles (per the sheet).
const BANNED_NAME_WORDS = [
  "luxurious", "luxury", "beautiful", "fantastic", "great view", "great views", "stunning",
  "gorgeous", "amazing", "perfect", "best", "close to", "near", "brand new", "newly",
];

function displayName(listing: Parameters<Rule["run"]>[0]): string {
  const l = listing.listing;
  return (l.useDisplayName && l.displayName ? l.displayName : l.name) ?? "";
}

// Property title/headline: 20–100 chars, no subjective descriptors.
export const nameQualityRule: Rule = {
  id: "name-quality",
  category: "Content",
  run: (listing): RuleResult[] => {
    const name = displayName(listing).trim();
    const len = name.length;
    const banned = BANNED_NAME_WORDS.filter(w => name.toLowerCase().includes(w));
    let status: RuleStatus = "pass";
    let detail = `Name is ${len} characters with no subjective descriptors.`;
    let fix: string | undefined;
    if (!name || len < 20 || len > 100) {
      status = "block";
      detail = `Name is ${len} characters — channels require 20–100.`;
      fix = "Use a specific 20–100 character name.";
    } else if (banned.length) {
      status = "review";
      detail = `Name contains subjective descriptors (${banned.join(", ")}) — channels may reject it.`;
      fix = "Remove subjective words; describe the property specifically instead.";
    }
    return [{ ruleId: "name-quality", category: "Content", channel: "all", label: `Name: "${name || "(none)"}"`, target: status === "pass" ? "Accepted" : "Fix name", status, detail, fix }];
  },
};

// Description length: 400–10,000 characters.
export const descriptionLengthRule: Rule = {
  id: "description-length",
  category: "Content",
  run: (listing): RuleResult[] => {
    const len = listing.listing.descriptionLength ?? 0;
    let status: RuleStatus = "pass";
    let detail = `Description is ${len} characters.`;
    let fix: string | undefined;
    if (len === 0) { status = "block"; detail = "No English description — required by all channels."; fix = "Add a 400–10,000 character description."; }
    else if (len < 400) { status = "block"; detail = `Description is ${len} characters — channels require at least 400.`; fix = "Expand the description to at least 400 characters."; }
    else if (len > 10000) { status = "review"; detail = `Description is ${len} characters — over the 10,000 maximum.`; fix = "Trim the description to under 10,000 characters."; }
    return [{ ruleId: "description-length", category: "Content", channel: "all", label: `Description length: ${len}`, target: status === "pass" ? "Accepted" : "Fix description", status, detail, fix }];
  },
};

// Square footage: at least 1 (Expedia and others hard-reject without it).
export const squareFootageRule: Rule = {
  id: "square-footage",
  category: "Content",
  run: (listing): RuleResult[] => {
    const raw = listing.listing.space;
    const n = Number(raw);
    const ok = Number.isFinite(n) && n >= 1;
    return [{
      ruleId: "square-footage", category: "Content", channel: "all",
      label: `Square footage: ${raw ?? "(none)"}`,
      target: ok ? "Accepted" : "Add square footage",
      status: ok ? "pass" : "block",
      detail: ok ? `${n}${listing.listing.spaceUnit ? " " + listing.listing.spaceUnit : ""} provided.` : "Square footage is missing — Expedia hard-rejects without it.",
      fix: ok ? undefined : "Add a square-footage value of at least 1.",
    }];
  },
};

// House rules and short description both required.
export const houseRulesShortDescRule: Rule = {
  id: "house-rules-short-desc",
  category: "Content",
  run: (listing): RuleResult[] => {
    const l = listing.listing;
    const ok = Boolean(l.houseRulesPresent) && Boolean(l.shortDescriptionPresent);
    const missing = [!l.houseRulesPresent ? "house rules" : null, !l.shortDescriptionPresent ? "short description" : null].filter(Boolean).join(" and ");
    return [{ ruleId: "house-rules-short-desc", category: "Content", channel: "all", label: "House rules / short description", target: ok ? "Accepted" : "Add content", status: ok ? "pass" : "block", detail: ok ? "House rules and short description present." : `Missing ${missing} — required.`, fix: ok ? undefined : `Add the ${missing}.` }];
  },
};

// Address required.
export const addressRule: Rule = {
  id: "address",
  category: "Content",
  run: (listing): RuleResult[] => {
    const ok = Boolean(listing.listing.addressPresent);
    return [{ ruleId: "address", category: "Content", channel: "all", label: "Address", target: ok ? "Present" : "Missing", status: ok ? "pass" : "block", detail: ok ? "Property address present." : "No address — required by all channels.", fix: ok ? undefined : "Add the property address." }];
  },
};
