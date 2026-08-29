/**
 * Local-only queue of commit-provenance repairs detected opportunistically
 * (typically by the post-merge hook, src/integrations/hooks.ts) but not yet
 * applied. `.hunch/pending-commit-repairs.json` is gitignored the same way
 * `.hunch/local.json` is — never committed, never pushed. It exists because
 * the opportunistic detection window is narrow: `ORIG_HEAD` gets overwritten
 * by the next merge, and the matched-away commit can eventually be gc'd —
 * queuing the exact {id, from, to} triple here lets a human confirm the match
 * later (`hunch repair-provenance --apply`) without losing it.
 *
 * `.hunch/dropped-commit-repairs.json` is the sibling tombstone file: a human
 * rejecting a queued match via `--drop` records the exact {id, from, to}
 * triple here, durably, so detection re-deriving the identical match on a
 * later merge doesn't re-queue what was already rejected — a genuinely
 * different replacement (`to`) for the same still-orphaned commit is a new
 * proposal and still surfaces (see commitrepair.ts's withoutDropped). Same
 * local-only, gitignored discipline as the queue.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./io.js";
import type { CommitRewrite, DroppedRewrite } from "./commitrepair.js";

function queuePath(root: string): string {
  return join(root, ".hunch", "pending-commit-repairs.json");
}

function droppedPath(root: string): string {
  return join(root, ".hunch", "dropped-commit-repairs.json");
}

function isCommitRewrite(value: unknown): value is CommitRewrite {
  if (!value || typeof value !== "object") return false;
  const { id, from, to } = value as CommitRewrite;
  // Non-empty, and to !== from — an empty target is never a useful rewrite,
  // and a no-op entry would apply "successfully" while accomplishing nothing.
  // Deliberately NOT a hex-shape check: from/to are opaque strings elsewhere
  // in this codebase's test fixtures, and repairDecisionCommit's own
  // `d.commit === mine.from` guard already makes a garbage `from` inert (it
  // can never match a real decision). A garbage `to`, however, is NOT
  // validated anywhere on the path that matters most — applying a queued
  // entry with no fresh range to resolve against (the normal "confirm a
  // match from an earlier run" case) never calls commitRepairStatus or
  // commitsExist at all, so an untrustworthy `to` would be written straight
  // into a decision's commit field and evidence. That gap is real and is
  // tracked separately, not closed here.
  return typeof id === "string" && !!id
    && typeof from === "string" && !!from
    && typeof to === "string" && !!to
    && to !== from;
}

function isDroppedRewrite(value: unknown): value is DroppedRewrite {
  if (!value || typeof value !== "object") return false;
  const { id, from, to } = value as DroppedRewrite;
  return typeof id === "string" && !!id
    && typeof from === "string" && !!from
    && typeof to === "string" && !!to;
}

/** Tolerant read: a missing or corrupt queue file is treated as empty — this
 *  is local scratch state, never a source of truth worth failing loudly over. */
export function readPendingRepairs(root: string): CommitRewrite[] {
  const path = queuePath(root);
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isCommitRewrite) : [];
  } catch {
    return [];
  }
}

export function writePendingRepairs(root: string, rewrites: readonly CommitRewrite[]): void {
  writeFileAtomic(queuePath(root), JSON.stringify(rewrites, null, 2) + "\n");
}

/** Tolerant read, same discipline as readPendingRepairs. */
export function readDroppedRepairs(root: string): DroppedRewrite[] {
  const path = droppedPath(root);
  if (!existsSync(path)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isDroppedRewrite) : [];
  } catch {
    return [];
  }
}

export function writeDroppedRepairs(root: string, dropped: readonly DroppedRewrite[]): void {
  writeFileAtomic(droppedPath(root), JSON.stringify(dropped, null, 2) + "\n");
}
