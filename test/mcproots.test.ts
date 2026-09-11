import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { HunchStore } from "../src/store/hunchStore.js";
import { constraintId, findingId, manualDecisionId } from "../src/core/ids.js";
import { resolveActiveRoot } from "../src/mcp/roots.js";
import { pathKnownToHistory } from "../src/extractors/git.js";
import { buildServerWithRootControl, wireClientRoots, misroutedWorktreeCandidates } from "../src/mcp/server.js";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function repo(prefix = "hunch-roots-"): string {
  // canonicalRootPath() realpaths every root (issue #54), so the fixture must be
  // canonical too: on macOS tmpdir() is the /var -> /private/var symlink, and a raw
  // path would compare unequal to the resolved root the server legitimately returns.
  const root = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  git(root, "init", "-q");
  git(root, "config", "user.email", "mcp-roots@example.invalid");
  git(root, "config", "user.name", "MCP Roots Test");
  mkdirSync(join(root, ".hunch"), { recursive: true });
  writeFileSync(join(root, ".hunch", "seed.json"), "{}\n");
  writeFileSync(join(root, "app.ts"), "export const value = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fixture");
  return root;
}

function repoWithWorktree(): { root: string; worktree: string; cleanup: () => void } {
  const root = repo();
  const worktree = `${root}-wt`;
  git(root, "worktree", "add", "-q", "-b", "feature-roots", worktree);
  return {
    root,
    worktree,
    cleanup: () => {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    },
  };
}

