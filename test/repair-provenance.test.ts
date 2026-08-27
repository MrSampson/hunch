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

test("repair-provenance --apply rewrites commit + evidence to the squash-merge commit", () => {
  const fixture = squashFixture();
  try {
    const run = runCli(fixture.root, "repair-provenance", "--range", `${fixture.oldRef}..${fixture.newRef}`, "--apply");
    assert.equal(run.status, 0, run.stderr);
    const repaired = JSON.parse(readFileSync(fixture.decisionFile, "utf8")) as Decision;
    assert.equal(repaired.commit, fixture.newRef);
    assert.deepEqual(repaired.provenance.evidence, [`commit:${fixture.newRef}`]);
    assert.match(git(fixture.root, "log", "-1", "--format=%s"), /^hunch: repair 1 commit reference\(s\) after squash-merge/);
  } finally {
    fixture.cleanup();
  }
});

test("repair-provenance dry run (no --apply) reports the plan but changes nothing", () => {
  const fixture = squashFixture();
  try {
    const before = readFileSync(fixture.decisionFile, "utf8");
    const run = runCli(fixture.root, "repair-provenance", "--range", `${fixture.oldRef}..${fixture.newRef}`);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /Would repair 1 commit reference/);
    assert.equal(readFileSync(fixture.decisionFile, "utf8"), before);
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
