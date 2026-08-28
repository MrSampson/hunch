import { test } from "node:test";
import assert from "node:assert/strict";
import { orphanedCommitDecisions, planCommitRepair, repairDecisionCommit, mergeRewrites, liveRewrites, deadRewrites } from "../src/core/commitrepair.js";
import type { Decision } from "../src/core/types.js";
import type { CommitCandidate, CommitRepairStatus } from "../src/extractors/git.js";

const D = (over: Partial<Decision> & { id: string }): Decision => ({
  id: over.id, title: `t ${over.id}`, decision: "d", status: over.status ?? "accepted",
  related_files: over.related_files ?? [], rejected_tripwires: [],
  alternatives_rejected: [],
  commit: over.commit ?? null,
  provenance: { source: "human_confirmed", confidence: 0.9, evidence: over.commit ? [`commit:${over.commit}`] : [] },
  ...over,
} as unknown as Decision);

test("orphanedCommitDecisions: only live decisions with a non-ancestor commit are orphaned", () => {
  const statuses = new Map<string, CommitRepairStatus>([["sha_ancestor", "current"], ["sha_gone", "orphaned"]]);
  const status = (sha: string): CommitRepairStatus => statuses.get(sha) ?? "unresolvable";
  const decisions = [
    D({ id: "dec_ancestor", commit: "sha_ancestor" }),
    D({ id: "dec_orphaned", commit: "sha_gone" }),
    D({ id: "dec_no_commit", commit: null }),
    D({ id: "dec_superseded", commit: "sha_gone", status: "superseded" }),
    D({ id: "dec_rejected", commit: "sha_gone", status: "rejected" }),
  ];
  assert.deepEqual(orphanedCommitDecisions(decisions, status).map((d) => d.id), ["dec_orphaned"]);
});

test("orphanedCommitDecisions: unresolvable and unknown commits are never repair-eligible", () => {
  const statuses = new Map<string, CommitRepairStatus>([
    ["sha_orphaned", "orphaned"],
    ["sha_missing", "unresolvable"],
    ["sha_git_failed", "unknown"],
  ]);
  const status = (sha: string): CommitRepairStatus => statuses.get(sha)!;
  const decisions = [
    D({ id: "dec_orphaned", commit: "sha_orphaned" }),
    D({ id: "dec_foreign", commit: "sha_missing" }),
    D({ id: "dec_git_failed", commit: "sha_git_failed" }),
  ];
  assert.deepEqual(orphanedCommitDecisions(decisions, status).map((d) => d.id), ["dec_orphaned"]);
});

test("planCommitRepair: a unique related_files-subset match is rewritten", () => {
  const orphaned = [D({ id: "dec_1", commit: "sha_old", related_files: ["src/feature.ts"] })];
  const candidates: CommitCandidate[] = [{ sha: "sha_squash", files: ["src/feature.ts", "src/unrelated.ts"] }];
  const plan = planCommitRepair(orphaned, candidates);
  assert.deepEqual(plan.rewrites, [{ id: "dec_1", from: "sha_old", to: "sha_squash" }]);
  assert.deepEqual(plan.records, ["dec_1"]);
});

test("planCommitRepair: two candidates both match — ambiguous, skipped", () => {
  const orphaned = [D({ id: "dec_1", commit: "sha_old", related_files: ["src/feature.ts"] })];
  const candidates: CommitCandidate[] = [
    { sha: "sha_a", files: ["src/feature.ts"] },
    { sha: "sha_b", files: ["src/feature.ts", "src/other.ts"] },
  ];
  assert.deepEqual(planCommitRepair(orphaned, candidates), { rewrites: [], records: [] });
});

test("planCommitRepair: no candidate is a superset — no match, skipped", () => {
  const orphaned = [D({ id: "dec_1", commit: "sha_old", related_files: ["src/feature.ts", "src/other.ts"] })];
  const candidates: CommitCandidate[] = [{ sha: "sha_a", files: ["src/feature.ts"] }];
  assert.deepEqual(planCommitRepair(orphaned, candidates), { rewrites: [], records: [] });
});

test("planCommitRepair: empty or all-glob related_files never matches", () => {
  const orphaned = [
    D({ id: "dec_empty", commit: "sha_old", related_files: [] }),
    D({ id: "dec_glob", commit: "sha_old2", related_files: ["src/**"] }),
  ];
  const candidates: CommitCandidate[] = [{ sha: "sha_a", files: ["src/feature.ts"] }];
  assert.deepEqual(planCommitRepair(orphaned, candidates), { rewrites: [], records: [] });
});

test("repairDecisionCommit: rewrites commit and the matching evidence entry together", () => {
  const d = D({
    id: "dec_1",
    commit: "sha_old",
    related_files: ["src/feature.ts"],
    provenance: { source: "human_confirmed", confidence: 0.9, evidence: ["commit:sha_old", "src/feature.ts"] },
  });
  const plan = { rewrites: [{ id: "dec_1", from: "sha_old", to: "sha_new" }], records: ["dec_1"] };
  const healed = repairDecisionCommit(d, plan);
  assert.equal(healed.commit, "sha_new");
  assert.deepEqual(healed.provenance.evidence, ["commit:sha_new", "src/feature.ts"]);
});