function repoWithTwoWorktrees(): { root: string; worktreeA: string; worktreeB: string; cleanup: () => void } {
  const root = repo();
  const worktreeA = `${root}-wtA`;
  const worktreeB = `${root}-wtB`;
  git(root, "worktree", "add", "-q", "-b", "feature-a", worktreeA);
  git(root, "worktree", "add", "-q", "-b", "feature-b", worktreeB);
  return {
    root,
    worktreeA,
    worktreeB,
    cleanup: () => {
      for (const wt of [worktreeA, worktreeB]) {
        try { git(root, "worktree", "remove", "--force", wt); } catch { /* best effort */ }
        try { rmSync(wt, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    },
  };
}

test("misroutedWorktreeCandidates: direct unit coverage (issue #54 review, I2)", () => {
  // No related_files: never suspicious, regardless of where anything lives.
  {
    const fixture = repoWithWorktree();
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, []), []);
    } finally {
      fixture.cleanup();
    }
  }
  // related_files present at the root: not a misroute, whatever siblings hold.
  {
    const fixture = repoWithWorktree();
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, ["app.ts"]), []);
    } finally {
      fixture.cleanup();
    }
  }
  // related_files absent everywhere: no plausible alternative, so not a misroute.
  {
    const fixture = repoWithWorktree();
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, ["never-existed.ts"]), []);
    } finally {
      fixture.cleanup();
    }
  }
  // related_files absent at root but present in exactly one sibling: that sibling.
  {
    const fixture = repoWithWorktree();
    writeFileSync(join(fixture.worktree, "only-there.ts"), "export const x = 1;\n");
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, ["only-there.ts"]), [fixture.worktree]);
    } finally {
      fixture.cleanup();
    }
  }
  // related_files absent at root but present in TWO siblings: both, not a guess.
  {
    const fixture = repoWithTwoWorktrees();
    writeFileSync(join(fixture.worktreeA, "shared.ts"), "export const a = 1;\n");
    writeFileSync(join(fixture.worktreeB, "shared.ts"), "export const b = 1;\n");
    try {
      const candidates = misroutedWorktreeCandidates(fixture.root, ["shared.ts"]).sort();
      assert.deepEqual(candidates, [fixture.worktreeA, fixture.worktreeB].sort());
    } finally {
      fixture.cleanup();
    }
  }
  // related_files absent at root because THIS checkout deleted it: not a misroute,
  // even though a sibling that branched before the delete still has it (issue #54
  // review, C1 — the case a plain existence check can't tell apart from a real one).
  {
    const root = repo();
    writeFileSync(join(root, "legacy.ts"), "export const legacy = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "add legacy.ts");
    const worktree = `${root}-wt`;
    git(root, "worktree", "add", "-q", "-b", "feature-roots", worktree);
    git(root, "rm", "-q", "legacy.ts");
    git(root, "commit", "-qm", "drop legacy.ts");
    try {
      assert.deepEqual(misroutedWorktreeCandidates(root, ["legacy.ts"]), []);
    } finally {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // related_files absent at root because THIS checkout deleted a NON-ASCII-named
  // file: git's core.quotePath defaults true, so `git log --name-only` renders a
  // byte > 0x7F as a backslash-octal-quoted string ("caf\303\251.ts") that can
  // never exact-match the raw filename — every OTHER path enumerator in this file
  // pins core.quotePath=false for exactly this reason (issue #50); an earlier
  // version of this history check didn't, so this deleted-at-the-correct-root case
  // read as "never tracked" — a FALSE POSITIVE worse than a miss, since obeying
  // the guard's own "retry with cwd" advice would then misroute a LEGITIMATE
  // delete into whichever sibling still predates it (PR #76 review round 6 C1).
  {
    const root = repo("hunch-roots-unicode-");
    writeFileSync(join(root, "café.ts"), "export const x = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "add café.ts");
    const worktree = `${root}-wt`;
    git(root, "worktree", "add", "-q", "-b", "feature-unicode", worktree);
    git(root, "rm", "-q", "café.ts");
    git(root, "commit", "-qm", "drop café.ts");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(root, ["café.ts"]),
        [],
        "a non-ASCII filename deleted at the correct root must count as known-to-history, not a misroute",
      );
    } finally {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // core.quotePath=false (round 6's fix) only stops git quoting bytes > 0x7F —
  // git ALWAYS C-quotes a `"`, and a filename with a literal TAB or leading
  // space is independently mishandled by any implementation that trims or
  // newline-splits the git output. Each of these deleted-at-the-correct-root
  // shapes was still a FALSE POSITIVE after round 6's fix (PR #76 review round
  // 7 I1) — the underlying fix (NUL-separated `-z` output, checked with an
  // UNTRIMMED read) closes the whole class at once rather than one byte range
  // at a time.
  for (const name of ['q"uote.ts', "tab\tsep.ts", " lead.ts", "trail.ts "]) {
    const root = repo("hunch-roots-quoteclass-");
    writeFileSync(join(root, name), "export const x = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", `add ${JSON.stringify(name)}`);
    const worktree = `${root}-wt`;
    git(root, "worktree", "add", "-q", "-b", "feature-quoteclass", worktree);
    git(root, "rm", "-q", "--", name);
    git(root, "commit", "-qm", `drop ${JSON.stringify(name)}`);
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(root, [name]),
        [],
        `a filename shaped like ${JSON.stringify(name)}, deleted at the correct root, must count as known-to-history, not a misroute`,
      );
    } finally {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // related_files absent at root because a MERGE commit resolved a conflict by
  // deleting it: `git log --name-only` (default diff simplification) prints
  // NOTHING for a merge commit unless told otherwise, so an earlier version of
  // this history check silently read this as "never tracked" — the same
  // false-positive shape as the non-ASCII case above, from a different git
  // default (PR #76 review round 6 C2).
  {
    const root = repo("hunch-roots-mergedel-");
    writeFileSync(join(root, "f.ts"), "content A\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "add f.ts");
    const worktree = `${root}-wt`;
    // Branch the sibling worktree BEFORE the conflicting edits, so it still has f.ts.
    git(root, "worktree", "add", "-q", "-b", "feature-merge-side", worktree);
    writeFileSync(join(worktree, "f.ts"), "content C from worktree\n");
    git(worktree, "commit", "-qam", "worktree edits f.ts");
    writeFileSync(join(root, "f.ts"), "content B from root\n");
    git(root, "commit", "-qam", "root edits f.ts");
    try {
      execFileSync("git", ["merge", "--no-ff", "feature-merge-side", "-m", "merge side"], { cwd: root, encoding: "utf8" });
    } catch { /* expected merge conflict */ }
    git(root, "rm", "-q", "f.ts");
    git(root, "commit", "-qm", "resolve: drop f.ts");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(root, ["f.ts"]),
        [],
        "a merge commit that resolved a conflict by deleting the file must count as known-to-history, not a misroute",
      );
    } finally {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // ABSOLUTE evidence (issue #76 C1): the worktree's OWN absolute path for a file
  // that exists ONLY there must resolve to that worktree directly — relativizing
  // it against root alone (an earlier version of this fix) produces "../…" and
  // silently drops it, reproducing the #54 bypass one level removed.
  {
    const fixture = repoWithWorktree();
    writeFileSync(join(fixture.worktree, "abs-only-there.ts"), "export const x = 1;\n");
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, [join(fixture.worktree, "abs-only-there.ts")]), [fixture.worktree]);
    } finally {
      fixture.cleanup();
    }
  }
  // An absolute path that exists at root itself: not a misroute.
  {
    const fixture = repoWithWorktree();
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, [join(fixture.root, "app.ts")]), []);
    } finally {
      fixture.cleanup();
    }
  }
  // An absolute path outside every known worktree: nothing to compare, not a misroute.
  {
    const fixture = repoWithWorktree();
    try {
      const outside = process.platform === "win32" ? "C:\\elsewhere\\other.ts" : "/elsewhere/other.ts";
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, [outside]), []);
    } finally {
      fixture.cleanup();
    }
  }
  // An absolute path lexically under a worktree's tree, but the file doesn't
  // actually exist there: still not a misroute — the existence check must fire,
  // not just the containment check (PR #76 review round 3 test-coverage gap).
  {
    const fixture = repoWithWorktree();
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, [join(fixture.worktree, "does-not-exist.ts")]), []);
    } finally {
      fixture.cleanup();
    }
  }
  // A file genuinely named "..odd.ts" at a worktree's top level must not be
  // mistaken for a ".." path-traversal segment and discarded as "outside the
  // tree" (PR #76 review round 3 I1c — a prefix match, not a segment match, would
  // get this wrong: "..odd.ts".startsWith("..") is true).
  {
    const fixture = repoWithWorktree();
    writeFileSync(join(fixture.worktree, "..odd.ts"), "export const odd = 1;\n");
    try {
      assert.deepEqual(misroutedWorktreeCandidates(fixture.root, [join(fixture.worktree, "..odd.ts")]), [fixture.worktree]);
    } finally {
      fixture.cleanup();
    }
  }
  // NESTED worktree — root/.worktrees/feature, the exact layout `hunch worktree`
  // itself creates (src/cli/index.ts resolves a bare path argument against root).
  // A shallow "is this absolute path under root's own directory tree" check would
  // wrongly attribute a file that exists ONLY in the nested worktree to root,
  // since root's tree lexically contains it — deepestContainer must pick the more
  // specific (longer) match instead (PR #76 review round 3 I1a).
  {
    const root = repo("hunch-roots-nested-");
    const nestedDir = join(root, ".worktrees");
    mkdirSync(nestedDir, { recursive: true });
    const nested = join(nestedDir, "feature");
    git(root, "worktree", "add", "-q", "-b", "feature-nested", nested);
    writeFileSync(join(nested, "nested-only.ts"), "export const x = 1;\n");
    try {
      assert.deepEqual(misroutedWorktreeCandidates(root, [join(nested, "nested-only.ts")]), [nested]);
    } finally {
      try { git(root, "worktree", "remove", "--force", nested); } catch { /* best effort */ }
      try { rmSync(nested, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // A worktree reached through a SYMLINKED alias: the raw literal string comparison
  // in `relative()` wouldn't match, but canonicalRootPath resolves both sides first
  // (the same resolution resolveActiveRoot already relies on for case/8.3-spelling
  // equivalence) — so an absolute path through the alias still resolves to the real
  // worktree (PR #76 review round 3 I1b). Symlink creation needs elevated
  // permissions on Windows; skip there rather than fail on an environment quirk
  // unrelated to what this test is proving.
  if (process.platform !== "win32") {
    const fixture = repoWithWorktree();
    const alias = `${fixture.worktree}-alias`;
    symlinkSync(fixture.worktree, alias, "dir");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, [join(alias, "app.ts")]),
        [fixture.worktree],
        "an absolute path reached through a symlinked alias must still resolve to the real worktree",
      );
    } finally {
      try { rmSync(alias, { force: true }); } catch { /* best effort */ }
      fixture.cleanup();
    }
  }
  // A SYMLINK-SPELLED ROOT (reachable in production via `hunch mcp --root
  // <path through a symlink>`, which pins the root and skips client-root
  // canonicalization entirely) must not silence the guard for an ORDINARY
  // relative filename that never escapes root's own tree — the exact #54
  // shape this whole guard exists to catch. Resolving a non-existent relative
  // entry against the raw `root` string, then trying to canonicalize the
  // (still nonexistent) result, hits realpath's not-found fallback and stays
  // spelled like `root` — comparing that against the CANONICAL root then
  // reads as "escaping" and silently disables the guard (PR #76 review round
  // 7 C1).
  if (process.platform !== "win32") {
    const fixture = repoWithWorktree();
    const rootAlias = `${fixture.root}-alias`;
    symlinkSync(fixture.root, rootAlias, "dir");
    writeFileSync(join(fixture.worktree, "only-in-worktree.ts"), "export const x = 1;\n");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(rootAlias, ["only-in-worktree.ts"]),
        [fixture.worktree],
        "an ordinary relative filename must still be caught when root itself is reached through a symlink",
      );
    } finally {
      try { rmSync(rootAlias, { force: true }); } catch { /* best effort */ }
      fixture.cleanup();
    }
  }
  // The DUAL of the above: a symlink-spelled root whose relative entry DOES
  // exist there must still read as "not a misroute" — pins the direction the
  // round-7 regression actually lived in, so a future simplification back to
  // resolve(root, f) would fail THIS test even though it would still pass the
  // "must still be caught" test above (PR #76 review round 8 M4).
  if (process.platform !== "win32") {
    const fixture = repoWithWorktree();
    const rootAlias = `${fixture.root}-alias`;
    symlinkSync(fixture.root, rootAlias, "dir");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(rootAlias, ["app.ts"]),
        [],
        "a relative filename that genuinely exists at a symlink-spelled root must not be flagged as a misroute",
      );
    } finally {
      try { rmSync(rootAlias, { force: true }); } catch { /* best effort */ }
      fixture.cleanup();
    }
  }
  // A SYMLINK physically AT root, whose TARGET lives in a sibling worktree
  // (e.g. a shared cache file), must not be misread as "this relative entry
  // escapes root's own tree". Escape-classification is a LEXICAL question
  // (does the string contain a ".." segment that leaves root) — canonicalizing
  // (following symlinks) at that step conflates it with a different question
  // ("what does this path's content resolve to"), reclassifying a file that
  // genuinely exists at root as escaping and refusing a write that was already
  // correctly homed — a false positive (PR #76 review round 8 M2).
  if (process.platform !== "win32") {
    const fixture = repoWithWorktree();
    const targetDir = join(fixture.worktree, "shared-target");
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "shared.ts"), "export const shared = 1;\n");
    const linkPath = join(fixture.root, "shared-link.ts");
    symlinkSync(join(targetDir, "shared.ts"), linkPath, "file");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, ["shared-link.ts"]),
        [],
        "a symlink AT root pointing into a sibling worktree must not be treated as an escaping entry",
      );
    } finally {
      try { rmSync(linkPath, { force: true }); } catch { /* best effort */ }
      fixture.cleanup();
    }
  }
  // pathKnownToHistory must reject an EMPTY string outright rather than let it
  // match the trailing "" element `-z`'s NUL-termination always produces --
  // defense in depth for the function's own documented contract, even though
  // the sole caller already filters falsy entries before calling it (PR #76
  // review round 8 M1).
  {
    const fixture = repoWithWorktree();
    try {
      assert.equal(pathKnownToHistory(fixture.root, ""), false, "an empty string must never read as known-to-history");
    } finally {
      fixture.cleanup();
    }
  }
  // A DIRECTORY entry among the file evidence must not silence the guard for
  // every OTHER entry in the same call: existsSync is true for directories, so
  // pairing a real (existing-at-root) directory with a genuinely misrouted file
  // used to disable the check entirely — including the natural "." / "" an agent
  // might send meaning "the repo itself" (PR #76 review round 4 I1). "src" exists
  // at root (repoWithWorktree's fixture has an app.ts at the top level, so its
  // directory root always exists); "only-in-worktree.ts" exists only in the
  // worktree.
  {
    const fixture = repoWithWorktree();
    writeFileSync(join(fixture.worktree, "only-in-worktree.ts"), "export const x = 1;\n");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, [".", "only-in-worktree.ts"]),
        [fixture.worktree],
        `a directory entry ('.') paired with a genuinely misrouted file must not silence the guard`,
      );
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, ["", "only-in-worktree.ts"]),
        [fixture.worktree],
        `an empty-string entry must not silence the guard either`,
      );
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, [fixture.root, "only-in-worktree.ts"]),
        [fixture.worktree],
        `an ABSOLUTE directory entry (root itself) must not silence the guard either`,
      );
    } finally {
      fixture.cleanup();
    }
  }
  // A TRACKED DIRECTORY entry must not satisfy the known-to-history escape hatch
  // either: `git log -- src` (an ordinary pathspec) matches any commit that ever
  // touched ANYTHING under src/, not just a file literally named "src" — so
  // pairing a real tracked directory with a genuinely misrouted file used to
  // silence the guard the same way the existence check did (PR #76 review round
  // 5 C1). "src/app.ts" is tracked; "only-in-worktree.ts" exists only in the
  // worktree.
  {
    const root = repo("hunch-roots-trackeddir-");
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "app.ts"), "export const x = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-qm", "add src/app.ts");
    const worktree = `${root}-wt`;
    git(root, "worktree", "add", "-q", "-b", "feature-trackeddir", worktree);
    writeFileSync(join(worktree, "only-in-worktree.ts"), "export const y = 1;\n");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(root, ["src", "only-in-worktree.ts"]),
        [worktree],
        "a tracked directory entry ('src') must not satisfy pathKnownToHistory and silence the guard",
      );
    } finally {
      try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
      try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
      try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    }
  }
  // A RELATIVE entry that ESCAPES root's own tree with a ".." segment is the SAME
  // #54 misroute as an absolute worktree-rooted path, merely spelled relatively —
  // the containment hardening must catch this spelling too, not just the
  // absolute one (PR #76 review round 5 I1).
  {
    const fixture = repoWithWorktree();
    writeFileSync(join(fixture.worktree, "only-in-worktree.ts"), "export const x = 1;\n");
    const escaped = join(relative(fixture.root, fixture.worktree), "only-in-worktree.ts");
    try {
      assert.deepEqual(
        misroutedWorktreeCandidates(fixture.root, [escaped]),
        [fixture.worktree],
        `a relative ".." escape into a sibling worktree must resolve to that worktree, not be silently dropped: ${escaped}`,
      );
    } finally {
      fixture.cleanup();
    }
  }
});

