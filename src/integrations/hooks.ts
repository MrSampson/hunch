/**
 * Git post-commit hook installer (DESIGN.md §4 / §6). The hook fires the
 * learning loop after every commit. Loop-guarded via the HUNCH_SYNC env var, and
 * backgrounded so it never slows a commit down. Existing hooks are preserved —
 * we append a guarded block rather than clobbering.
 */
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { hooksDir } from "../extractors/git.js";

const MARK = "# >>> hunch post-commit >>>";
const ENDMARK = "# <<< hunch post-commit <<<";

function block(invocation: string, opts: { private?: boolean; commit?: boolean; localOnly?: boolean } = {}): string {
  // --private routes the auto-synthesized decision into the HUNCH_PRIVATE_DIR overlay
  // instead of the public repo. --commit (opt-in) also commits & pushes the repo the
  // decision landed in (the private store under --private, else this repo). The hook
  // script is local (.git/hooks/), never committed.
  const priv = opts.private ? " --private" : "";
  const commit = opts.commit ? " --commit" : "";
  return [
    MARK,
    'if [ -z "$HUNCH_SYNC" ]; then',
    "  export HUNCH_SYNC=1",
    // A split-private capture must not make a storage-private promise and then
    // ship the commit diff to a subscription CLI. Shared overlays are a separate
    // team policy, so only the explicit local-only mode forces deterministic.
    ...(opts.localOnly ? ["  export HUNCH_SYNTH_PROVIDER=deterministic"] : []),
    `  ( ${invocation} sync --from-hook --quiet${priv}${commit} >/dev/null 2>&1 || true ) &`,
    "fi",
    ENDMARK,
  ].join("\n");
}

