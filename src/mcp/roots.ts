/**
 * MCP `roots` → the workspace the CLIENT is actually in.
 *
 * The server's own cwd is fixed when the client spawns it, so it cannot follow the
 * user into a git worktree opened mid-session: captures keep landing in the spawn
 * directory (normally the primary checkout, on the default branch) instead of on the
 * branch the work is on. The protocol's `roots` capability is the supported way to
 * learn where the client is working, so prefer an advertised root and fall back to
 * the spawn cwd when the client advertises none (unsupporting clients are unaffected).
 */
import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { findRoot, HUNCH_DIR } from "../core/paths.js";

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** `file://` URI or plain path → path, or "" when it is neither. */
function toPath(uriOrPath: string): string {
  if (!uriOrPath) return "";
  if (!uriOrPath.startsWith("file:")) return uriOrPath;
  try {
    return fileURLToPath(uriOrPath);
  } catch {
    return "";
  }
}

/**
 * The root a capture should be written to, given the roots the client advertised.
 *
 * Each advertised root is normalised through `findRoot`, so a subdirectory resolves to
 * its repo. Roots that do not exist are ignored rather than trusted. When several
 * usable roots are advertised, one that already carries a `.hunch` store wins — that is
 * the repo whose memory is being written; otherwise the first usable root is used.
 */
export function resolveActiveRoot(rootUris: readonly string[], fallbackCwd: string): string {
  const candidates: string[] = [];
  for (const uri of rootUris) {
    const p = toPath(uri);
    if (!p || !isDir(p)) continue;
    const r = findRoot(p);
    if (!candidates.includes(r)) candidates.push(r);
  }
  const withStore = candidates.find((c) => isDir(join(c, HUNCH_DIR)));
  if (withStore) return withStore;
  const [first] = candidates;
  return first ?? findRoot(fallbackCwd);
}