async function until(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("timed out waiting for MCP root change");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function rootsClient(initial: string[]) {
  const client = new Client(
    { name: "mcp-roots-test", version: "0.0.0" },
    { capabilities: { roots: { listChanged: true } } },
  );
  const state = { roots: initial, gate: null as Promise<void> | null };
  client.setRequestHandler(ListRootsRequestSchema, async () => {
    const snapshot = [...state.roots];
    if (state.gate) await state.gate;
    return { roots: snapshot.map((path) => ({ uri: pathToFileURL(path).href, name: "workspace" })) };
  });
  return { client, state };
}

test("resolveActiveRoot follows one advertised worktree and falls back when none are advertised", () => {
  const fixture = repoWithWorktree();
  try {
    assert.equal(resolveActiveRoot([], fixture.root), fixture.root);
    assert.equal(resolveActiveRoot([pathToFileURL(fixture.worktree).href], fixture.root), fixture.worktree);
  } finally {
    fixture.cleanup();
  }
});

test("case-variant spellings of ONE repo resolve to one canonical root, not an ambiguous pair (issue #54)", () => {
  const root = repo("hunch-roots-case-");
  try {
    // VS Code advertises file:///c%3A/… (lowercase drive) while the spawn cwd
    // says C:\… — same repo, two spellings. Both single-root resolution and the
    // multi-candidate dedup must collapse them.
    const swapped = process.platform === "win32" && /^[A-Za-z]:/.test(root)
      ? (root[0] === root[0]!.toLowerCase() ? root[0]!.toUpperCase() : root[0]!.toLowerCase()) + root.slice(1)
      : root; // POSIX is case-sensitive: same spelling, test degenerates to dedup-of-identical
    const resolved = resolveActiveRoot([pathToFileURL(root).href, pathToFileURL(swapped).href], root);
    assert.notEqual(resolved, null, "one repo in two spellings must never read as ambiguous");
    assert.equal(resolveActiveRoot([pathToFileURL(swapped).href], root), resolved, "either spelling resolves to the same canonical root");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveActiveRoot refuses an ambiguous multi-repo list instead of choosing the wrong store", () => {
  const first = repo("hunch-roots-first-");
  const second = repo("hunch-roots-second-");
  try {
    assert.equal(
      resolveActiveRoot([pathToFileURL(first).href, pathToFileURL(second).href], first),
      null,
      "two valid Hunch stores have no protocol-level active marker",
    );
  } finally {
    rmSync(first, { recursive: true, force: true });
    rmSync(second, { recursive: true, force: true });
  }
});

test("resolveActiveRoot accepts a valid file root by resolving its containing repository", () => {
  const root = repo();
  try {
    assert.equal(resolveActiveRoot([pathToFileURL(join(root, "app.ts")).href], root), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("root control closes the previous SQLite store and closes the active store on shutdown", async (t) => {
  const fixture = repoWithWorktree();
  const originalClose = HunchStore.prototype.close;
  let closes = 0;
  HunchStore.prototype.close = function patchedClose(): void {
    closes++;
    return originalClose.call(this);
  };
  t.after(() => {
    HunchStore.prototype.close = originalClose;
    fixture.cleanup();
  });

  const control = buildServerWithRootControl(fixture.root);
  control.setRoot(fixture.worktree);
  assert.equal(closes, 1, "the superseded store is closed after an idle root swap");

  await control.server.close();
  assert.equal(closes, 2, "server shutdown closes the currently active store");
});

test("a failed root activation leaves the previous root and store active", async (t) => {
  const fixture = repoWithWorktree();
  const invalid = repo("hunch-roots-invalid-team-");
  writeFileSync(join(invalid, ".hunch", "team.json"), "{ not-json");
  const control = buildServerWithRootControl(fixture.root);
  t.after(async () => {
    await control.server.close().catch(() => {});
    fixture.cleanup();
    rmSync(invalid, { recursive: true, force: true });
  });

  assert.throws(
    () => control.setRoot(invalid),
    /team\.json is invalid or unsafe/,
  );
  assert.equal(control.getRoot(), fixture.root, "the original root remains active");
});

test("initialize and roots/list_changed re-home the live MCP server", async (t) => {
  const fixture = repoWithWorktree();
  const second = `${fixture.root}-wt2`;
  git(fixture.root, "worktree", "add", "-q", "-b", "feature-roots-2", second);
  const { client, state } = rootsClient([fixture.worktree]);
  const control = buildServerWithRootControl(fixture.root);
  wireClientRoots(control, fixture.root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    try { git(fixture.root, "worktree", "remove", "--force", second); } catch { /* best effort */ }
    try { rmSync(second, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  await until(() => control.getRoot() === fixture.worktree);

  state.roots = [second];
  await client.sendRootsListChanged();
  await until(() => control.getRoot() === second);
  assert.equal(control.getRoot(), second);
});

test("a capture after initialization lands in the advertised worktree, not the spawn checkout", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(
    join(fixture.worktree, ".hunch", "local.json"),
    `${JSON.stringify({ autoCommit: false })}\n`,
  );
  const { client } = rootsClient([fixture.worktree]);
  const control = buildServerWithRootControl(fixture.root);
  wireClientRoots(control, fixture.root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  await until(() => control.getRoot() === fixture.worktree);

  const title = "worktree-rooted capture";
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: {
        title,
        topic: "worktree-rooted-capture",
        context: "root routing regression",
        decision: "Write beside the active work",
      },
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false);

  const filename = `${manualDecisionId(fixture.worktree, title)}.json`;
  assert.equal(existsSync(join(fixture.worktree, ".hunch", "decisions", filename)), true);
  assert.equal(existsSync(join(fixture.root, ".hunch", "decisions", filename)), false);
});

test("a root swap waits for an in-flight tool request before closing its store", async (t) => {
  const fixture = repoWithWorktree();
  const second = `${fixture.root}-wt2`;
  git(fixture.root, "worktree", "add", "-q", "-b", "feature-roots-2", second);
  const { client, state } = rootsClient([fixture.worktree]);
  const originalSearch = HunchStore.prototype.hybridSearch;
  let releaseSearch = () => {};
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const gate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  HunchStore.prototype.hybridSearch = async function delayedSearch(query, limit, options) {
    markStarted();
    await gate;
    return originalSearch.call(this, query, limit, options);
  };

  const control = buildServerWithRootControl(fixture.root);
  wireClientRoots(control, fixture.root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    HunchStore.prototype.hybridSearch = originalSearch;
    releaseSearch();
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    try { git(fixture.root, "worktree", "remove", "--force", second); } catch { /* best effort */ }
    try { rmSync(second, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  await until(() => control.getRoot() === fixture.worktree);

  const query = client.callTool({ name: "hunch_query", arguments: { query: "anything" } });
  await started;
  state.roots = [second];
  await client.sendRootsListChanged();
  assert.equal(control.getRoot(), fixture.worktree, "the current request keeps its root epoch");

  releaseSearch();
  await query;
  await until(() => control.getRoot() === second);
});

test("a stale roots/list response cannot overwrite a newer workspace", async (t) => {
  const fixture = repoWithWorktree();
  const second = `${fixture.root}-wt2`;
  git(fixture.root, "worktree", "add", "-q", "-b", "feature-roots-2", second);
  const { client, state } = rootsClient([fixture.worktree]);
  const control = buildServerWithRootControl(fixture.root);
  wireClientRoots(control, fixture.root);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    try { git(fixture.root, "worktree", "remove", "--force", second); } catch { /* best effort */ }
    try { rmSync(second, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  await until(() => control.getRoot() === fixture.worktree);

  let release = () => {};
  state.gate = new Promise<void>((resolve) => { release = resolve; });
  state.roots = [fixture.worktree];
  await client.sendRootsListChanged();
  await new Promise((resolve) => setTimeout(resolve, 25));

  state.gate = null;
  state.roots = [second];
  await client.sendRootsListChanged();
  await until(() => control.getRoot() === second);

  release();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(control.getRoot(), second);
});

// Claude Code CLI never advertises `roots`/`roots/list_changed` for an agent-driven
// `cd` or EnterWorktree (issue #20) — the client-side gap `resolveActiveRoot` above
// cannot see. These exercise the server-side fallback: an explicit `cwd` argument on
// the write tools themselves, resolved fresh per call instead of trusted from any
// cached root.
test("an explicit cwd argument re-homes a capture to the worktree with no roots protocol involved at all", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(
    join(fixture.worktree, ".hunch", "local.json"),
    `${JSON.stringify({ autoCommit: false })}\n`,
  );
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "cwd-hint-test", version: "0.0.0" }); // no roots capability at all
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  assert.equal(control.getRoot(), fixture.root, "server stays on its spawn root until told otherwise");

  const title = "cwd-hint capture";
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: { title, topic: "cwd-hint-capture", context: "worktree root routing", decision: "Write beside the active work" },
      cwd: fixture.worktree,
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false);
  assert.equal(control.getRoot(), fixture.worktree, "the cwd hint re-homes the server for this and later calls");

  const filename = `${manualDecisionId(fixture.worktree, title)}.json`;
  assert.equal(existsSync(join(fixture.worktree, ".hunch", "decisions", filename)), true);
  assert.equal(existsSync(join(fixture.root, ".hunch", "decisions", filename)), false);
});

test("a write tool reports where the capture actually landed", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "cwd-hint-destination-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: { title: "destination-reported capture", topic: "destination-note", context: "self-diagnosing capture", decision: "Report where it landed" },
      cwd: fixture.worktree,
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };
  assert.equal(!!result.isError, false);
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `response should name the destination root: ${text}`);
  assert.ok(text.includes("feature-roots"), `response should name the destination branch: ${text}`);

  // And the commit really did land on the worktree's branch, not the primary checkout's.
  assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "fixture", "primary checkout has no new commit");
  assert.equal(git(fixture.worktree, "log", "-1", "--format=%s").startsWith("hunch: capture "), true);
});

test("a cwd hint that would change roots is refused while another request is in flight, instead of silently using the wrong one", async (t) => {
  const fixture = repoWithWorktree();
  const originalSearch = HunchStore.prototype.hybridSearch;
  let releaseSearch = () => {};
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const gate = new Promise<void>((resolve) => { releaseSearch = resolve; });
  HunchStore.prototype.hybridSearch = async function delayedSearch(query, limit, options) {
    markStarted();
    await gate;
    return originalSearch.call(this, query, limit, options);
  };

  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "cwd-hint-concurrency-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    HunchStore.prototype.hybridSearch = originalSearch;
    releaseSearch();
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const inFlight = client.callTool({ name: "hunch_query", arguments: { query: "anything" } });
  await started;

  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: { title: "concurrent cwd-hint capture", context: "should be refused" },
      cwd: fixture.worktree,
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };
  assert.equal(result.isError, true);
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(/in flight|retry/i.test(text), `refusal should explain the conflict: ${text}`);
  assert.equal(control.getRoot(), fixture.root, "the root was never silently swapped mid-request");

  releaseSearch();
  await inFlight;
});

test("a capture about a file deleted at the resolved root is not treated as a misroute (issue #54 review, C1)", async (t) => {
  const root = repo();
  writeFileSync(join(root, "legacy.ts"), "export const legacy = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "add legacy.ts");
  const worktree = `${root}-wt`;
  git(root, "worktree", "add", "-q", "-b", "feature-roots", worktree);
  // Delete it at the root AFTER branching the worktree, so the worktree (which
  // predates the delete) still has it on disk — the exact shape a plain
  // existence check can't tell apart from a genuine misroute.
  git(root, "rm", "-q", "legacy.ts");
  git(root, "commit", "-qm", "drop legacy.ts");

  const control = buildServerWithRootControl(root);
  const client = new Client({ name: "misroute-delete-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    try { git(root, "worktree", "remove", "--force", worktree); } catch { /* best effort */ }
    try { rmSync(worktree, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
    try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch { /* temp only */ }
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const title = "drop legacy module";
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: { title, context: "removing dead code", decision: "Delete legacy.ts", related_files: ["legacy.ts"] },
    },
  }) as { isError?: boolean };

  assert.equal(!!result.isError, false, "a decision about a file this checkout deleted itself must not be refused as a misroute");
  const filename = `${manualDecisionId(root, title)}.json`;
  assert.equal(existsSync(join(root, ".hunch", "decisions", filename)), true, "must land at the (correct) root, not be blocked");
});

test("a capture whose related_files only exist in a linked worktree is refused when no cwd hint was passed (issue #54)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const title = "misrouted capture";
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: {
        title,
        context: "work done entirely in the linked worktree",
        decision: "Change worktree-only.ts",
        related_files: ["worktree-only.ts"],
      },
      // Deliberately no `cwd` — the exact failure mode reported in issue #54: a
      // subagent working in its own worktree never supplies the hint.
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "should refuse rather than silently commit to the wrong root");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
  assert.ok(/cwd/.test(text), `refusal should tell the caller to pass cwd: ${text}`);

  const filename = `${manualDecisionId(fixture.root, title)}.json`;
  assert.equal(existsSync(join(fixture.root, ".hunch", "decisions", filename)), false, "must not land on the primary checkout");
  assert.equal(existsSync(join(fixture.worktree, ".hunch", "decisions", filename)), false, "must not silently guess the worktree either — the caller must retry with cwd");
});

test("a capture whose related_files entry is the WORKTREE'S OWN absolute path is still refused (issue #76 C1)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-decision-absolute-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  // THE realistic shape: an agent working in the worktree constructs the absolute
  // path from ITS OWN cwd (the worktree), not from `root` (which it has no reason
  // to know or care about). Relativizing this against root alone produces "../…"
  // and gets dropped — the guard must instead recognize it as a path that exists
  // directly under a SIBLING worktree's own tree.
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: {
        title: "misrouted absolute-path capture",
        context: "work done entirely in the linked worktree",
        decision: "Change worktree-only.ts",
        related_files: [join(fixture.worktree, "worktree-only.ts")],
      },
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "an absolute related_files entry naming the worktree's own file must still trip the guard");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
});

test("a capture whose related_files match TWO sibling worktrees names both instead of confidently guessing one", async (t) => {
  const fixture = repoWithTwoWorktrees();
  writeFileSync(join(fixture.worktreeA, "shared-name.ts"), "export const a = 1;\n");
  writeFileSync(join(fixture.worktreeB, "shared-name.ts"), "export const b = 2;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-ambiguous-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const title = "ambiguous capture";
  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: {
        title,
        context: "matches two sibling worktrees",
        decision: "Change shared-name.ts",
        related_files: ["shared-name.ts"],
      },
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "should still refuse rather than guess between two equally plausible worktrees");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktreeA), `refusal should name worktree A as a candidate: ${text}`);
  assert.ok(text.includes(fixture.worktreeB), `refusal should name worktree B as a candidate: ${text}`);
  assert.ok(!/cwd:"/.test(text), `refusal must not issue a single confident cwd directive when two candidates are equally plausible: ${text}`);

  const filename = `${manualDecisionId(fixture.root, title)}.json`;
  assert.equal(existsSync(join(fixture.root, ".hunch", "decisions", filename)), false);
  assert.equal(existsSync(join(fixture.worktreeA, ".hunch", "decisions", filename)), false, "must not guess worktree A");
  assert.equal(existsSync(join(fixture.worktreeB, ".hunch", "decisions", filename)), false, "must not guess worktree B");
});

test("a capture with related_files that don't exist in any worktree still succeeds (no false positive)", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-negative-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: {
        title: "future-file capture",
        context: "decision precedes the file it will touch",
        decision: "Plan to add not-yet-created.ts",
        related_files: ["not-yet-created.ts"],
      },
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false, "no plausible alternate worktree means proceed as before");

  const filename = `${manualDecisionId(fixture.root, "future-file capture")}.json`;
  assert.equal(existsSync(join(fixture.root, ".hunch", "decisions", filename)), true, "must actually land at root, not just avoid erroring");
});

