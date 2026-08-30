import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingEscalations, policyEscalations, commitRepairEscalations, type PolicyLite } from "../src/core/escalations.js";
import type { Decision } from "../src/core/types.js";

const D = (over: Partial<Decision> & { id: string }): Decision => ({
  id: over.id, title: over.title ?? `title ${over.id}`, decision: "did a thing",
  status: over.status ?? "accepted", topic: over.topic ?? null,
  superseded_by: over.superseded_by ?? null, valid_to: over.valid_to ?? null,
  alternatives_rejected: [], related_files: [], commit: over.commit ?? null,
  provenance: { source: over.source ?? "llm_draft", confidence: 0.6, evidence: [] },
  valid_from: "2026-01-01T00:00:00Z", date: "2026-01-01T00:00:00Z",
} as Decision);

test("pendingEscalations: a healthy graph needs no human decision (empty)", () => {
  const decs = [D({ id: "dec_a", topic: "store.writes" }), D({ id: "dec_b", topic: "mcp.shape" })];
  assert.deepEqual(pendingEscalations(decs), []);
});

test("pendingEscalations: two LIVE decisions on one topic surface as one inline question", () => {
  const decs = [
    D({ id: "dec_a", topic: "store.writes" }),
    D({ id: "dec_b", topic: "store.writes" }), // collision — both accepted, in-force
  ];
  const items = pendingEscalations(decs);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "topic-conflict");
  assert.equal(items[0]!.topic, "store.writes");
  assert.deepEqual(items[0]!.decisionIds.sort(), ["dec_a", "dec_b"]);
  assert.match(items[0]!.question, /which one is current/);
});

test("pendingEscalations: auto-captured (topic null) memory never collides — no escalation", () => {
  // The whole point: auto-trust writes topic:null, so ordinary captured memory
  // piling up NEVER creates a human decision. Only human-anchored topics can.
  const decs = [D({ id: "dec_a" }), D({ id: "dec_b" }), D({ id: "dec_c" })];
  assert.deepEqual(pendingEscalations(decs), []);
});

const P = (over: Partial<PolicyLite> & { id: string }): PolicyLite => ({
  state: "proposed", statement: `rule ${over.id}`, proof: null, authority: null, ...over,
});

test("policyEscalations: candidates and proposals surface as questions; active/retired stay silent", () => {
  const items = policyEscalations([
    P({ id: "pol_a", state: "compiled" }),
    P({ id: "pol_b", state: "proposed", proof: "proof_x" }),
    P({ id: "pol_c", state: "proposed" }),                       // no proof → "prove first"
    P({ id: "pol_d", state: "active_advisory", authority: { actor: "human:x" } }),
    P({ id: "pol_e", state: "retired" }),
  ]);
  assert.equal(items.length, 3, "only candidate + the two proposals ask; active/retired never do");
  assert.equal(items[0]!.kind, "policy-candidate");
  assert.match(items[0]!.resolution, /policy prove pol_a/);
  assert.equal(items[1]!.kind, "policy-proposal");
  assert.match(items[1]!.question, /activate it \(advisory\/blocking\) or reject/);
  assert.match(items[1]!.resolution, /policy accept pol_b/);
  assert.match(items[2]!.question, /no current proof — prove it/);
});

test("policyEscalations: an empty policy store asks nothing", () => {
  assert.deepEqual(policyEscalations([]), []);
});

test("policyEscalations: an auto-repaired policy asks for a re-prove, exactly once", () => {
  const items = policyEscalations([
    P({ id: "pol_r", state: "active_advisory", proof: "proof_x", authority: { actor: "human:x" }, last_action: "repaired" }),
    P({ id: "pol_ok", state: "active_advisory", authority: { actor: "human:x" }, last_action: "approved_advisory" }), // healthy active → silent
    P({ id: "pol_rp", state: "proposed", proof: "proof_y", last_action: "repaired" }), // repaired wins over the proposal ask
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0]!.kind, "policy-repaired");
  assert.match(items[0]!.question, /auto-repaired after a rename/);
  assert.match(items[0]!.resolution, /policy prove pol_r/);
  assert.equal(items[1]!.kind, "policy-repaired", "a repaired proposed policy asks once, not twice");
});

test("pendingEscalations: a superseded decision on the topic does not count (only live collide)", () => {
  const decs = [
    D({ id: "dec_old", topic: "store.writes", status: "superseded", superseded_by: "dec_new" }),
    D({ id: "dec_new", topic: "store.writes" }),
  ];
  assert.deepEqual(pendingEscalations(decs), []);
});

test("commitRepairEscalations: an empty queue asks nothing", () => {
  assert.deepEqual(commitRepairEscalations([], []), []);
});

