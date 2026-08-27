import { test } from "node:test";
import assert from "node:assert/strict";
import { orphanedCommitDecisions, planCommitRepair, repairDecisionCommit } from "../src/core/commitrepair.js";
import type { Decision } from "../src/core/types.js";
import type { CommitCandidate } from "../src/extractors/git.js";

const D = (over: Partial<Decision> & { id: string }): Decision => ({
  id: over.id, title: `t ${over.id}`, decision: "d", status: over.status ?? "accepted",
  related_files: over.related_files ?? [], rejected_tripwires: [],
  alternatives_rejected: [],
  commit: over.commit ?? null,
  provenance: { source: "human_confirmed", confidence: 0.9, evidence: over.commit ? [`commit:${over.commit}`] : [] },
  ...over,
} as unknown as Decision);

test("orphanedCommitDecisions: only live decisions with a non-ancestor commit are orphaned", () => {
  const ancestorSet = new Set(["sha_ancestor"]);
  const isAncestor = (sha: string): boolean => ancestorSet.has(sha);
  const decisions = [
    D({ id: "dec_ancestor", commit: "sha_ancestor" }),
    D({ id: "dec_orphaned", commit: "sha_gone" }),
    D({ id: "dec_no_commit", commit: null }),
    D({ id: "dec_superseded", commit: "sha_gone", status: "superseded" }),
    D({ id: "dec_rejected", commit: "sha_gone", status: "rejected" }),
  ];
  assert.deepEqual(orphanedCommitDecisions(decisions, isAncestor).map((d) => d.id), ["dec_orphaned"]);
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