test("hunch_record_correction is refused when scope_hint_file only exists in a linked worktree (issue #62)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-correction-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_correction",
    arguments: {
      rule: "never touch worktree-only.ts without a review",
      scope_hint_file: "worktree-only.ts",
      // Deliberately no `cwd` — same shape as issue #54's original report.
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "should refuse rather than silently scope-and-commit against the wrong root");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
  assert.ok(/cwd/.test(text), `refusal should tell the caller to pass cwd: ${text}`);
  assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "fixture", "primary checkout must have no new commit");
});

test("hunch_record_correction: retrying the refused call WITH cwd actually lands the constraint in the worktree", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-correction-remedy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_correction",
    arguments: {
      rule: "never touch worktree-only.ts without a review",
      scope_hint_file: "worktree-only.ts",
      cwd: fixture.worktree,
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false, "the refusal's own remedy must actually work");
  assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "fixture", "primary checkout must still have no new commit");
  assert.equal(existsSync(join(fixture.worktree, ".hunch", "constraints")), true, "the constraint must land in the worktree");
});

test("hunch_record_correction is refused when scope_hint_file is the WORKTREE'S OWN absolute path (issue #76 C1)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-correction-absolute-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  // THE realistic shape (issue #76 C1): an agent working in the worktree
  // constructs the absolute path from ITS OWN cwd, not from `root`. Relativizing
  // it against root alone produces "../…" and gets dropped, which is the exact
  // bypass the guard exists to catch.
  const result = await client.callTool({
    name: "hunch_record_correction",
    arguments: {
      rule: "never touch worktree-only.ts without a review",
      scope_hint_file: join(fixture.worktree, "worktree-only.ts"),
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };
  assert.equal(result.isError, true, "an absolute scope_hint_file naming the worktree's own file must still trip the guard");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
});

test("hunch_record_correction with an absolute scope_hint_file OUTSIDE the repo still succeeds (no false positive)", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-correction-outside-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  // An absolute hint OUTSIDE every known worktree matches no worktree's tree — the
  // guard must treat that as "nothing to compare", not as "the file is absent here,
  // go look in sibling worktrees" (which would refuse a legitimate write).
  const outside = process.platform === "win32" ? "C:\\elsewhere\\other.ts" : "/elsewhere/other.ts";
  const result = await client.callTool({
    name: "hunch_record_correction",
    arguments: { rule: "an unrelated repo-external hint", scope_hint_file: outside },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false, "an out-of-repo absolute hint must not be treated as a misroute signal");
});

test("hunch_record_correction with no scope_hint_file, or a file that exists nowhere, still succeeds (no false positive)", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-correction-negative-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const noHintRule = "never do the risky thing repo-wide";
  const noHint = await client.callTool({
    name: "hunch_record_correction",
    arguments: { rule: noHintRule, applies_to_all: true },
  }) as { isError?: boolean };
  assert.equal(!!noHint.isError, false, "no scope_hint_file means nothing to compare across worktrees");
  assert.equal(
    existsSync(join(fixture.root, ".hunch", "constraints", `${constraintId(noHintRule)}.json`)), true,
    "must actually land at root, not just avoid erroring",
  );

  const nowhereFileRule = "plan ahead of the file that will land here";
  const nowhereFile = await client.callTool({
    name: "hunch_record_correction",
    arguments: { rule: nowhereFileRule, scope_hint_file: "not-yet-created.ts" },
  }) as { isError?: boolean };
  assert.equal(!!nowhereFile.isError, false, "no plausible alternate worktree means proceed as before");
  assert.equal(
    existsSync(join(fixture.root, ".hunch", "constraints", `${constraintId(nowhereFileRule)}.json`)), true,
    "must actually land at root, not just avoid erroring",
  );
});

