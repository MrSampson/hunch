/** Development-only fixed-allocation hybrid of promoted semantic clusters and
 * the same-file declaration frontier. */
import { createHash } from "node:crypto";
import { buildFileFirstDeclarationClusters, buildProgressiveDeclarationPlan } from "../../src/core/declarationClusters.js";
import { rankIssueAdaptiveCorrectionCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

export interface HybridFrontierVariant {
  cluster_slots: number;
  frontier_slots: number;
  owners: string[];
  supplemental: Array<{
    owner: string;
    source: "semantic-cluster" | "same-file-frontier";
    global_rank: number;
  }>;
  receipt_id: string;
}

export interface AdditiveFrontierVariant {
  added_frontier_slots: number;
  owners: string[];
  receipt_id: string;
}

/** Keep every candidate from the promoted 11-item plan, then append a small
 * same-file rescue tail. This intentionally evaluates accuracy against a
 * slightly larger bounded budget rather than trading away proven coverage. */
export function buildAdditiveFrontierVariants(
  promotedOwners: string[],
  frontierOwners: string[],
): AdditiveFrontierVariant[] {
  return Array.from({ length: 7 }, (_, addedFrontierSlots) => {
    const existing = new Set(promotedOwners);
    const appended: string[] = [];
    if (addedFrontierSlots > 0) {
      for (const owner of frontierOwners) {
        if (existing.has(owner)) continue;
        appended.push(owner);
        existing.add(owner);
        if (appended.length >= addedFrontierSlots) break;
      }
    }
    const owners = [...promotedOwners, ...appended];
    return {
      added_frontier_slots: addedFrontierSlots,
      owners,
      receipt_id: createHash("sha256").update(JSON.stringify({
        rule: "additive-same-file-frontier-development-v5",
        promoted_plan_preserved: true,
        added_frontier_slots: addedFrontierSlots,
        owners,
        exact_owner_enabled: false,
      })).digest("hex").slice(0, 24),
    };
  });
}

export function buildHybridFrontierVariants(
  issue: string,
  sources: ContractAxisOwnerSource[],
): HybridFrontierVariant[] {
  const ranked = rankIssueAdaptiveCorrectionCandidates(issue, sources);
  const baseline = ranked.slice(0, 5);
  const baselineOwners = new Set(baseline.map((candidate) => candidate.owner));
  const globalRank = new Map(ranked.map((candidate, index) => [candidate.owner, index + 1]));
  const clusters = buildFileFirstDeclarationClusters(ranked);
  const clusterSupplement = buildProgressiveDeclarationPlan(ranked, clusters).candidates
    .slice(baseline.length)
    .map((candidate) => candidate.owner);
  const anchoredFiles = new Set(baseline.map((candidate) => candidate.owner.split("::")[0]!));
  const frontierSupplement = ranked
    .filter((candidate) => !baselineOwners.has(candidate.owner)
      && anchoredFiles.has(candidate.owner.split("::")[0]!))
    .map((candidate) => candidate.owner);

  return Array.from({ length: 7 }, (_, clusterSlots) => {
    const frontierSlots = 6 - clusterSlots;
    const selected = new Map<string, HybridFrontierVariant["supplemental"][number]>();
    const take = (owners: string[], count: number, source: "semantic-cluster" | "same-file-frontier"): void => {
      if (count <= 0) return;
      let taken = 0;
      for (const owner of owners) {
        if (selected.has(owner)) continue;
        selected.set(owner, { owner, source, global_rank: globalRank.get(owner)! });
        taken += 1;
        if (taken >= count) break;
      }
    };
    take(clusterSupplement, clusterSlots, "semantic-cluster");
    take(frontierSupplement, frontierSlots, "same-file-frontier");
    // Duplicate candidates can consume a nominal quota. Refill from the
    // promoted cluster first, then the frontier, while retaining the fixed
    // allocation's priority and the hard six-slot budget.
    take(clusterSupplement, Math.max(0, 6 - selected.size), "semantic-cluster");
    take(frontierSupplement, Math.max(0, 6 - selected.size), "same-file-frontier");
    const supplemental = [...selected.values()].slice(0, 6);
    const owners = [...baseline.map((candidate) => candidate.owner), ...supplemental.map((candidate) => candidate.owner)];
    return {
      cluster_slots: clusterSlots,
      frontier_slots: frontierSlots,
      owners,
      supplemental,
      receipt_id: createHash("sha256").update(JSON.stringify({
        rule: "fixed-allocation-cluster-frontier-development-v5",
        cluster_slots: clusterSlots,
        frontier_slots: frontierSlots,
        owners,
        exact_owner_enabled: false,
      })).digest("hex").slice(0, 24),
    };
  });
}