export interface HookInstall {
  path: string;
  action: "created" | "appended" | "updated" | "unchanged";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Shared idempotent create/append/update-in-place logic for every hunch git
 *  hook: write a fresh hook file, replace our own managed block in place if the
 *  invocation changed, or append after any pre-existing (non-hunch) hook body
 *  without clobbering it. Used by all three hook installers below — the three
 *  copies had already drifted (installPreCommitHook was missing the chmodSync
 *  on its "updated" path) before this was unified. */
function installManagedBlock(root: string, hookName: string, mark: string, end: string, blk: string): HookInstall {
  const dir = hooksDir(root);
  // `git rev-parse --git-path hooks` returns a path relative to the repo in a
  // normal checkout, but an ABSOLUTE one inside a linked worktree (the shared
  // hooks dir). isAbsolute() handles both POSIX (/…) and Windows (C:\… / C:/…);
  // a bare startsWith("/") misfired on Windows worktrees → a doubled junk path.
  const abs = isAbsolute(dir) ? dir : join(root, dir);
  mkdirSync(abs, { recursive: true });
  const hookPath = join(abs, hookName);

  if (!existsSync(hookPath)) {
    writeFileSync(hookPath, `#!/bin/sh\n${blk}\n`);
    chmodSync(hookPath, 0o755);
    return { path: hookPath, action: "created" };
  }

  const cur = readFileSync(hookPath, "utf8");
  if (cur.includes(mark)) {
    const updated = cur.replace(new RegExp(`${escapeRe(mark)}[\\s\\S]*?${escapeRe(end)}`), blk);
    if (updated === cur) return { path: hookPath, action: "unchanged" };
    writeFileSync(hookPath, updated);
    chmodSync(hookPath, 0o755);
    return { path: hookPath, action: "updated" };
  }

  const appended = cur.endsWith("\n") ? `${cur}${blk}\n` : `${cur}\n${blk}\n`;
  writeFileSync(hookPath, appended);
  chmodSync(hookPath, 0o755);
  return { path: hookPath, action: "appended" };
}

export function installPostCommitHook(root: string, invocation: string, opts: { private?: boolean; commit?: boolean; localOnly?: boolean } = {}): HookInstall {
  return installManagedBlock(root, "post-commit", MARK, ENDMARK, block(invocation, opts));
}

const PRE_MARK = "# >>> hunch pre-commit (constraint guard) >>>";
const PRE_END = "# <<< hunch pre-commit <<<";

/** Install a pre-commit constraint guard (DESIGN §4 enforcement). Advisory by
 *  default (prints invariants in scope, never blocks); pass strict to fail the
 *  commit — but even strict only fails on a DIRECT, high-confidence, non-stale
 *  blocking invariant (see strictgate.ts), so it's safe on a shared repo.
 *  Preserves any existing pre-commit hook. */
export function installPreCommitHook(root: string, invocation: string, strict = false): HookInstall {
  const cmd = `${invocation} check --staged${strict ? " --strict" : ""}`;
  const blk = [PRE_MARK, strict ? cmd : `${cmd} || true`, PRE_END].join("\n");
  return installManagedBlock(root, "pre-commit", PRE_MARK, PRE_END, blk);
}

const MERGE_MARK = "# >>> hunch post-merge >>>";
const MERGE_END = "# <<< hunch post-merge <<<";

function mergeBlock(invocation: string): string {
  return [
    MERGE_MARK,
    'if [ -z "$HUNCH_MERGE_SYNC" ]; then',
    "  export HUNCH_MERGE_SYNC=1",
    // No --apply: this only detects a squash-merge orphaning a decision's commit
    // and queues the match (.hunch/pending-commit-repairs.json, local-only) for a
    // human to confirm via `hunch repair-provenance --apply` — the match signal
    // (file-set overlap, not git's own rename detection) isn't strong enough to
    // trust an unattended, backgrounded write into shared team memory.
    `  ( ${invocation} repair-provenance --from-hook --quiet >/dev/null 2>&1 || true ) &`,
    "fi",
    MERGE_END,
  ].join("\n");
}

/** Install a post-merge hook that opportunistically DETECTS a decision's commit
 *  provenance going orphaned right after a squash-merged branch lands locally
 *  (including a fast-forward from `git pull`) — while the original commits are
 *  still fully intact and matchable — and queues the match for a human to
 *  confirm. Own env-var guard, since this hook makes no commit of its own, so
 *  it can't re-trigger itself the way HUNCH_SYNC guards post-commit against its
 *  own commit; kept for consistency with the other two hooks regardless. */
export function installPostMergeHook(root: string, invocation: string): HookInstall {
  return installManagedBlock(root, "post-merge", MERGE_MARK, MERGE_END, mergeBlock(invocation));
}

/** Read-only diagnostic (used by `hunch doctor`): which of the three managed
 *  hooks are currently present. Never writes anything — a hook counts as
 *  installed if its managed marker is present, regardless of whether the
 *  invocation inside it happens to be stale. */
export function hookStatus(root: string): { postCommit: boolean; preCommit: boolean; postMerge: boolean } {
  const dir = hooksDir(root);
  const abs = isAbsolute(dir) ? dir : join(root, dir);
  const has = (name: string, mark: string): boolean => {
    try { return readFileSync(join(abs, name), "utf8").includes(mark); } catch { return false; }
  };
  return {
    postCommit: has("post-commit", MARK),
    preCommit: has("pre-commit", PRE_MARK),
    postMerge: has("post-merge", MERGE_MARK),
  };
}

const MERGE_MARK = "# >>> hunch post-merge >>>";
const MERGE_END = "# <<< hunch post-merge <<<";

/** Install a post-merge hook that re-syncs the committed grounding docs when a merge
 *  brought memory in behind them (fnd_c402046ac7). Two branches that each captured a
 *  record regenerate the same "N+1" counts line; git merges identical lines silently
 *  and the doc ends up one behind the store. The hook regenerates the existing docs
 *  from the PUBLIC store right after a local merge/pull that touched .hunch/, so the
 *  next commit carries them. Foreground (it rewrites five files), loop-guarded via
 *  HUNCH_SYNC, and it can never fail the merge. Preserves any existing hook. */
export function installPostMergeHook(root: string, invocation: string): HookInstall {
  const dir = hooksDir(root);
  const abs = isAbsolute(dir) ? dir : join(root, dir);
  mkdirSync(abs, { recursive: true });
  const hookPath = join(abs, "post-merge");
  const blk = [
    MERGE_MARK,
    'if [ -z "$HUNCH_SYNC" ]; then',
    "  if ! git diff --quiet ORIG_HEAD HEAD -- .hunch 2>/dev/null; then",
    `    ( HUNCH_SYNC=1 ${invocation} grounding --refresh 2>/dev/null || true )`,
    "  fi",
    "fi",
    MERGE_END,
  ].join("\n");

  if (!existsSync(hookPath)) {
    writeFileSync(hookPath, `#!/bin/sh\n${blk}\n`);
    chmodSync(hookPath, 0o755);
    return { path: hookPath, action: "created" };
  }
  const cur = readFileSync(hookPath, "utf8");
  if (cur.includes(MERGE_MARK)) {
    const updated = cur.replace(new RegExp(`${escapeRe(MERGE_MARK)}[\\s\\S]*?${escapeRe(MERGE_END)}`), blk);
    if (updated === cur) return { path: hookPath, action: "unchanged" };
    writeFileSync(hookPath, updated);
    chmodSync(hookPath, 0o755);
    return { path: hookPath, action: "updated" };
  }
  writeFileSync(hookPath, cur.endsWith("\n") ? `${cur}${blk}\n` : `${cur}\n${blk}\n`);
  chmodSync(hookPath, 0o755);
  return { path: hookPath, action: "appended" };
}
