import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { constraintId } from "../src/core/ids.js";

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