test("repairDecisionCommit: dedupes evidence if the destination is already cited", () => {
  const d = D({
    id: "dec_1",
    commit: "sha_old",
    provenance: { source: "human_confirmed", confidence: 0.9, evidence: ["commit:sha_old", "commit:sha_new"] },
  });
  const plan = { rewrites: [{ id: "dec_1", from: "sha_old", to: "sha_new" }], records: ["dec_1"] };
  const healed = repairDecisionCommit(d, plan);
  assert.deepEqual(healed.provenance.evidence, ["commit:sha_new"]);
});

test("repairDecisionCommit: returns the same reference when the plan doesn't touch this decision", () => {
  const d = D({ id: "dec_untouched", commit: "sha_old" });
  const plan = { rewrites: [{ id: "dec_other", from: "sha_a", to: "sha_b" }], records: ["dec_other"] };
  assert.equal(repairDecisionCommit(d, plan), d);
});

test("repairDecisionCommit: bails atomically when the record's commit moved on since the plan was built", () => {
  const d = D({
    id: "dec_1",
    commit: "sha_moved",
    provenance: { source: "human_confirmed", confidence: 0.9, evidence: ["commit:sha_old"] },
  });
  const plan = { rewrites: [{ id: "dec_1", from: "sha_old", to: "sha_new" }], records: ["dec_1"] };
  assert.equal(repairDecisionCommit(d, plan), d);
});

test("mergeRewrites: a fresh match overrides a queued match for the same decision", () => {
  const fresh = [{ id: "dec_1", from: "sha_old", to: "sha_fresh" }];
  const queued = [{ id: "dec_1", from: "sha_old", to: "sha_stale" }];
  assert.deepEqual(mergeRewrites(fresh, queued), [{ id: "dec_1", from: "sha_old", to: "sha_fresh" }]);
});

test("mergeRewrites: queued-only and fresh-only entries both pass through", () => {
  const fresh = [{ id: "dec_fresh", from: "a", to: "b" }];
  const queued = [{ id: "dec_queued", from: "c", to: "d" }];
  const merged = mergeRewrites(fresh, queued);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((r) => r.id === "dec_fresh"), fresh[0]);
  assert.deepEqual(merged.find((r) => r.id === "dec_queued"), queued[0]);
});

test("mergeRewrites: empty inputs produce an empty result", () => {
  assert.deepEqual(mergeRewrites([], []), []);
});

test("liveRewrites: drops an entry whose decision no longer exists or whose commit already moved on", () => {
  const decisions = [
    D({ id: "dec_current", commit: "sha_old" }),
    D({ id: "dec_moved_on", commit: "sha_moved" }),
  ];
  const queued = [
    { id: "dec_current", from: "sha_old", to: "sha_new" },
    { id: "dec_moved_on", from: "sha_old", to: "sha_new" }, // stale — commit no longer matches
    { id: "dec_gone", from: "sha_old", to: "sha_new" }, // no such decision
  ];
  assert.deepEqual(liveRewrites(queued, decisions), [{ id: "dec_current", from: "sha_old", to: "sha_new" }]);
});

test("liveRewrites: excludes superseded/rejected decisions, same exclusion as orphanedCommitDecisions", () => {
  const decisions = [
    D({ id: "dec_superseded", commit: "sha_old", status: "superseded" }),
    D({ id: "dec_rejected", commit: "sha_old", status: "rejected" }),
  ];
  const queued = [
    { id: "dec_superseded", from: "sha_old", to: "sha_new" },
    { id: "dec_rejected", from: "sha_old", to: "sha_new" },
  ];
  assert.deepEqual(liveRewrites(queued, decisions), []);
});

test("deadRewrites: an entry whose decision isn't in the list at all is NOT dead — absence is the reader's problem, not proof the match is stale", () => {
  const decisions = [D({ id: "dec_present", commit: "sha_old" })];
  const queued = [
    { id: "dec_present", from: "sha_old", to: "sha_new" },
    { id: "dec_invisible", from: "sha_old", to: "sha_new" }, // e.g. a branch checkout that predates it
  ];
  assert.deepEqual(deadRewrites(queued, decisions), [], "neither entry is provably dead — dec_present still matches, dec_invisible is merely unresolved");
});

test("deadRewrites: an entry whose PRESENT decision moved on, or is superseded/rejected, is dead", () => {
  const decisions = [
    D({ id: "dec_moved_on", commit: "sha_moved" }),
    D({ id: "dec_superseded", commit: "sha_old", status: "superseded" }),
    D({ id: "dec_rejected", commit: "sha_old", status: "rejected" }),
  ];
  const queued = [
    { id: "dec_moved_on", from: "sha_old", to: "sha_new" },
    { id: "dec_superseded", from: "sha_old", to: "sha_new" },
    { id: "dec_rejected", from: "sha_old", to: "sha_new" },
  ];
  assert.deepEqual(deadRewrites(queued, decisions).map((r) => r.id).sort(), ["dec_moved_on", "dec_rejected", "dec_superseded"]);
});
