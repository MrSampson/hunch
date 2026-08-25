/** Cross-view evidence policy for the repository-adaptive shortlist. */
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";

export type AdaptiveViewConsensusLevel = "supported" | "tentative" | "insufficient";

export interface AdaptiveViewConsensusEvidence {
  level: AdaptiveViewConsensusLevel;
  abstain: boolean;
  shared_owner: string | null;
  views_available: number;
  reason: string;
}

/** Split the product's plain-text issue into the same independent evidence
 * views used by the benchmark: first non-empty line and remaining prose. */
export function adaptiveIssueViews(issueValue: unknown): { full: string; title: string; body: string } {
  const full = typeof issueValue === "string" ? issueValue.trim().slice(0, 100_000) : "";
  if (!full) return { full: "", title: "", body: "" };
  const lines = full.split(/\r?\n/); const titleIndex = lines.findIndex((line) => line.trim());
  if (titleIndex < 0) return { full: "", title: "", body: "" };
  return { full, title: lines[titleIndex]!.trim(), body: lines.slice(titleIndex + 1).join("\n").trim() };
}

/** A supported label means that at least one declaration survives three
 * independent rankings. It describes the top-five shortlist, never an exact
 * owner, likely file, or probability. */
export function classifyAdaptiveViewConsensus(
  full: AdaptiveCorrectionCandidate[],
  title: AdaptiveCorrectionCandidate[],
  body: AdaptiveCorrectionCandidate[],
): AdaptiveViewConsensusEvidence {
  if (!full.length) {
    return { level: "insufficient", abstain: true, shared_owner: null, views_available: 0, reason: "no declaration candidates were found" };
  }
  const viewsAvailable = 1 + Number(title.length > 0) + Number(body.length > 0);
  if (viewsAvailable < 3) {
    return { level: "tentative", abstain: false, shared_owner: null, views_available: viewsAvailable, reason: "title and body were not both available as independent evidence views" };
  }
  const titleOwners = new Set(title.slice(0, 5).map((candidate) => candidate.owner));
  const bodyOwners = new Set(body.slice(0, 5).map((candidate) => candidate.owner));
  const shared = full.slice(0, 5).find((candidate) => titleOwners.has(candidate.owner) && bodyOwners.has(candidate.owner));
  if (shared) {
    return { level: "supported", abstain: false, shared_owner: shared.owner, views_available: 3, reason: "one declaration recurs in the full-text, title-only, and body-only top fives" };
  }
  return { level: "tentative", abstain: false, shared_owner: null, views_available: 3, reason: "the three independent evidence views do not share a top-five declaration" };
}
