import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constraintId } from "../src/core/ids.js";
import { hunchPaths, hunchPathsForDir } from "../src/core/paths.js";
import { HunchStore } from "../src/store/hunchStore.js";
import { JsonStore } from "../src/store/jsonStore.js";
import { updateClaudeMd } from "../src/integrations/claudemd.js";
import { parseMemoryLog } from "../src/core/memorylog.js";
import { mkConstraint } from "./helpers.js";

const tsx = join(process.cwd(), "node_modules/tsx/dist/cli.mjs");
const cli = join(process.cwd(), "src/cli/index.ts");

function setupRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "hunch-retire-constraint-cli-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test Human"]);
  execFileSync("git", ["-C", root, "config", "commit.gpgsign", "false"]);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/auth.ts"), "export const auth = true;\n");
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture: baseline"]);
  return root;
}

/** Scaffold a real CLAUDE.md with the managed Hunch block, so retire-constraint's
 *  grounding refresh (refreshExistingGrounding) has an existing file to rewrite --
 *  it's refresh-only and never creates one. Committed as its own fixture commit. */
function scaffoldClaudeMd(root: string): void {
  const store = new HunchStore(hunchPaths(root));
  store.json.ensureDirs();
  updateClaudeMd(root, store);
  store.close();
  execFileSync("git", ["-C", root, "add", "-A"]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture: scaffold CLAUDE.md"]);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [tsx, cli, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, HUNCH_PRIVATE_DIR: "", HUNCH_SYNTH_PROVIDER: "deterministic", NO_COLOR: "1" },
  });
}

