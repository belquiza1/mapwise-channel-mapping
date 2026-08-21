// Photo rules (Maximum Requirement sheet). Photos are the #1 documented rejection driver.
import type { Rule, RuleResult, RuleStatus } from "./types.ts";

function photos(listing: Parameters<Rule["run"]>[0]) {
  return listing.photos ?? { count: 0, belowResolution: 0, hasMainPhoto: false, taggedCount: 0 };
}

// Main photo set — "main photo not set" was the single biggest photo rejection.
export const mainPhotoRule: Rule = {
  id: "main-photo",
  category: "Photos",
  run: (listing): RuleResult[] => {
    const p = photos(listing);
    const ok = p.hasMainPhoto && p.count > 0;
    return [{
      ruleId: "main-photo", category: "Photos", channel: "all",
      label: "Main photo",
      target: ok ? "Set" : "Not set",
      status: ok ? "pass" : "block",
      detail: ok ? "A main photo is set." : "No main photo set — the most common channel rejection.",
      fix: ok ? undefined : "Set a main/first photo (sort order 1).",
    }];
  },
};

// Photo count: 10–50.
export const photoCountRule: Rule = {
  id: "photo-count",
  category: "Photos",
  run: (listing): RuleResult[] => {
    const n = photos(listing).count;
    let status: RuleStatus = "pass";
    let detail = `${n} photos.`;
    let fix: string | undefined;
    if (n < 10) { status = "block"; detail = `${n} photos — channels require at least 10.`; fix = `Add at least ${10 - n} more photos.`; }
    else if (n > 50) { status = "review"; detail = `${n} photos — over the 50 maximum.`; fix = "Reduce to 50 or fewer photos."; }
    return [{ ruleId: "photo-count", category: "Photos", channel: "all", label: `Photos: ${n}`, target: status === "pass" ? "Accepted" : "Fix count", status, detail, fix }];
  },
};

// Photo resolution: at least 1024x768.
export const photoResolutionRule: Rule = {
  id: "photo-resolution",
  category: "Photos",
  run: (listing): RuleResult[] => {
    const p = photos(listing);
    const ok = p.belowResolution === 0;
    return [{
      ruleId: "photo-resolution", category: "Photos", channel: "all",
      label: "Photo resolution",
      target: ok ? "Accepted" : `${p.belowResolution} low-res`,
      status: ok ? "pass" : "review",
      detail: ok ? "All photos meet 1024x768." : `${p.belowResolution} of ${p.count} photos are below 1024x768.`,
      fix: ok ? undefined : "Replace the low-resolution photos (minimum 1024x768).",
    }];
  },
};
