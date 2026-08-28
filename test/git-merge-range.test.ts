import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commitRepairStatus, mergeRangeChanges } from "../src/extractors/git.js";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function repo(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-git-merge-range-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test Human");
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("mergeRangeChanges: one candidate per commit in the range, with its changed files", () => {
  const { root, cleanup } = repo();
  try {
    writeFileSync(join(root, "a.txt"), "1\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");

    writeFileSync(join(root, "b.txt"), "1\n");
    git(root, "add", "b.txt");
    git(root, "commit", "-qm", "add b");
    const addB = git(root, "rev-parse", "--short", "HEAD");

    writeFileSync(join(root, "c.txt"), "1\n");
    git(root, "add", "c.txt");
    git(root, "commit", "-qm", "add c");
    const addC = git(root, "rev-parse", "--short", "HEAD");

    const candidates = mergeRangeChanges(base, "HEAD", root);
    assert.deepEqual(candidates, [
      { sha: addB, files: ["b.txt"] },
      { sha: addC, files: ["c.txt"] },
    ]);
  } finally { cleanup(); }
});

test("mergeRangeChanges: a commit that only DELETES a file never counts as touching it", () => {
  const { root, cleanup } = repo();
  try {
    writeFileSync(join(root, "a.txt"), "1\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");

    git(root, "rm", "-q", "a.txt");
    git(root, "commit", "-qm", "remove a");
    const removeA = git(root, "rev-parse", "--short", "HEAD");

    writeFileSync(join(root, "b.txt"), "1\n");
    git(root, "add", "b.txt");
    git(root, "commit", "-qm", "add b");
    const addB = git(root, "rev-parse", "--short", "HEAD");

    const candidates = mergeRangeChanges(base, "HEAD", root);
    // A deletion is never a sensible repair target — a decision's provenance
    // should never resolve to the commit that removed the file it's about.
    assert.deepEqual(candidates, [
      { sha: removeA, files: [] },
      { sha: addB, files: ["b.txt"] },
    ]);
  } finally { cleanup(); }
});

test("commitRepairStatus: distinguishes current, orphaned and unresolvable commits", () => {
  const { root, cleanup } = repo();
  try {
    writeFileSync(join(root, "a.txt"), "1\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-qb", "feature");
    writeFileSync(join(root, "b.txt"), "1\n");
    git(root, "add", "b.txt");
    git(root, "commit", "-qm", "feature work");
    const featureSha = git(root, "rev-parse", "HEAD");
    git(root, "checkout", "-q", "main");

    assert.equal(commitRepairStatus(base, "main", root), "current");
    assert.equal(commitRepairStatus(featureSha, "main", root), "orphaned");
    assert.equal(commitRepairStatus("deadbeef00deadbeef00deadbeef00deadbeef00", "main", root), "unresolvable");
    assert.equal(commitRepairStatus("not-a-sha", "main", root), "unresolvable");
  } finally { cleanup(); }
});

test("mergeRangeChanges: empty range yields no candidates", () => {
  const { root, cleanup } = repo();
  try {
    writeFileSync(join(root, "a.txt"), "1\n");
    git(root, "add", "a.txt");
    git(root, "commit", "-qm", "base");
    assert.deepEqual(mergeRangeChanges("HEAD", "HEAD", root), []);
  } finally { cleanup(); }
});
