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

/** Whether a queued rewrite is still worth acting on: the decision it names
 *  still exists, still cites the commit the entry expects to replace (a
 *  decision that already moved on would make repairDecisionCommit's own
 *  stale-plan bail refuse it), and hasn't since been superseded/rejected —
 *  same exclusion as orphanedCommitDecisions, since repairing dead history's
 *  provenance isn't worth asking about. The single predicate every consumer
 *  (the escalation surface, repair-provenance's own dry-run/apply/queue
 *  pruning) shares, so they can never disagree about the same entry. */
export function liveRewrites(queued: readonly CommitRewrite[], decisions: readonly Decision[]): CommitRewrite[] {
  const byId = new Map(decisions.map((d) => [d.id, d] as const));
  return queued.filter((r) => {
    const d = byId.get(r.id);
    return !!d && d.commit === r.from && d.status !== "superseded" && d.status !== "rejected";
  });
}

/** Entries a decision has demonstrably outgrown: the decision IS present in
 *  `decisions`, and it either moved on from `from` or has since been
 *  superseded/rejected. An id this list can't see is deliberately NOT
 *  included — absence is a property of the READER (a branch checkout that
 *  predates the decision, an unmounted private overlay), not proof the match
 *  is stale. This predicate backs a DESTRUCTIVE prune (repair-provenance
 *  deletes what it returns from the queue file); repairqueue.ts's own
 *  docstring is why that matters — the queue is the one durable record of a
 *  match once ORIG_HEAD moves on and the matched-away commit can be gc'd, so
 *  deleting an entry on a merely-absent id would destroy it unrecoverably.
 *  Contrast liveRewrites, whose absence-means-not-askable rule is safe on
 *  the read-only escalation surface, which self-heals once visibility
 *  returns. */
export function deadRewrites(queued: readonly CommitRewrite[], decisions: readonly Decision[]): CommitRewrite[] {
  const byId = new Map(decisions.map((d) => [d.id, d] as const));
  return queued.filter((r) => {
    const d = byId.get(r.id);
    return !!d && (d.commit !== r.from || d.status === "superseded" || d.status === "rejected");
  });
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

/** Pure: rewrite `commit` for one decision, and its matching `commit:<sha>`
 *  evidence entry too if one is present (replaceExact is a no-op when the
 *  evidence array never cited the old sha) — or return the same reference
 *  when the plan doesn't touch it. If the record moved on since the plan was
 *  built (its commit no longer equals the plan's `from`), bail entirely
 *  rather than applying a now-stale match. */
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