test("retire-constraint sets status retired + valid_to and commits the change", () => {
  const root = setupRoot();
  try {
    const statement = "never import axios in the public API";
    const id = constraintId(statement);
    const recorded = run(root, "record-constraint", statement, "--scope", "src/**", "--forbid-dep", "axios");
    assert.equal(recorded.status, 0, recorded.stderr);

    const headBefore = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();

    const retired = run(root, "retire-constraint", id, "--reason", "superseded by a stricter rule");
    assert.equal(retired.status, 0, retired.stderr);
    assert.match(retired.stdout, new RegExp(id));
    assert.match(retired.stdout, /retired/i);

    const saved = JSON.parse(readFileSync(join(root, ".hunch/constraints", `${id}.json`), "utf8"));
    assert.equal(saved.status, "retired");
    assert.ok(saved.valid_to, "valid_to must be set to an ISO instant");
    assert.ok(!Number.isNaN(Date.parse(saved.valid_to)), "valid_to must be a valid ISO instant");

    const headAfter = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.notEqual(headAfter, headBefore, "retiring a constraint auto-commits the change");

    const status = execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--", ".hunch/constraints"], { encoding: "utf8" }).trim();
    assert.equal(status, "", "the constraint file is committed, not left dirty");

    // --reason must land in the commit BODY, never the subject: hunch log's classify()
    // regexes the subject for keywords like "supersed"/"repair"/"adopt", and this
    // reason string ("superseded by a stricter rule") contains exactly such a keyword.
    // A subject-line leak would misclassify this retirement as a decision supersession.
    const subject = execFileSync("git", ["-C", root, "log", "-1", "--pretty=%s"], { encoding: "utf8" }).trim();
    const body = execFileSync("git", ["-C", root, "log", "-1", "--pretty=%b"], { encoding: "utf8" }).trim();
    assert.equal(subject, `hunch: retire constraint ${id}`, "commit subject stays deterministic");
    assert.doesNotMatch(subject, /supersed/i, "the reason's keyword must never reach the subject");
    assert.match(body, /superseded by a stricter rule/, "the reason is recorded in the commit body");

    const rawLog = execFileSync("git", ["-C", root, "log", "--format=@@@%H\t%h\t%cI\t%s", "--name-status", "--", ".hunch/"], { encoding: "utf8" });
    const moves = parseMemoryLog(rawLog);
    assert.equal(moves[0]!.kind, "retire", "hunch log classifies the move as retire, not supersede");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retire-constraint removes the constraint from CLAUDE.md's Top invariants (this PR's headline claim)", () => {
  const root = setupRoot();
  try {
    scaffoldClaudeMd(root);

    const statement = "never import axios in the top-invariants fixture";
    const id = constraintId(statement);
    const recorded = run(root, "record-constraint", statement, "--scope", "src/**", "--severity", "blocking", "--forbid-dep", "axios");
    assert.equal(recorded.status, 0, recorded.stderr);

    const beforeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.match(beforeMd, /Top invariants/);
    assert.match(beforeMd, new RegExp(escapeRe(statement)), "the active constraint appears in Top invariants");

    const retired = run(root, "retire-constraint", id);
    assert.equal(retired.status, 0, retired.stderr);

    const afterMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.doesNotMatch(afterMd, new RegExp(escapeRe(statement)), "a retired constraint must no longer appear in Top invariants");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retire-constraint refreshes CLAUDE.md's Top invariants even with auto-commit off (bug #1: grounding was only rewritten as part of a commit)", () => {
  const root = setupRoot();
  try {
    scaffoldClaudeMd(root);

    const statement = "never import lodash in the no-auto-commit fixture";
    const id = constraintId(statement);
    const recorded = run(root, "record-constraint", statement, "--scope", "src/**", "--severity", "blocking", "--forbid-dep", "lodash");
    assert.equal(recorded.status, 0, recorded.stderr);

    const beforeMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.match(beforeMd, new RegExp(escapeRe(statement)), "the active constraint appears in Top invariants");

    // Flip auto-commit off AFTER recording, so only the retire step below exercises
    // the no-commit path -- isolating exactly where bug #1 lived.
    mkdirSync(join(root, ".hunch"), { recursive: true });
    writeFileSync(join(root, ".hunch/local.json"), JSON.stringify({ autoCommit: false }));

    const headBefore = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const retired = run(root, "retire-constraint", id);
    assert.equal(retired.status, 0, retired.stderr);

    const headAfter = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(headAfter, headBefore, "auto-commit is off; retiring must not create a commit");

    const afterMd = readFileSync(join(root, "CLAUDE.md"), "utf8");
    assert.doesNotMatch(afterMd, new RegExp(escapeRe(statement)), "grounding must refresh on disk even without a commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retire-constraint warns that --reason is not recorded anywhere when auto-commit is off", () => {
  const root = setupRoot();
  try {
    const statement = "never import moment in the reason-discard fixture";
    const id = constraintId(statement);
    assert.equal(run(root, "record-constraint", statement, "--scope", "src/**", "--forbid-dep", "moment").status, 0);

    mkdirSync(join(root, ".hunch"), { recursive: true });
    writeFileSync(join(root, ".hunch/local.json"), JSON.stringify({ autoCommit: false }));

    const headBefore = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const retired = run(root, "retire-constraint", id, "--reason", "no longer relevant");
    assert.equal(retired.status, 0, retired.stderr);
    assert.match(retired.stdout, /reason.*not.*recorded/i, "the CLI must disclose that the reason evaporates");

    const headAfter = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(headAfter, headBefore, "no commit exists to hold the reason");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retire-constraint refuses a nonexistent id", () => {
  const root = setupRoot();
  try {
    const result = run(root, "retire-constraint", "con_doesnotexist");
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /not found/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retire-constraint tells a confused user their constraint is private-overlay-only, not simply missing", () => {
  const root = setupRoot();
  const overlayRoot = mkdtempSync(join(tmpdir(), "hunch-retire-constraint-overlay-"));
  const privateHunch = join(overlayRoot, ".hunch");
  try {
    execFileSync("git", ["init", "-q", overlayRoot]);
    const privateJson = new JsonStore(hunchPathsForDir(privateHunch));
    privateJson.ensureDirs();
    const id = "con_private0001";
    privateJson.put("constraints", mkConstraint({ id, statement: "PRIVATE_ONLY_INVARIANT_MUST_NOT_RETIRE_PUBLICLY" }));

    const result = spawnSync(process.execPath, [tsx, cli, "retire-constraint", id], {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, HUNCH_PRIVATE_DIR: privateHunch, HUNCH_SYNTH_PROVIDER: "deterministic", NO_COLOR: "1" },
    });
    assert.notEqual(result.status, 0);
    const output = `${result.stdout}${result.stderr}`;
    assert.match(output, /exists only in the private overlay/i, "must distinguish this from a plain not-found");
    assert.match(output, /retire-constraint only handles public constraints/i);

    // The private record itself must be untouched -- this command never writes to the overlay.
    const untouched = privateJson.get("constraints", id);
    assert.equal(untouched?.status, "active");
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(overlayRoot, { recursive: true, force: true });
  }
});

test("retire-constraint refuses to retire an already-retired constraint (idempotent-refuse, not a silent no-op)", () => {
  const root = setupRoot();
  try {
    const statement = "never import lodash in the public API";
    const id = constraintId(statement);
    assert.equal(run(root, "record-constraint", statement, "--scope", "src/**", "--forbid-dep", "lodash").status, 0);
    assert.equal(run(root, "retire-constraint", id).status, 0);

    const headBefore = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const second = run(root, "retire-constraint", id);
    assert.notEqual(second.status, 0);
    assert.match(`${second.stdout}${second.stderr}`, /already retired/i);

    const headAfter = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    assert.equal(headAfter, headBefore, "a refused retire must not create a second commit");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