test("hunch_record_finding is refused when affected_files only exist in a linked worktree (issue #62)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-finding-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_finding",
    arguments: {
      finding: {
        title: "worktree-only.ts is missing null checks",
        observation: "audited during work entirely in the linked worktree",
        affected_files: ["worktree-only.ts"],
      },
      // Deliberately no `cwd`.
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "should refuse rather than silently record the finding against the wrong root");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
  assert.ok(/cwd/.test(text), `refusal should tell the caller to pass cwd: ${text}`);
  assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "fixture", "primary checkout must have no new commit");
});

test("hunch_record_finding: retrying the refused call WITH cwd actually lands the finding in the worktree", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-finding-remedy-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_finding",
    arguments: {
      finding: {
        title: "worktree-only.ts is missing null checks",
        observation: "audited during work entirely in the linked worktree",
        affected_files: ["worktree-only.ts"],
      },
      cwd: fixture.worktree,
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false, "the refusal's own remedy must actually work");
  assert.equal(git(fixture.root, "log", "-1", "--format=%s"), "fixture", "primary checkout must still have no new commit");
  assert.equal(existsSync(join(fixture.worktree, ".hunch", "findings")), true, "the finding must land in the worktree");
});

test("hunch_record_finding is refused when affected_files is the WORKTREE'S OWN absolute path (issue #76 C1)", async (t) => {
  const fixture = repoWithWorktree();
  writeFileSync(join(fixture.worktree, "worktree-only.ts"), "export const onlyHere = 1;\n");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-finding-absolute-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  // THE realistic shape (issue #76 C1): an agent working in the worktree
  // constructs the absolute path from ITS OWN cwd, not from `root`.
  const result = await client.callTool({
    name: "hunch_record_finding",
    arguments: {
      finding: {
        title: "worktree-only.ts absolute-path audit",
        observation: "audited during work entirely in the linked worktree",
        affected_files: [join(fixture.worktree, "worktree-only.ts")],
      },
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };

  assert.equal(result.isError, true, "an absolute affected_files entry naming the worktree's own file must still trip the guard");
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(text.includes(fixture.worktree), `refusal should name the likely-correct worktree: ${text}`);
});

test("hunch_record_finding with affected_files that exist nowhere still succeeds (no false positive)", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "misroute-guard-finding-negative-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const title = "future-file audit";
  const result = await client.callTool({
    name: "hunch_record_finding",
    arguments: {
      finding: {
        title,
        observation: "notes ahead of the file that will land here",
        affected_files: ["not-yet-created.ts"],
      },
    },
  }) as { isError?: boolean };
  assert.equal(!!result.isError, false, "no plausible alternate worktree means proceed as before");
  assert.equal(
    existsSync(join(fixture.root, ".hunch", "findings", `${findingId(title)}.json`)), true,
    "must actually land at root, not just avoid erroring",
  );
});

test("a cwd hint that fails to activate (invalid team.json) reports the error and leaves the previous root active", async (t) => {
  const fixture = repoWithWorktree();
  const invalid = repo("hunch-roots-invalid-team-cwd-");
  writeFileSync(join(invalid, ".hunch", "team.json"), "{ not-json");
  const control = buildServerWithRootControl(fixture.root);
  const client = new Client({ name: "cwd-hint-activation-failure-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close().catch(() => {});
    await control.server.close().catch(() => {});
    fixture.cleanup();
    rmSync(invalid, { recursive: true, force: true });
  });

  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "hunch_record_decision",
    arguments: {
      decision: { title: "cwd hint onto a broken team.json", context: "should surface the activation failure, not crash" },
      cwd: invalid,
    },
  }) as { content: Array<{ text: string }>; isError?: boolean };
  assert.equal(result.isError, true);
  const text = result.content.map((c) => c.text ?? "").join("\n");
  assert.ok(/team\.json is invalid or unsafe/.test(text), `should surface the underlying activation error: ${text}`);
  assert.equal(control.getRoot(), fixture.root, "a failed cwd-hint activation leaves the previous root active");
});

test("a pinned root (hunch mcp --root) ignores setRoot from client roots and per-call cwd hints", async (t) => {
  const fixture = repoWithWorktree();
  const control = buildServerWithRootControl(fixture.root, { pinned: true });
  t.after(async () => {
    await control.server.close().catch(() => {});
    fixture.cleanup();
  });
  assert.equal(control.pinned, true);
  control.setRoot(fixture.worktree);
  assert.equal(control.getRoot(), fixture.root, "client roots cannot re-home a pinned server");

  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "pinned-test", version: "1.0.0" });
  await Promise.all([control.server.connect(serverTransport), client.connect(clientTransport)]);
  t.after(async () => { await client.close().catch(() => {}); });
  const result = await client.callTool({ name: "nuryel_capabilities", arguments: {} });
  assert.ok(!result.isError);
  // A cwd hint naming the worktree would normally re-home a non-pinned server.
  await client.callTool({ name: "hunch_record_finding", arguments: { finding: { title: "pinned probe", observation: "cwd hint must be ignored" }, cwd: fixture.worktree } });
  assert.equal(control.getRoot(), fixture.root, "the cwd hint is ignored on a pinned server");
});