test("commitRepairEscalations: a queued match surfaces as one inline question naming the decision's title", () => {
  const decs = [D({ id: "dec_1", title: "Add the feature", commit: "sha_old" })];
  const items = commitRepairEscalations([{ id: "dec_1", from: "sha_old", to: "sha_new" }], decs);
  assert.equal(items.length, 1);
  assert.equal(items[0]!.kind, "commit-repair-pending");
  assert.equal(items[0]!.topic, "dec_1");
  assert.deepEqual(items[0]!.decisionIds, ["dec_1"]);
  assert.match(items[0]!.question, /Add the feature/);
  assert.match(items[0]!.question, /no longer reachable from HEAD/, "states the actual evidence, not a stated conclusion");
  assert.match(items[0]!.question, /likely squash-merged away/, "still names the likely explanation, just not as asserted fact");
  assert.match(items[0]!.question, /one newly-merged commit touches all its related files/);
  assert.equal(items[0]!.detail, "sha_old → sha_new");
  assert.match(items[0]!.resolution, /repair-provenance --apply --only dec_1/, "gives a copy-pasteable command targeting just this decision");
  assert.match(items[0]!.resolution, /--drop dec_1/, "also offers rejecting just this one from the queue");
  assert.match(items[0]!.resolution, /tombstoned durably/, "--drop is durable — the wording must say so, not imply it's a mere queue clear");
  assert.match(items[0]!.resolution, /won't resurface/, "must say the identical match won't come back");
});

test("commitRepairEscalations: a queued entry whose decision no longer exists asks nothing — not a permanently unanswerable question", () => {
  const items = commitRepairEscalations([{ id: "dec_gone", from: "sha_old", to: "sha_new" }], []);
  assert.deepEqual(items, []);
});

test("commitRepairEscalations: a queued entry whose decision's commit already moved on asks nothing — repairDecisionCommit would refuse it anyway", () => {
  const decs = [D({ id: "dec_1", title: "Add the feature", commit: "sha_moved_on" })];
  const items = commitRepairEscalations([{ id: "dec_1", from: "sha_old", to: "sha_new" }], decs);
  assert.deepEqual(items, []);
});

test("commitRepairEscalations: a decision invisible on the advisory scope (private overlay) still asks — liveness checked against the full store, not the visible one", () => {
  const full = [D({ id: "dec_private", title: "Private decision", commit: "sha_old" })];
  const visible: Decision[] = []; // e.g. store.advisoryRecs() in private mode never sees an overlay record
  const items = commitRepairEscalations([{ id: "dec_private", from: "sha_old", to: "sha_new" }], visible, full);
  assert.equal(items.length, 1, "the repair is fully answerable via repair-provenance, which reads the full store — the question must not go silent");
  assert.equal(items[0]!.decisionIds[0], "dec_private");
  assert.doesNotMatch(items[0]!.question, /Private decision/, "the visible (advisory) scope doesn't have this decision — never disclose its title from the full-store lookup");
});

test("commitRepairEscalations: without a third argument, liveness still defaults to the visible decisions list (backward compatible)", () => {
  const decs = [D({ id: "dec_1", title: "Add the feature", commit: "sha_old" })];
  const items = commitRepairEscalations([{ id: "dec_1", from: "sha_old", to: "sha_new" }], decs);
  assert.equal(items.length, 1);
  assert.match(items[0]!.question, /Add the feature/);
});

test("commitRepairEscalations: without a fourth argument, no entry is treated as withheld (backward compatible)", () => {
  const decs = [D({ id: "dec_1", title: "Add the feature", commit: "sha_old" })];
  const items = commitRepairEscalations([{ id: "dec_1", from: "sha_old", to: "sha_new" }], decs);
  assert.match(items[0]!.resolution, /--apply --only dec_1 to accept/);
});

test("commitRepairEscalations: a withheld entry (its `to` doesn't resolve here) still asks, but never advertises --apply --only as a working resolution", () => {
  const decs = [D({ id: "dec_1", title: "Add the feature", commit: "sha_old" })];
  const entry = { id: "dec_1", from: "sha_old", to: "sha_ghost" };
  const items = commitRepairEscalations([entry], decs, decs, new Set([entry]));
  assert.equal(items.length, 1, "a withheld entry still needs a human — it still escalates");
  assert.equal(items[0]!.kind, "commit-repair-pending");
  assert.match(items[0]!.question, /doesn't resolve in this repository/);
  assert.match(items[0]!.question, /reject it\?/);
  assert.doesNotMatch(items[0]!.resolution, /--apply --only dec_1 to accept/, "must never advertise an action that's guaranteed to no-op forever");
  assert.match(items[0]!.resolution, /--drop dec_1/, "the only working resolution — --drop — must still be named");
});

test("commitRepairEscalations: withheld is keyed by OBJECT, so an untouched sibling in the same batch keeps the ordinary (apply-works) wording", () => {
  const decs = [
    D({ id: "dec_a", title: "Decision A", commit: "sha_a_old" }),
    D({ id: "dec_b", title: "Decision B", commit: "sha_b_old" }),
  ];
  const entryA = { id: "dec_a", from: "sha_a_old", to: "sha_ghost" };
  const entryB = { id: "dec_b", from: "sha_b_old", to: "sha_b_new" };
  const items = commitRepairEscalations([entryA, entryB], decs, decs, new Set([entryA]));
  const forA = items.find((i) => i.decisionIds.includes("dec_a"))!;
  const forB = items.find((i) => i.decisionIds.includes("dec_b"))!;
  assert.match(forA.question, /doesn't resolve in this repository/);
  assert.doesNotMatch(forB.question, /doesn't resolve in this repository/, "dec_b was never withheld — must not inherit dec_a's wording");
  assert.match(forB.resolution, /--apply --only dec_b to accept/);
});

test("commitRepairEscalations: a corrupted queue with two entries sharing an id — one withheld, one not — must not tag the resolvable sibling as withheld too (an id-keyed set would)", () => {
  const decs = [D({ id: "dec_a", title: "Decision A", commit: "sha_a_old" })];
  const resolvable = { id: "dec_a", from: "sha_a_old", to: "sha_real" };
  const ghost = { id: "dec_a", from: "sha_a_old", to: "sha_ghost" };
  const items = commitRepairEscalations([resolvable, ghost], decs, decs, new Set([ghost]));
  assert.equal(items.length, 2, "both entries still surface — liveRewrites doesn't dedupe by id");
  const forResolvable = items.find((i) => i.detail === "sha_a_old → sha_real")!;
  const forGhost = items.find((i) => i.detail === "sha_a_old → sha_ghost")!;
  assert.match(forResolvable.resolution, /--apply --only dec_a to accept/, "the resolvable sibling must keep the ordinary, working wording — it's the first-queued match");
  assert.match(forGhost.resolution, /--drop dec_a/, "still names --drop, but as the sibling's command, not an offer to act on this entry");
  assert.doesNotMatch(forGhost.resolution, /--apply --only dec_a to accept/, "ghost is the second-queued match — neither --apply --only nor --drop actually targets it");
});

test("commitRepairEscalations: a duplicate-id queue's second live entry never advertises --apply/--drop <id> as acting on IT — both target the first-queued match instead (#59)", () => {
  const decs = [D({ id: "dec_a", title: "Decision A", commit: "sha_a_old" })];
  const first = { id: "dec_a", from: "sha_a_old", to: "sha_first" };
  const second = { id: "dec_a", from: "sha_a_old", to: "sha_second" };
  const items = commitRepairEscalations([first, second], decs);
  assert.equal(items.length, 2);
  const forFirst = items.find((i) => i.detail === "sha_a_old → sha_first")!;
  const forSecond = items.find((i) => i.detail === "sha_a_old → sha_second")!;
  assert.match(forFirst.resolution, /--apply --only dec_a to accept/, "the first-queued match keeps the ordinary, working wording");
  assert.match(forFirst.resolution, /--drop dec_a to reject it \(tombstoned durably/, "and the ordinary --drop wording, which IS actionable against it");
  assert.doesNotMatch(forSecond.resolution, /--apply --only dec_a to accept/, "--apply --only would apply the FIRST entry, not this one");
  assert.doesNotMatch(forSecond.resolution, /--drop dec_a to reject it \(tombstoned durably/, "--drop would tombstone the FIRST entry, not this one");
  assert.match(forSecond.resolution, /first-queued match/, "explains which entry --apply/--drop actually act on");
  assert.match(forSecond.question, /sibling entry for the same decision/);
});

test("commitRepairEscalations: which entry is 'first' for a duplicate id follows queue order, not the order liveRewrites happens to return", () => {
  const decs = [D({ id: "dec_a", title: "Decision A", commit: "sha_a_old" })];
  const earlier = { id: "dec_a", from: "sha_a_old", to: "sha_earlier" };
  const later = { id: "dec_a", from: "sha_a_old", to: "sha_later" };
  const items = commitRepairEscalations([later, earlier], decs); // later queued first this time
  const forLater = items.find((i) => i.detail === "sha_a_old → sha_later")!;
  const forEarlier = items.find((i) => i.detail === "sha_a_old → sha_earlier")!;
  assert.match(forLater.resolution, /--apply --only dec_a to accept/, "whichever entry is first in the queue array wins, regardless of its `to`");
  assert.doesNotMatch(forEarlier.resolution, /--apply --only dec_a to accept/);
});
