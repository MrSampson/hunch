import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Decision } from "../src/core/types.js";
import { hunchPaths } from "../src/core/paths.js";
import { HunchStore } from "../src/store/hunchStore.js";
import { ensureGitignore } from "../src/integrations/gitignore.js";

const projectRoot = process.cwd();
const tsx = join(projectRoot, "node_modules/tsx/dist/cli.mjs");
const cli = join(projectRoot, "src/cli/index.ts");

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function runCli(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [tsx, cli, ...args], {
    cwd: root,
    env: { ...process.env, HUNCH_PRIVATE_DIR: "", HUNCH_SYNTH_PROVIDER: "deterministic" },
    encoding: "utf8",
  });
}

/** A repo shaped like a real squash-merge: a feature-branch commit (never an
 *  ancestor of main) that a decision cites, then a same-diff commit landing on
 *  main — exactly what GitHub/GitLab's squash-merge produces locally once
 *  pulled. `oldRef`/`newRef` bracket the "merge" for an explicit --range. */
function squashFixture(): { root: string; decisionFile: string; oldRef: string; newRef: string; origCommit: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-squash-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test Human");
  ensureGitignore(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/base.ts"), "export const base = 1;\n");
  git(root, "add", ".gitignore", "src/base.ts");
  git(root, "commit", "-qm", "feat: base");

  git(root, "checkout", "-qb", "feature");
  writeFileSync(join(root, "src/feature.ts"), "export const feature = 1;\n");
  git(root, "add", "src/feature.ts");
  git(root, "commit", "-qm", "feat: add feature");
  const origCommit = git(root, "rev-parse", "HEAD");

  const decision: Decision = {
    id: "dec_squash_fixture",
    title: "Add the feature",
    topic: null,
    status: "accepted",
    context: "",
    decision: "Add the feature.",
    consequences: [],
    alternatives_rejected: [],
    rejected_tripwires: [],
    related_components: [],
    related_files: ["src/feature.ts"],
    supersedes: null,
    superseded_by: null,
    caused_by_bug: null,
    commit: origCommit,
    valid_from: "2026-01-01T00:00:00.000Z",
    valid_to: null,
    retired: { symbols: [], deps: [] },
    provenance: { source: "human_confirmed", confidence: 1, evidence: [`commit:${origCommit}`], last_verified: "2026-01-01T00:00:00.000Z" },
    date: "2026-01-01T00:00:00.000Z",
  };

  git(root, "checkout", "-q", "main");
  writeFileSync(join(root, "src/unrelated.ts"), "export const unrelated = 1;\n");
  git(root, "add", "src/unrelated.ts");
  git(root, "commit", "-qm", "chore: unrelated");
  const origHead = git(root, "rev-parse", "HEAD");

  writeFileSync(join(root, "src/feature.ts"), "export const feature = 1;\n");
  git(root, "add", "src/feature.ts");
  git(root, "commit", "-qm", "feat: add feature (#1)");
  const newHead = git(root, "rev-parse", "HEAD");

  const store = new HunchStore(hunchPaths(root));
  store.json.put("decisions", decision);
  store.reindex();
  store.close();
  const decisionFile = join(root, ".hunch/decisions/dec_squash_fixture.json");
  git(root, "add", ".hunch/decisions/dec_squash_fixture.json");
  git(root, "commit", "-qm", "hunch: record feature decision");

  return { root, decisionFile, oldRef: origHead, newRef: newHead, origCommit, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const queueFile = (root: string): string => join(root, ".hunch", "pending-commit-repairs.json");
const readQueue = (root: string): unknown[] => JSON.parse(readFileSync(queueFile(root), "utf8"));

test("repair-provenance --range --apply rewrites commit + evidence directly, and leaves the queue empty", () => {
  const fixture = squashFixture();
  try {
    const run = runCli(fixture.root, "repair-provenance", "--range", `${fixture.oldRef}..${fixture.newRef}`, "--apply");
    assert.equal(run.status, 0, run.stderr);
    // Repaired records carry the same abbreviated sha every synthesized decision uses.
    const shortNewRef = git(fixture.root, "rev-parse", "--short", fixture.newRef);
    const repaired = JSON.parse(readFileSync(fixture.decisionFile, "utf8")) as Decision;
    assert.equal(repaired.commit, shortNewRef);
    assert.deepEqual(repaired.provenance.evidence, [`commit:${shortNewRef}`]);
    assert.match(git(fixture.root, "log", "-1", "--format=%s"), /^hunch: repair 1 commit reference\(s\) after squash-merge/);
    assert.deepEqual(readQueue(fixture.root), [], "every candidate this run applied or went stale — queue clears");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance dry run (no --apply) reports the plan, queues it, and changes nothing", () => {
  const fixture = squashFixture();
  try {
    const before = readFileSync(fixture.decisionFile, "utf8");
    const run = runCli(fixture.root, "repair-provenance", "--range", `${fixture.oldRef}..${fixture.newRef}`);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Would repair 1 commit reference/);
    assert.equal(readFileSync(fixture.decisionFile, "utf8"), before);
    const queue = readQueue(fixture.root) as { id: string; from: string; to: string }[];
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.id, "dec_squash_fixture");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --from-hook (no --apply, matches installed hook exactly) detects and QUEUES, never writes the decision", () => {
  const fixture = squashFixture();
  try {
    // ORIG_HEAD is what a real merge/reset/rebase leaves behind; set it directly
    // so this exercises the hook's actual flags with no --range override.
    git(fixture.root, "update-ref", "ORIG_HEAD", fixture.oldRef);
    const before = readFileSync(fixture.decisionFile, "utf8");
    const run = runCli(fixture.root, "repair-provenance", "--from-hook", "--quiet");
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), "", "quiet mode prints nothing");
    assert.equal(readFileSync(fixture.decisionFile, "utf8"), before, "the hook never writes the decision — detect only");
    assert.equal(git(fixture.root, "status", "--porcelain"), "", "no auto-commit from a detect-only run");
    const queue = readQueue(fixture.root) as { id: string; from: string; to: string }[];
    assert.equal(queue.length, 1);
    assert.equal(queue[0]!.id, "dec_squash_fixture");
    assert.equal(queue[0]!.to, git(fixture.root, "rev-parse", "--short", fixture.newRef));
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply picks up a match from the queue even once the range that found it no longer resolves", () => {
  const fixture = squashFixture();
  try {
    git(fixture.root, "update-ref", "ORIG_HEAD", fixture.oldRef);
    const queueRun = runCli(fixture.root, "repair-provenance", "--from-hook", "--quiet");
    assert.equal(queueRun.status, 0, queueRun.stderr);
    assert.equal(readQueue(fixture.root).length, 1, "sanity: the match was queued");

    // Prove the queue — not a re-resolved range — supplies the match: remove
    // ORIG_HEAD entirely before applying.
    git(fixture.root, "update-ref", "-d", "ORIG_HEAD");

    const applyRun = runCli(fixture.root, "repair-provenance", "--quiet", "--apply");
    assert.equal(applyRun.status, 0, applyRun.stderr);
    const repaired = JSON.parse(readFileSync(fixture.decisionFile, "utf8")) as Decision;
    assert.equal(repaired.commit, git(fixture.root, "rev-parse", "--short", fixture.newRef));
    assert.deepEqual(readQueue(fixture.root), [], "applied entry is cleared from the queue");
  } finally {
    fixture.cleanup();
  }
});

test("a queued repair surfaces via `hunch escalations` — the discoverable surface for what the silent hook found", () => {
  const fixture = squashFixture();
  try {
    git(fixture.root, "update-ref", "ORIG_HEAD", fixture.oldRef);
    const queueRun = runCli(fixture.root, "repair-provenance", "--from-hook", "--quiet");
    assert.equal(queueRun.status, 0, queueRun.stderr);

    const escRun = runCli(fixture.root, "escalations", "--json");
    assert.equal(escRun.status, 1, "escalations exits non-zero when something needs a human decision");
    const items = JSON.parse(escRun.stdout) as { kind: string; decisionIds: string[] }[];
    const pending = items.find((i) => i.kind === "commit-repair-pending");
    assert.ok(pending, "the queued repair appears as an escalation");
    assert.deepEqual(pending!.decisionIds, ["dec_squash_fixture"]);
  } finally {
    fixture.cleanup();
  }
});

/** Two independent decisions, each with a queued repair, seeded directly (no
 *  real squash-merge needed — that matching path is covered elsewhere). Lets
 *  --only/--drop tests act on one entry and assert the other is untouched. */
function twoDecisionQueueFixture(): { root: string; decisionFile: (id: string) => string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-squash-two-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test Human");
  ensureGitignore(root);
  writeFileSync(join(root, "a.txt"), "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "init");

  const mkDecision = (id: string, commit: string): Decision => ({
    id,
    title: `Decision ${id}`,
    topic: null,
    status: "accepted",
    context: "",
    decision: `Decision ${id}.`,
    consequences: [],
    alternatives_rejected: [],
    rejected_tripwires: [],
    related_components: [],
    related_files: [`src/${id}.ts`],
    supersedes: null,
    superseded_by: null,
    caused_by_bug: null,
    commit,
    valid_from: "2026-01-01T00:00:00.000Z",
    valid_to: null,
    retired: { symbols: [], deps: [] },
    provenance: { source: "human_confirmed", confidence: 1, evidence: [`commit:${commit}`], last_verified: "2026-01-01T00:00:00.000Z" },
    date: "2026-01-01T00:00:00.000Z",
  });

  const store = new HunchStore(hunchPaths(root));
  store.json.put("decisions", mkDecision("dec_a", "sha_a_old"));
  store.json.put("decisions", mkDecision("dec_b", "sha_b_old"));
  store.reindex();
  store.close();
  git(root, "add", ".hunch");
  git(root, "commit", "-qm", "hunch: record dec_a and dec_b");

  writeFileSync(
    join(root, ".hunch", "pending-commit-repairs.json"),
    JSON.stringify([{ id: "dec_a", from: "sha_a_old", to: "sha_a_new" }, { id: "dec_b", from: "sha_b_old", to: "sha_b_new" }], null, 2) + "\n",
  );

  return {
    root,
    decisionFile: (id: string) => join(root, ".hunch/decisions", `${id}.json`),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("repair-provenance --drop removes one queued entry without applying anything", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    const headBefore = git(fixture.root, "rev-parse", "HEAD");
    const run = runCli(fixture.root, "repair-provenance", "--drop", "dec_a", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue.map((r) => r.id), ["dec_b"], "only the dropped entry is removed");

    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    const decB = JSON.parse(readFileSync(fixture.decisionFile("dec_b"), "utf8")) as Decision;
    assert.equal(decA.commit, "sha_a_old", "dropping never applies a rewrite");
    assert.equal(decB.commit, "sha_b_old", "the untargeted decision is untouched");
    assert.equal(git(fixture.root, "rev-parse", "HEAD"), headBefore, "no commit was made");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply --only <id> applies just that decision, leaving the other queued", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_b", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    const decB = JSON.parse(readFileSync(fixture.decisionFile("dec_b"), "utf8")) as Decision;
    assert.equal(decA.commit, "sha_a_old", "the untargeted decision is never applied");
    assert.equal(decB.commit, "sha_b_new", "the targeted decision is applied");

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue.map((r) => r.id), ["dec_a"], "only the applied entry is cleared from the queue");
    assert.match(git(fixture.root, "log", "-1", "--format=%s"), /^hunch: repair 1 commit reference\(s\)/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance self-prunes a permanently-dead queue entry on every run, even when --only targets a different id", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // dec_a's decision moved on since the entry was queued — the queue's
    // "sha_a_old" no longer matches, so repairDecisionCommit would refuse
    // this entry forever. Without self-pruning it would sit in the queue
    // past any number of --only runs targeting other entries.
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    decA.commit = "sha_a_moved_on";
    writeFileSync(fixture.decisionFile("dec_a"), JSON.stringify(decA, null, 2) + "\n");

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_b", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue, [], "dec_a's dead entry is pruned on read, not left behind just because --only targeted dec_b");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply --only <id-pruned-this-run> exits 0 with an explanatory message, not a usage error", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // dec_a is real and queued, but this run's own prune resolves it before
    // --only ever gets to look for it — that's not the same situation as
    // targeting an id that never existed.
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    decA.commit = "sha_a_moved_on";
    writeFileSync(fixture.decisionFile("dec_a"), JSON.stringify(decA, null, 2) + "\n");

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_a");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /"dec_a" was pruned earlier in this run/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance's prune message doesn't claim 'moved on' for a decision that simply has no commit on record", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // dec_a never had a commit at all (e.g. hand-edited or imported without
    // one) — deadRewrites correctly prunes it (repairDecisionCommit would
    // bail forever), but "moved on" isn't an accurate description.
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    decA.commit = null;
    writeFileSync(fixture.decisionFile("dec_a"), JSON.stringify(decA, null, 2) + "\n");

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_b");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /no commit on record/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance announces a pruned dead entry unless --quiet, so a human isn't left guessing why --apply --only later reports nothing queued", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    decA.commit = "sha_a_moved_on";
    writeFileSync(fixture.decisionFile("dec_a"), JSON.stringify(decA, null, 2) + "\n");

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_b");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Pruned 1 dead queue entry.*dec_a/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --range garbage fails before touching the queue file — a usage error changes nothing on disk", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // dec_a is provably dead (moved on) — if pruning ran before validation,
    // this usage error would still silently rewrite the queue file.
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    decA.commit = "sha_a_moved_on";
    writeFileSync(fixture.decisionFile("dec_a"), JSON.stringify(decA, null, 2) + "\n");
    const before = readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8");

    const run = runCli(fixture.root, "repair-provenance", "--range", "garbage");
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}`, /--range must look like/);

    const after = readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8");
    assert.equal(after, before, "a pure usage error must not mutate the queue file");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance never deletes a queued entry just because its decision is momentarily invisible (branch checkout, unmounted overlay) — only a decision provably moved on is pruned", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // Simulates checking out a branch/commit that predates dec_a's decision
    // record, or a private overlay not mounted for this run — NOT proof the
    // match is dead. Deleting this entry would be permanent: per
    // repairqueue.ts's own docstring, the queue is the one durable record
    // once ORIG_HEAD moves on and the matched-away commit can be gc'd.
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_b", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue.map((r) => r.id), ["dec_a"], "dec_a's entry survives even though its decision wasn't visible this run");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply (no --only) never deletes an invisible entry's queue slot just because the whole run's queue is otherwise cleared", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    // Same invisibility as above, but exercised via the completion write at
    // the end of --apply (no --only): dec_a is never in `decisions`, so the
    // apply loop can't mark it applied, yet the old code cleared the WHOLE
    // queue on this path regardless.
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const decB = JSON.parse(readFileSync(fixture.decisionFile("dec_b"), "utf8")) as Decision;
    assert.equal(decB.commit, "sha_b_new", "dec_b, which WAS visible, is still applied");

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue.map((r) => r.id), ["dec_a"], "dec_a's entry survives — it was never actually applied, so it must not be cleared");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply --only <invisible-id> never deletes that entry — it was targeted but never actually resolved", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_a", "--quiet");
    assert.equal(run.status, 0, run.stderr);

    const queue = JSON.parse(readFileSync(join(fixture.root, ".hunch", "pending-commit-repairs.json"), "utf8")) as { id: string }[];
    assert.deepEqual(queue.map((r) => r.id).sort(), ["dec_a", "dec_b"], "targeting an invisible id with --only must not delete it, or leave dec_b's untouched entry");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply --only <invisible-id> reports it couldn't see the decision, not that it 'already moved on'", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_a");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /are visible this run/);
    assert.doesNotMatch(run.stdout, /already moved on/, "the decision wasn't seen at all — that's a different, more actionable answer than 'moved on'");
    assert.match(run.stdout, /--drop <dec_id>/, "names the escape hatch for a decision that's actually gone for good, not just transiently invisible");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply (whole queue invisible) names the ids in its 'nothing applied' message, not just the escape hatch", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    rmSync(fixture.decisionFile("dec_a"));
    rmSync(fixture.decisionFile("dec_b"));

    const run = runCli(fixture.root, "repair-provenance", "--apply");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /are visible this run/);
    assert.match(run.stdout, /dec_a.*dec_b|dec_b.*dec_a/s, "names which ids are stuck, matching the sibling partial-success message's convention");
    assert.match(run.stdout, /--drop <dec_id>/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance dry run marks a listed entry whose decision isn't visible this run — --apply would leave it queued, not resolve it", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Would repair 1 of 2 listed/, "one of the two is annotated not-visible, so the count must not overclaim both are repairable");
    assert.match(run.stdout, /dec_a.*not visible this run/, "dec_a's row is marked — --apply can't actually resolve it");
    assert.doesNotMatch(run.stdout, /dec_b.*not visible this run/, "dec_b IS visible — its row must not be marked");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --apply reports which entries stayed queued unresolved, alongside what it actually repaired", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    rmSync(fixture.decisionFile("dec_a"));

    const run = runCli(fixture.root, "repair-provenance", "--apply");
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Repaired 1 commit reference/);
    assert.match(run.stdout, /not visible this run, left queued: dec_a/, "a human reading the success output should learn dec_a is still pending, not silently dropped");
    assert.match(run.stdout, /--drop <dec_id>/, "names the escape hatch for a decision that's actually gone for good");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --only <id-not-present> reports nothing to apply and changes nothing", () => {
  const fixture = twoDecisionQueueFixture();
  try {
    const run = runCli(fixture.root, "repair-provenance", "--apply", "--only", "dec_missing");
    assert.notEqual(run.status, 0);
    assert.match(`${run.stdout}${run.stderr}`, /no queued or matched entry for "dec_missing"/);
    const decA = JSON.parse(readFileSync(fixture.decisionFile("dec_a"), "utf8")) as Decision;
    assert.equal(decA.commit, "sha_a_old");
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance --from-hook is silent and exits 0 when there's no ORIG_HEAD to react to", () => {
  const root = mkdtempSync(join(tmpdir(), "hunch-squash-noop-"));
  try {
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test Human");
    ensureGitignore(root);
    writeFileSync(join(root, "a.txt"), "x\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "init");
    const run = runCli(root, "repair-provenance", "--from-hook", "--quiet");
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** A public repo with a genuinely separate private-overlay repo, matching
 *  the shape HunchStore's overlay safety check requires. The public store
 *  has ZERO decisions; the decision this test cares about lives only in the
 *  overlay, so store.advisoryRecs("decisions") (what SessionStart's
 *  orientation reads) sees nothing while store.recs("decisions") (the full
 *  store) does. */
function privateOverlaySessionStartFixture(): { root: string; overlayRoot: string; decisionId: string; env: NodeJS.ProcessEnv; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-sessionstart-public-"));
  const overlayRoot = mkdtempSync(join(tmpdir(), "hunch-sessionstart-overlay-"));
  const privateRoot = join(overlayRoot, ".hunch");

  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test Human");
  ensureGitignore(root);
  git(root, "add", ".gitignore");
  git(root, "commit", "-qm", "init");

  git(overlayRoot, "init", "-q", "-b", "main");
  git(overlayRoot, "config", "user.email", "test@example.com");
  git(overlayRoot, "config", "user.name", "Test Human");
  git(overlayRoot, "commit", "--allow-empty", "-qm", "init overlay");

  mkdirSync(privateRoot, { recursive: true });

  const decisionId = "dec_private_sessionstart";
  const commit = "cafefeed00cafefeed00cafefeed00cafefeed0";
  const decision: Decision = {
    id: decisionId,
    title: "Private decision",
    topic: null,
    status: "accepted",
    context: "",
    decision: "A private decision.",
    consequences: [],
    alternatives_rejected: [],
    rejected_tripwires: [],
    related_components: [],
    related_files: ["src/private.ts"],
    supersedes: null,
    superseded_by: null,
    caused_by_bug: null,
    commit,
    valid_from: "2026-01-01T00:00:00.000Z",
    valid_to: null,
    retired: { symbols: [], deps: [] },
    provenance: { source: "human_confirmed", confidence: 1, evidence: [`commit:${commit}`], last_verified: "2026-01-01T00:00:00.000Z" },
    date: "2026-01-01T00:00:00.000Z",
  };

  const prior = process.env.HUNCH_PRIVATE_DIR;
  process.env.HUNCH_PRIVATE_DIR = privateRoot;
  try {
    const store = new HunchStore(hunchPaths(root));
    store.putPrivate("decisions", decision);
    store.close();
  } finally {
    if (prior === undefined) delete process.env.HUNCH_PRIVATE_DIR;
    else process.env.HUNCH_PRIVATE_DIR = prior;
  }

  mkdirSync(join(root, ".hunch"), { recursive: true });
  writeFileSync(
    queueFile(root),
    JSON.stringify([{ id: decisionId, from: commit, to: "d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0" }], null, 2) + "\n",
  );

  return {
    root,
    overlayRoot,
    decisionId,
    env: { ...process.env, HUNCH_PRIVATE_DIR: privateRoot, HUNCH_SYNTH_PROVIDER: "deterministic" },
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(overlayRoot, { recursive: true, force: true });
    },
  };
}

test("SessionStart orientation surfaces a queued commit-repair escalation for a private-overlay decision even when the public store has zero decisions", () => {
  const fixture = privateOverlaySessionStartFixture();
  try {
    const run = spawnSync(process.execPath, [tsx, cli, "hook", "--provider", "claude"], {
      cwd: fixture.root,
      env: fixture.env,
      input: JSON.stringify({ hook_event_name: "SessionStart", session_id: "s1" }),
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(
      run.stdout,
      new RegExp(fixture.decisionId),
      "the public decisions list is empty, but the queued repair is fully answerable via the full store — SessionStart must not bail silently before checking it",
    );
  } finally {
    fixture.cleanup();
  }
});
