/**
 * Local-only queue of commit-provenance repairs detected opportunistically
 * (typically by the post-merge hook, src/integrations/hooks.ts) but not yet
 * applied. `.hunch/pending-commit-repairs.json` is gitignored the same way
 * `.hunch/local.json` is — never committed, never pushed. It exists because
 * the opportunistic detection window is narrow: `ORIG_HEAD` gets overwritten
 * by the next merge, and the matched-away commit can eventually be gc'd —
 * queuing the exact {id, from, to} triple here lets a human confirm the match
 * later (`hunch repair-provenance --apply`) without losing it.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./io.js";
import type { CommitRewrite } from "./commitrepair.js";

function queuePath(root: string): string {
  return join(root, ".hunch", "pending-commit-repairs.json");
}

function isCommitRewrite(value: unknown): value is CommitRewrite {
  return !!value && typeof value === "object"
    && typeof (value as CommitRewrite).id === "string"
    && typeof (value as CommitRewrite).from === "string"
    && typeof (value as CommitRewrite).to === "string";
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
