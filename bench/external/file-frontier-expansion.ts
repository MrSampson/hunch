/** Development-only flat-file frontier expansion. */
import { createHash } from "node:crypto";
import { rankIssueAdaptiveCorrectionCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

export function buildFileFrontierPlan(issue: string, sources: ContractAxisOwnerSource[]) {
  const ranked = rankIssueAdaptiveCorrectionCandidates(issue, sources);
  const baseline = ranked.slice(0, 5);
  const baselineOwners = new Set(baseline.map((candidate) => candidate.owner));
  const anchoredFiles = new Set(baseline.map((candidate) => candidate.owner.split("::")[0]!));
  const frontier = ranked.map((candidate, index) => ({ ...candidate, global_rank: index + 1 }))
    .filter((candidate) => !baselineOwners.has(candidate.owner)
      && anchoredFiles.has(candidate.owner.split("::")[0]!))
    .slice(0, 6);
  const owners = [...baseline.map((candidate) => candidate.owner), ...frontier.map((candidate) => candidate.owner)];
  return {
    owners,
    frontier,
    receipt_id: createHash("sha256").update(JSON.stringify({
      rule: "flat-file-frontier-expansion-v5",
      anchored_files: [...anchoredFiles],
      owners,
      exact_owner_enabled: false,
    })).digest("hex").slice(0, 24),
  };
}
