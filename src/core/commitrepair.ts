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
import type { CommitCandidate, CommitRepairStatus } from "../extractors/git.js";
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

/** Live decisions whose cited commit still exists here but is no longer an
 *  ancestor of the current tip. Only "orphaned" qualifies: a commit that
 *  doesn't resolve at all ("unresolvable") is out of repair scope, and a git
 *  failure ("unknown") must never be mistaken for repair-eligible. */
export function orphanedCommitDecisions(
  decisions: readonly Decision[],
  status: (sha: string) => CommitRepairStatus,
): Decision[] {
  return decisions.filter((d) => {
    if (d.status === "superseded" || d.status === "rejected") return false;
    if (!d.commit) return false;
    return status(d.commit) === "orphaned";
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

/** Combine a freshly-computed plan's rewrites with anything already queued
 *  (src/core/repairqueue.ts) from an earlier detection, deduped by decision id.
 *  A fresh match — computed just now, against the current range — overrides a
 *  queued one for the same decision; queued entries no longer reachable are
 *  simply not repeated by the fresh scan. */
export function mergeRewrites(fresh: readonly CommitRewrite[], queued: readonly CommitRewrite[]): CommitRewrite[] {
  const freshIds = new Set(fresh.map((r) => r.id));
  return [...fresh, ...queued.filter((r) => !freshIds.has(r.id))];
}

/** Pure: rewrite `commit` and its matching `commit:<sha>` evidence entry for one
 *  decision, or return the same reference when the plan doesn't touch it.
 *  If the record moved on since the plan was built (its commit no longer equals
 *  the plan's `from`), bail entirely — commit and evidence rewrite together or
 *  not at all, never one without the other. */
export function repairDecisionCommit(d: Decision, plan: CommitRepairPlan): Decision {
  const mine = plan.rewrites.find((r) => r.id === d.id);
  if (!mine || d.commit !== mine.from) return d;
  const evidence = replaceExact(d.provenance.evidence, `commit:${mine.from}`, `commit:${mine.to}`);
  return {
    ...d,
    commit: mine.to,
    provenance: { ...d.provenance, evidence: evidence.values },
  };
}
