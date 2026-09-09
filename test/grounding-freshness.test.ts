/**
 * The committed grounding docs must match what THIS repo's graph generates.
 *
 * The release gate's repository-index stage runs `hunch index`, which regenerates
 * CLAUDE.md / AGENTS.md / copilot-instructions / hunch.mdc / hunch.md. If the committed
 * copies are stale the tree goes dirty mid-gate and the release fails with
 * "source-integrity failure: repository-index: the working tree changed during release
 * verification" — a message that names neither the file nor the cause.
 *
 * That check only runs on a TAG PUSH, so a repo can be green on every ordinary CI run
 * right up to the irreversible step. It cost two red cycles on 2026-08-09 (fnd_6391b4242f):
 * once when the video/ kit created a Video component whose record was never committed,
 * once when premises.ts + new tests moved the counts.
 *
 * The capture path already self-heals via refreshCommittableGrounding + alsoStage — but
 * ONLY when the post-commit hook runs with auto-commit on. A commit made on another
 * machine, in CI, with --no-verify, or from a clone without hooks installed leaves the
 * docs stale with nothing to notice. This test is that "something", and it fails in
 * ordinary CI with an actionable message instead of at tag time.
 *
 * Deterministic across platforms: the managed block's content comes entirely from
 * .hunch/*.json — never from the symbol/edge counts, which legitimately differ between
 * Windows and Linux.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hunchPaths } from "../src/core/paths.js";
import { HunchStore } from "../src/store/hunchStore.js";
import { renderHunchSection } from "../src/integrations/claudemd.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const START = "<!-- HUNCH:START — auto-generated, do not edit by hand -->";
const END = "<!-- HUNCH:END -->";

/** The managed block's CONTENT, markers stripped. Applied to both sides:
 *  renderHunchSection() returns the section WITH its markers, so comparing its raw
 *  output against a marker-stripped extraction diffs at line 1 forever. */
function blockContent(text: string): string | null {
  const i = text.indexOf(START);
  const j = text.indexOf(END);
  if (i === -1 || j === -1 || j < i) return null;
  return text.slice(i + START.length, j).trim();
}

function committedBlock(file: string): string | null {
  return existsSync(file) ? blockContent(readFileSync(file, "utf8")) : null;
}

const GROUNDING_FILES = ["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md", ".cursor/rules/hunch.mdc", ".windsurf/rules/hunch.md"];

test("the committed grounding docs' blocks match what the graph generates", () => {
  // PUBLIC-ONLY, exactly as the gate runs it (gateEnvironment points repository-index at
  // an empty private home). HUNCH_PRIVATE_DIR takes precedence over .hunch/local.json AND
  // the shared pointer in .git/hunch/, so this is deterministic on a dev machine with an
  // overlay attached — where the union would otherwise render 274 decisions instead of the
  // public 164, and "fix" the mismatch by writing private counts into a public doc.
  const emptyPrivate = mkdtempSync(join(tmpdir(), "hunch-grounding-freshness-"));
  const prior = process.env.HUNCH_PRIVATE_DIR;
  process.env.HUNCH_PRIVATE_DIR = emptyPrivate;
  const store = new HunchStore(hunchPaths(repoRoot));
  try {
    const rendered = renderHunchSection(store, repoRoot);
    const generated = blockContent(rendered) ?? rendered.trim();
    for (const rel of GROUNDING_FILES) {
      const committed = committedBlock(join(repoRoot, rel));
      assert.ok(committed !== null, `${rel} carries a managed HUNCH block`);
      assert.equal(
        committed,
        generated,
        `${rel}'s grounding block is stale. Regenerate and commit it:\n`
        + "    HUNCH_PRIVATE_DIR=<empty-dir> npx tsx src/cli/index.ts index\n"
        + "then commit CLAUDE.md, AGENTS.md, .github/copilot-instructions.md, "
        + ".cursor/rules/hunch.mdc and .windsurf/rules/hunch.md.\n"
        + "Leaving it stale fails the release gate at TAG time with a message that names "
        + "neither the file nor the cause (fnd_6391b4242f).",
      );
    }
  } finally {
    store.close();
    process.env.HUNCH_PRIVATE_DIR = prior;
    if (prior === undefined) delete process.env.HUNCH_PRIVATE_DIR;
    rmSync(emptyPrivate, { recursive: true, force: true });
  }
});
