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

/** A tombstone: the exact {id, from, to} rewrite a human explicitly rejected
 *  via `--drop`. Keyed on the full triple, not just {id, from} — the human's
 *  "no" answers the specific question the commit-repair-pending escalation
 *  asked ("apply THIS proposed replacement, from -> to?"), not a blanket
 *  refusal of every future replacement for this decision's still-orphaned
 *  commit. A later merge proposing a genuinely different `to` for the same
 *  {id, from} is a NEW proposal — not a repeat of the one that was rejected —
 *  and surfaces normally. */
export interface DroppedRewrite {
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

/** Whether a queued rewrite is still worth ASKING about: the decision it
 *  names still exists, still cites the commit the entry expects to replace (a
 *  decision that already moved on would make repairDecisionCommit's own
 *  stale-plan bail refuse it), and hasn't since been superseded/rejected —
 *  same exclusion as orphanedCommitDecisions, since repairing dead history's
 *  provenance isn't worth asking about. Backs the read-only escalation
 *  surface only (commitRepairEscalations) — absence-means-not-askable is
 *  safe there because it self-heals the moment visibility returns.
 *  repair-provenance itself does NOT use this: it reads the full store and
 *  may legitimately list (dry-run) or leave queued (apply) an entry this
 *  predicate would call not-live, so the escalation surface and the CLI can
 *  disagree about the same entry — see deadRewrites and resolvedRewriteIds
 *  for the CLI's own, looser-on-purpose reasoning. */
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
 *  returns.
 *
 *  Caveat: "demonstrably" is only as strong as this run's view of
 *  `decisions`, which comes from the same git-tracked, branch-dependent
 *  files that motivate treating ABSENCE as inconclusive. A decision whose
 *  `commit`/`status` genuinely differ between branches (e.g. a repair
 *  already applied and committed on one branch, checked out here from a
 *  branch that predates it) could still read as "moved on" when it hasn't,
 *  from this branch's perspective. Far narrower than the absence case this
 *  function exists to fix, and not addressed here. */
export function deadRewrites(queued: readonly CommitRewrite[], decisions: readonly Decision[]): CommitRewrite[] {
  const byId = new Map(decisions.map((d) => [d.id, d] as const));
  return queued.filter((r) => {
    const d = byId.get(r.id);
    return !!d && (d.commit !== r.from || d.status === "superseded" || d.status === "rejected");
  });
}

/** Among `toApply` (the queued/matched candidates this run is about to act
 *  on), the ids repair-provenance may treat as RESOLVED once it's done: the
 *  decision is present in `decisions` this run, whether or not
 *  repairDecisionCommit actually changed it (a present decision that already
 *  moved on is "resolved" too — repairDecisionCommit's own bail refused it,
 *  and there is nothing more this run can do about it). An id whose decision
 *  is NOT present is never resolved — same reasoning as deadRewrites:
 *  absence is the reader's transient view, not proof the match is settled,
 *  so it must stay queued for a run where the decision is visible again. */
export function resolvedRewriteIds(toApply: readonly CommitRewrite[], decisions: readonly Decision[]): Set<string> {
  const seen = new Set(decisions.map((d) => d.id));
  return new Set(toApply.filter((r) => seen.has(r.id)).map((r) => r.id));
}

/** Remove any match whose exact {id, from, to} triple was already tombstoned
 *  by an earlier `--drop` — otherwise a later merge that re-derives the
 *  identical candidate would re-queue exactly what the human rejected. A
 *  match sharing {id, from} but proposing a different `to` is unaffected: it
 *  is a different proposal, not the rejected one.
 *
 *  Preserves object identity for every surviving entry (a plain filter, never
 *  a clone or a rebuild) — repair-provenance's own action relies on this to
 *  diff its swept-vs-active queue by reference (`queue.filter(r =>
 *  !active.includes(r))`) rather than re-spelling the {id, from, to} key a
 *  third time. Do not change this to normalize or reconstruct entries
 *  without updating that call site too. */
export function withoutDropped(rewrites: readonly CommitRewrite[], dropped: readonly DroppedRewrite[]): CommitRewrite[] {
  if (!dropped.length) return [...rewrites];
  const tombstoned = new Set(dropped.map((t) => `${t.id}\0${t.from}\0${t.to}`));
  return rewrites.filter((r) => !tombstoned.has(`${r.id}\0${r.from}\0${r.to}`));
}

/** Append newly-dropped {id, from, to} triples to the tombstone list,
 *  deduped — same append-only, dedupe-by-key shape as mergeRewrites. */
export function addDropped(newly: readonly DroppedRewrite[], existing: readonly DroppedRewrite[]): DroppedRewrite[] {
  const seen = new Set(existing.map((t) => `${t.id}\0${t.from}\0${t.to}`));
  const additions = newly.filter((t) => !seen.has(`${t.id}\0${t.from}\0${t.to}`));
  return [...existing, ...additions];
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
