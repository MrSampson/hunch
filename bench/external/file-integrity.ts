import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface FileSnapshot { path: string; sha256: string | null }

function fileHash(path: string): string | null {
  return existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex")
    : null;
}

export function snapshotFiles(paths: string[], dir: string): FileSnapshot[] {
  return paths.map((path) => ({ path, sha256: fileHash(join(dir, path)) }));
}

export function snapshotsEqual(expected: FileSnapshot[], dir: string): boolean {
  return expected.every(({ path, sha256 }) => fileHash(join(dir, path)) === sha256);
}

/** Future-test integrity is enforceable only when those exact future bytes were
 * exposed to the agent. In issue-only mode the checkout contains ordinary
 * pre-fix tests, and editing them is legitimate implementation work. Probe
 * artifacts are always benchmark-owned and therefore always immutable. */
export function benchmarkIntegrityPass(
  noRepro: boolean,
  testUntouched: boolean,
  probeUntouched: boolean,
): boolean {
  return (noRepro || testUntouched) && probeUntouched;
}
