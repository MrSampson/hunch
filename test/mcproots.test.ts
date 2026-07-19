import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveActiveRoot } from "../src/mcp/roots.js";
import { buildServerWithRootControl } from "../src/mcp/server.js";
import { hunchPaths } from "../src/core/paths.js";

const g = (cwd: string, ...a: string[]): void => {
  execFileSync("git", a, { cwd, stdio: ["ignore", "ignore", "ignore"] });
};

/** A repo with a .hunch/, plus a linked worktree on its own branch — the shape
 *  that produces the bug: the MCP server is spawned in `root`, the user works in `wt`. */
function repoWithWorktree(): { root: string; wt: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-roots-"));
  g(root, "init", "-q");
  g(root, "config", "user.email", "t@example.com");
  g(root, "config", "user.name", "T");
  g(root, "checkout", "-q", "-b", "main");
  mkdirSync(join(root, ".hunch"), { recursive: true });
  writeFileSync(join(root, ".hunch", "seed.json"), "{}\n");
  g(root, "add", "-A");
  g(root, "commit", "-q", "-m", "init");
  const wt = `${root}-wt`;
  g(root, "worktree", "add", "-q", "-b", "feature-x", wt);
  return {
    root,
    wt,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(wt, { recursive: true, force: true });
    },
  };
}

test("resolveActiveRoot: no roots advertised → falls back to the spawn cwd (today's behaviour, unsupporting clients unaffected)", () => {
  const { root, cleanup } = repoWithWorktree();
  try {
    assert.equal(resolveActiveRoot([], root), root);
  } finally {
    cleanup();
  }
});

test("resolveActiveRoot: a client-advertised worktree root wins over the spawn cwd", () => {
  const { root, wt, cleanup } = repoWithWorktree();
  try {
    // The server was spawned in the primary checkout (on main), but the client
    // advertises the worktree as its workspace. Captures must follow the worktree.
    assert.equal(resolveActiveRoot([pathToFileURL(wt).href], root), wt);
  } finally {
    cleanup();
  }
});

test("resolveActiveRoot: accepts a plain path as well as a file:// URI", () => {
  const { root, wt, cleanup } = repoWithWorktree();
  try {
    assert.equal(resolveActiveRoot([wt], root), wt);
  } finally {
    cleanup();
  }
});

test("resolveActiveRoot: a subdirectory of a repo resolves to the repo root", () => {
  const { root, wt, cleanup } = repoWithWorktree();
  try {
    const sub = join(wt, "src", "deep");
    mkdirSync(sub, { recursive: true });
    assert.equal(resolveActiveRoot([pathToFileURL(sub).href], root), wt);
  } finally {
    cleanup();
  }
});

test("resolveActiveRoot: an unusable root (nonexistent) is ignored in favour of the fallback", () => {
  const { root, cleanup } = repoWithWorktree();
  try {
    assert.equal(resolveActiveRoot([pathToFileURL(join(root, "does-not-exist")).href], root), root);
  } finally {
    cleanup();
  }
});

test("resolveActiveRoot: with several roots advertised, prefers one that already has a .hunch store", () => {
  const { root, wt, cleanup } = repoWithWorktree();
  const other = mkdtempSync(join(tmpdir(), "hunch-roots-other-"));
  try {
    g(other, "init", "-q");
    // `other` is a git repo but carries no memory; `wt` shares the repo's .hunch.
    mkdirSync(join(wt, ".hunch"), { recursive: true });
    assert.equal(resolveActiveRoot([pathToFileURL(other).href, pathToFileURL(wt).href], root), wt);
  } finally {
    rmSync(other, { recursive: true, force: true });
    cleanup();
  }
});

test("buildServerWithRootControl: starts at the given root and re-homes when the client advertises another", () => {
  const { root, wt, cleanup } = repoWithWorktree();
  try {
    const ctl = buildServerWithRootControl(root);
    assert.equal(ctl.getRoot(), root, "starts at the spawn root");

    ctl.setRoot(resolveActiveRoot([pathToFileURL(wt).href], root));
    assert.equal(ctl.getRoot(), wt, "follows the client-advertised worktree");

    // memory now homes in the worktree, so captures land on its branch
    assert.equal(hunchPaths(ctl.getRoot()).hunch, join(wt, ".hunch"));
  } finally {
    cleanup();
  }
});

test("buildServerWithRootControl: setting the same root again is a no-op", () => {
  const { root, cleanup } = repoWithWorktree();
  try {
    const ctl = buildServerWithRootControl(root);
    const before = ctl.getRoot();
    ctl.setRoot(root);
    assert.equal(ctl.getRoot(), before);
  } finally {
    cleanup();
  }
});
