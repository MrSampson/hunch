/**
 * Deterministic repair for a decision's commit provenance after a squash-merge.
 *
 * A squash-merge produces one new commit whose parent is the pre-merge target
 * tip — the original per-commit SHAs it squashed are never ancestors of it.
 * This module matches an orphaned decision to the ONE newly-merged commit
 * whose changed files are a superset of the decision's related_files. Zero or
 * multiple qualifying candidates means "don't guess" — same discipline as
 * repair.ts's rename-repair.
 */
import type { Decision } from "./types.js";
import type { CommitCandidate } from "../extractors/git.js";
import { replaceExact } from "./refrepair.js";

export interface CommitRewrite {
  id: string;
  from: string;
  to: string;
}

export interface CommitRepairPlan {
  rewrites: CommitRewrite[];
  records: string[];
}

/** A scope entry is exact (usable as a match key) only when it contains no glob syntax. */
function isExactPath(entry: string): boolean {
  return !!entry && !/[*?[\]{}]/.test(entry);
}

/** Live decisions whose cited commit is no longer an ancestor of the current tip. */
export function orphanedCommitDecisions(
  decisions: readonly Decision[],
  isAncestor: (sha: string) => boolean,
): Decision[] {
  return decisions.filter((d) => {
    if (d.status === "superseded" || d.status === "rejected") return false;
    if (!d.commit) return false;
    return !isAncestor(d.commit);
  });
}

/** Match each orphaned decision to exactly one candidate whose changed files are
 *  a superset of the decision's related_files (non-empty, no globs). */
export function planCommitRepair(
  orphaned: readonly Decision[],
  candidates: readonly CommitCandidate[],
): CommitRepairPlan {
  const rewrites: CommitRewrite[] = [];
  for (const d of orphaned) {
    const files = (d.related_files ?? []).filter(isExactPath);
    if (!files.length) continue;
    const matches = candidates.filter((c) => files.every((f) => c.files.includes(f)));
    if (matches.length !== 1) continue; // zero or ambiguous: never guess
    rewrites.push({ id: d.id, from: d.commit!, to: matches[0]!.sha });
  }
  return { rewrites, records: [...new Set(rewrites.map((r) => r.id))] };
}

/** Pure: rewrite `commit` and its matching `commit:<sha>` evidence entry for one
 *  decision, or return the same reference when the plan doesn't touch it. */
export function repairDecisionCommit(d: Decision, plan: CommitRepairPlan): Decision {
  const mine = plan.rewrites.find((r) => r.id === d.id);
  if (!mine) return d;
  const evidence = replaceExact(d.provenance.evidence, `commit:${mine.from}`, `commit:${mine.to}`);
  return {
    ...d,
    commit: d.commit === mine.from ? mine.to : d.commit,
    provenance: { ...d.provenance, evidence: evidence.values },
  };
}
