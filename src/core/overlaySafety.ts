import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { ENTITY_KINDS } from "./types.js";

function pathIsWithin(path: string, parent: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Validate the materialized overlay without following links. Git's metadata is
 * deliberately skipped, but its own directory must still be contained under the
 * canonical overlay root. Every remotely controlled entry must be an ordinary
 * file or real directory whose canonical path stays inside that root. */
export function safeOverlayTree(root: string): boolean {
  try {
    const lexicalRoot = resolve(root);
    const rootStat = lstatSync(lexicalRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      console.error(`hunch: [diag] safeOverlayTree: root ${lexicalRoot} is symlink=${rootStat.isSymbolicLink()} dir=${rootStat.isDirectory()}`);
      return false;
    }
    const canonicalRoot = realpathSync(lexicalRoot);

    const walk = (dir: string, topLevel = false): boolean => {
      const dirStat = lstatSync(dir);
      if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
        console.error(`hunch: [diag] safeOverlayTree: dir ${dir} is symlink=${dirStat.isSymbolicLink()} dir=${dirStat.isDirectory()}`);
        return false;
      }
      if (!pathIsWithin(realpathSync(dir), canonicalRoot)) {
        console.error(`hunch: [diag] safeOverlayTree: dir ${dir} escapes root ${canonicalRoot}`);
        return false;
      }

      for (const name of readdirSync(dir)) {
        const entry = join(dir, name);
        let stat, real;
        try {
          stat = lstatSync(entry);
          real = realpathSync(entry);
        } catch (error) {
          // A concurrent writer's own atomic temp-file+rename (con_902759b3dc) can make an
          // entry this readdir just listed vanish (ENOENT) before lstat/realpath sees it --
          // e.g. a sibling clone's in-flight JSON write. On Windows the same contention can
          // surface as EPERM/EBUSY/EACCES instead: renameSync there can't replace a file
          // another process holds open, even for read (io.ts's isRenameContention, the same
          // class). Either way this is a trusted sibling's own atomic write in progress, not
          // an unsafe tree; only a genuinely unexpected error refuses.
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ENOENT" || code === "EPERM" || code === "EBUSY" || code === "EACCES") continue;
          throw error;
        }
        if (stat.isSymbolicLink()) {
          console.error(`hunch: [diag] safeOverlayTree: symlink at ${entry}`);
          return false;
        }
        if (!pathIsWithin(real, canonicalRoot)) {
          console.error(`hunch: [diag] safeOverlayTree: ${entry} escapes root ${canonicalRoot} (real=${real})`);
          return false;
        }
        if (topLevel && (name === ".gitignore" || name === ".gitattributes")
          && (!stat.isFile() || stat.nlink !== 1)) {
          console.error(`hunch: [diag] safeOverlayTree: ${entry} isFile=${stat.isFile()} nlink=${stat.nlink}`);
          return false;
        }
        if (topLevel && name === ".hunch" && !stat.isDirectory()) {
          console.error(`hunch: [diag] safeOverlayTree: .hunch at ${entry} is not a directory`);
          return false;
        }
        if (topLevel && name === ".git") {
          if (!stat.isDirectory()) {
            console.error(`hunch: [diag] safeOverlayTree: .git at ${entry} is not a directory`);
            return false;
          }
          continue;
        }
        if (stat.isDirectory()) {
          if (!walk(entry)) return false;
        } else if (!stat.isFile()) {
          console.error(`hunch: [diag] safeOverlayTree: non-regular file at ${entry}`);
          return false;
        }
      }
      return true;
    };

    if (!walk(lexicalRoot, true)) return false;
    const hunchDir = join(lexicalRoot, ".hunch");
    if (existsSync(hunchDir)) {
      for (const kind of ENTITY_KINDS) {
        const kindDir = join(hunchDir, kind);
        if (existsSync(kindDir) && !lstatSync(kindDir).isDirectory()) {
          console.error(`hunch: [diag] safeOverlayTree: kind dir ${kindDir} is not a directory`);
          return false;
        }
      }
      for (const name of ["manifest.json", "config.json"]) {
        const file = join(hunchDir, name);
        if (existsSync(file) && !lstatSync(file).isFile()) {
          console.error(`hunch: [diag] safeOverlayTree: ${file} is not a file`);
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    console.error(`hunch: [diag] safeOverlayTree: threw ${(error as Error)?.stack ?? error}`);
    return false;
  }
}

/** Validate `git ls-tree -r -t -z <exact-oid>` output before checkout. A Git
 * remote can encode symlinks (120000) and gitlinks (160000); accepting only
 * ordinary blobs and trees makes the fetched object graph safe to materialize.
 * The explicit Hunch topology rules keep canonical record directories and
 * capability/config paths from changing shape on a later pull. */
export function safeOverlayGitTreeListing(listing: string): boolean {
  const entries = new Map<string, "blob" | "tree">();
  for (const row of listing.split("\0")) {
    if (!row) continue;
    const tab = row.indexOf("\t");
    if (tab <= 0) return false;
    const header = row.slice(0, tab).match(/^([0-7]{6}) (blob|tree|commit) ([0-9a-f]+)$/);
    if (!header) return false;
    const path = row.slice(tab + 1);
    const segments = path.split("/");
    if (!path || path.startsWith("/") || path.includes("\\")
      || segments.some((segment) => !segment || segment === "." || segment === ".."
        || segment.toLowerCase() === ".git" || segment === ".hunch-commit.lock")) {
      return false;
    }
    // These are clone-local/derived runtime artifacts, never graph source of
    // truth. Accepting a tracked pointer can disclose or redirect a machine's
    // private store; tracked SQLite/temp/cache artifacts poison the clean-tree
    // and additive-publication contracts on every later request.
    if (path === ".hunch/local.json"
      || path === ".hunch-cache" || path.startsWith(".hunch-cache/")
      || /^\.hunch\/[^/]+\.sqlite[^/]*$/i.test(path)
      || (path.startsWith(".hunch/") && segments.slice(1).some((segment) => segment.includes(".tmp")))) {
      return false;
    }

    const mode = header[1]!;
    const type = header[2]!;
    const ordinaryTree = mode === "040000" && type === "tree";
    const ordinaryBlob = (mode === "100644" || mode === "100755") && type === "blob";
    if (!ordinaryTree && !ordinaryBlob) return false;
    if (entries.has(path)) return false;
    entries.set(path, type as "blob" | "tree");
  }

  const isTree = (path: string): boolean => !entries.has(path) || entries.get(path) === "tree";
  const isBlob = (path: string): boolean => !entries.has(path) || entries.get(path) === "blob";
  if (!isTree(".hunch")) return false;
  for (const kind of ENTITY_KINDS) if (!isTree(`.hunch/${kind}`)) return false;
  for (const path of [".gitattributes", ".gitignore", ".hunch/manifest.json", ".hunch/config.json"]) {
    if (!isBlob(path)) return false;
  }
  return true;
}

/** A dedicated Hunch overlay needs exactly one attribute capability: selecting
 * the locally installed `merge=hunch` JSON merge driver, plus Hunch's exact
 * `.hunch/manifest.json merge=text` override (the manifest has no record id and
 * must use Git's built-in text merge), and the five exact generated-doc rules
 * installed with the grounding merge driver. Reject every other token/pattern pair,
 * including byte-transforming built-ins such as `ident` and
 * `working-tree-encoding`, rather than maintaining a command-key blacklist.
 * Blank lines and comments remain harmless. */
export function hunchAttributesAreSafe(content: string): boolean {
  for (const line of content.split(/\r?\n/)) {
    const candidate = line.trimStart();
    if (!candidate || candidate.startsWith("#")) continue;
    const fields = candidate.split(/\s+/);
    if (fields.length < 2) return false;
    const attributes = fields.slice(1);
    if (attributes.every((attribute) => attribute === "merge=hunch")) continue;
    // These exact document paths are the only grounding-driver routes installed
    // by Hunch. Never accept a wildcard or allow it to target JSON memory.
    if (["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md", ".cursor/rules/hunch.mdc", ".windsurf/rules/hunch.md"].includes(fields[0]!)
      && attributes.every((attribute) => attribute === "merge=hunch-grounding")) continue;
    if (fields[0] === ".hunch/manifest.json"
      && attributes.every((attribute) => attribute === "merge=text")) continue;
    return false;
  }
  return true;
}

/** Validate every committed .gitattributes blob in an already-safe ls-tree
 * listing. Blob loading is injected so clone and later-pull seams share one
 * parser without either trusting worktree bytes before materialization. */
export function hunchTreeAttributesAreSafe(
  listing: string,
  readBlob: (oid: string) => string | null,
): boolean {
  if (!safeOverlayGitTreeListing(listing)) return false;
  for (const row of listing.split("\0")) {
    if (!row) continue;
    const tab = row.indexOf("\t");
    if (tab < 1) return false;
    const header = row.slice(0, tab).match(/^100(?:644|755) blob ([0-9a-f]{40,64})$/i);
    const path = row.slice(tab + 1);
    if (path !== ".gitattributes" && !path.endsWith("/.gitattributes")) continue;
    if (!header) return false;
    const content = readBlob(header[1]!);
    if (content === null || !hunchAttributesAreSafe(content)) return false;
  }
  return true;
}
