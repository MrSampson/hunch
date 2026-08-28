/** Interpretable evidence policy for the repository-adaptive shortlist. */
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";

export type AdaptiveShortlistEvidenceLevel = "supported" | "tentative" | "insufficient";

export interface AdaptiveShortlistEvidence {
  level: AdaptiveShortlistEvidenceLevel;
  abstain: boolean;
  path_terms: number;
  symbol_terms: number;
  score_gap: number | null;
  reasons: string[];
}

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Describe only observable support for the bounded shortlist. This is not a
 * probability and must never be interpreted as exact-owner authority.
 */
export function classifyAdaptiveShortlistEvidence(
  candidates: AdaptiveCorrectionCandidate[],
): AdaptiveShortlistEvidence {
  const top = candidates[0];
  if (!top) {
    return {
      level: "insufficient",
      abstain: true,
      path_terms: 0,
      symbol_terms: 0,
      score_gap: null,
      reasons: ["no declaration candidates were found"],
    };
  }

  const runnerUp = candidates[1];
  const scoreGap = runnerUp ? round(top.score - runnerUp.score) : null;
  if (top.path_overlap >= 2 && (scoreGap === null || scoreGap >= 2)) {
    return {
      level: "supported",
      abstain: false,
      path_terms: top.path_overlap,
      symbol_terms: top.symbol_overlap,
      score_gap: scoreGap,
      reasons: [
        `top file path matches ${top.path_overlap} issue terms`,
        scoreGap === null ? "only one candidate was found" : `top candidate leads the runner-up by ${scoreGap} points`,
      ],
    };
  }

  if (top.path_overlap > 0 || top.symbol_overlap > 0) {
    return {
      level: "tentative",
      abstain: false,
      path_terms: top.path_overlap,
      symbol_terms: top.symbol_overlap,
      score_gap: scoreGap,
      reasons: [
        `top candidate has ${top.path_overlap} path-term and ${top.symbol_overlap} symbol-term matches`,
        "the preregistered support threshold was not met",
      ],
    };
  }

  return {
    level: "insufficient",
    abstain: true,
    path_terms: 0,
    symbol_terms: 0,
    score_gap: scoreGap,
    reasons: ["the top candidate has no issue-term overlap with its repository path or symbol"],
  };
}
