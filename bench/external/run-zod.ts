/**
 * Time-split benchmark on zod (external repo, cold graph): the .hunch graph was
 * backfilled ONLY from commits before the cutoff; every task is a real
 * post-cutoff issue whose merged fix supplies the regression tests. Leakage is
 * impossible by construction — the memory predates the bugs.
 *
 *   arm A — bare model in a pristine zod checkout at the pre-fix commit
 *   arm C — same checkout + the cutoff .hunch graph + hunch MCP + CLAUDE.md block
 *
 * Score: the fix's own test files (applied from the real fix commit) pass, and
 * the agent didn't touch them.
 *
 *   npx tsx bench/external/run-zod.ts --dry-fix zod-5868     # plumbing, no model
 *   npx tsx bench/external/run-zod.ts --arms A,C --model claude-sonnet-5
 */
import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync, cpSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const ZOD = "c:/Users/davids/github/zod-bench";
const OUT_DIR = join(import.meta.dirname, "results");

const argv = process.argv.slice(2);
const flag = (name: string, dflt: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : dflt;
};
const MODEL = flag("model", "claude-sonnet-5");
// A = bare, C = +cold hunch graph, S = +fable-mode skill (no graph)
const ARMS = flag("arms", "A,C").split(",") as Array<"A" | "C" | "S">;
// --no-repro: the agent gets ONLY the issue text — no failing test handed over.
// The real regression tests are applied at SCORING time. This is diagnosis mode.
const NO_REPRO = argv.includes("--no-repro");
// --force-skill: S arm's prompt names the skill explicitly — separates
// "content doesn't help" from "model never reads it" (measured: 20/20 S
// sessions never invoked fable-mode unprompted).
const FORCE_SKILL = argv.includes("--force-skill");
const HUNCH_REPO = "c:/Users/davids/github/hunch";
const MAX_TURNS = Number(flag("max-turns", "50"));
const DRY_FIX = flag("dry-fix", "");
const ONLY = flag("only", "");

// Bug-shaped subset (features/locales excluded); diverse areas of the library.
const DEFAULT_TASKS = ["zod-5842", "zod-5944", "zod-5937", "zod-5826", "zod-5868", "zod-5792", "zod-5296", "zod-5714"];

interface Task {
  id: string; pr: number; fixSha: string; mergedAt: string;
  issueTitle: string; issueBody: string; testFiles: string[]; srcFiles: string[];
}
const ALL: Task[] = (JSON.parse(readFileSync(join(import.meta.dirname, "zod-tasks.json"), "utf8")) as { tasks: Task[] }).tasks;
const TASKS = ALL.filter((t) => (ONLY || DRY_FIX ? t.id === (ONLY || DRY_FIX) : DEFAULT_TASKS.includes(t.id)));

const sh = (cmd: string, cwd = ZOD): string => execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function makeWorktree(name: string, arm: "A" | "C" | "S", task: Task): string {
  const dir = join(tmpdir(), "zod-bench", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(tmpdir(), "zod-bench"), { recursive: true });
  sh(`git worktree add --detach "${dir}" ${task.fixSha}~1`); // the commit the bug lived at
  // real install, not junctions: vite/vitest realpath-resolve configs through a
  // junction back into the main clone; pnpm's shared store keeps this ~15s
  execSync("corepack pnpm install --frozen-lockfile --prefer-offline", { cwd: dir, stdio: "ignore", timeout: 10 * 60 * 1000 });
  // the real fix's regression tests, applied on top of the buggy tree —
  // unless diagnosis mode, where they stay hidden until scoring
  if (!NO_REPRO) sh(`git checkout ${task.fixSha} -- ${task.testFiles.map((f) => `"${f}"`).join(" ")}`, dir);

  if (arm === "S") {
    cpSync(join(HUNCH_REPO, ".claude", "skills", "fable-mode"), join(dir, ".claude", "skills", "fable-mode"), { recursive: true });
  }
  if (arm === "C") {
    cpSync(join(ZOD, ".hunch"), join(dir, ".hunch"), { recursive: true });
    if (existsSync(join(ZOD, "CLAUDE.md"))) cpSync(join(ZOD, "CLAUDE.md"), join(dir, "CLAUDE.md"));
    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { hunch: { command: "npx", args: ["-y", "@davesheffer/hunch@latest", "mcp"] } } }, null, 2));
  }
  return dir;
}

function dropWorktree(dir: string): void {
  try { sh(`git worktree remove --force "${dir}"`); } catch { /* git worktree prune later */ }
  rmSync(dir, { recursive: true, force: true }); // node_modules is real here, not a junction
}

function runTests(task: Task, dir: string): boolean {
  // repo-relative paths from the worktree ROOT: zod's vitest workspace globs
  // ("packages/*") resolve against cwd, so a package-dir run finds no projects
  try {
    execSync(`npx vitest run ${task.testFiles.map((f) => `"${f}"`).join(" ")}`, { cwd: dir, stdio: "ignore", timeout: 10 * 60 * 1000 });
    return true;
  } catch { return false; }
}

function scoreFix(task: Task, dir: string): { pass: boolean; testsPass: boolean; testUntouched: boolean } {
  // diagnosis mode: the ground-truth tests land only now, over the agent's fix
  if (NO_REPRO) sh(`git checkout ${task.fixSha} -- ${task.testFiles.map((f) => `"${f}"`).join(" ")}`, dir);
  const testsPass = runTests(task, dir);
  const changed = sh("git diff --name-only", dir).split("\n").map((s) => s.trim());
  const testUntouched = !task.testFiles.some((f) => changed.includes(f));
  return { pass: testsPass && testUntouched, testsPass, testUntouched };
}

function prompt(task: Task): string {
  const repro = NO_REPRO
    ? `No reproduction is provided — diagnose from the report alone. Write your own repro if it helps (grading runs the project's own test suite afterwards).`
    : `Failing regression tests already exist — reproduce from the repo root with:  npx vitest run ${task.testFiles.join(" ")}`;
  return [
    ...(FORCE_SKILL ? [`First invoke the fable-mode skill (Skill tool) and follow its protocol strictly throughout this task.`, ``] : []),
    `A user filed this bug against zod (the library in packages/zod). Diagnose the root cause and fix it in the SOURCE code.`,
    repro,
    `Do NOT modify existing test files. Fix the root cause, not the symptom.`,
    ``,
    `## Issue: ${task.issueTitle}`,
    ``,
    task.issueBody,
  ].join("\n");
}

function runClaude(dir: string, p: string): { result: string; numTurns: number; sessionId: string | null; durationMs: number } {
  const t0 = Date.now();
  const mcp = existsSync(join(dir, ".mcp.json")) ? ` --mcp-config .mcp.json` : "";
  const cmd = `claude -p --model ${MODEL} --output-format json --permission-mode bypassPermissions --max-turns ${MAX_TURNS} --setting-sources project${mcp} --strict-mcp-config`;
  let out = "";
  try {
    out = execSync(cmd, { cwd: dir, input: p, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 45 * 60 * 1000 });
  } catch (e) { out = String((e as { stdout?: string }).stdout ?? ""); }
  let parsed: { result?: string; session_id?: string; num_turns?: number } = {};
  try { parsed = JSON.parse(out); } catch { parsed = { result: out }; }
  return { result: parsed.result ?? "", numTurns: parsed.num_turns ?? -1, sessionId: parsed.session_id ?? null, durationMs: Date.now() - t0 };
}

function hunchCallCount(sessionId: string | null): number {
  if (!sessionId) return 0;
  const projects = join(homedir(), ".claude", "projects");
  try {
    for (const d of readdirSync(projects)) {
      const p = join(projects, d, `${sessionId}.jsonl`);
      if (!existsSync(p)) continue;
      let n = 0;
      for (const line of readFileSync(p, "utf8").split("\n")) {
        if (line.includes('"tool_use"') && line.includes("mcp__hunch")) n++;
      }
      return n;
    }
  } catch { /* transcript unavailable */ }
  return 0;
}

// ------------------------------------------------------------------- main
if (DRY_FIX) {
  const task = TASKS[0];
  if (!task) throw new Error(`--dry-fix: unknown task "${DRY_FIX}"`);
  const dir = makeWorktree(`dry-${task.id}`, "A", task);
  const before = runTests(task, dir);
  console.log(`${task.id}: applied regression tests ${before ? "PASS pre-fix (BAD — no bite)" : "FAIL pre-fix (good)"}`);
  // sanity: the real fix makes them pass
  sh(`git checkout ${task.fixSha} -- ${task.srcFiles.map((f) => `"${f}"`).join(" ")}`, dir);
  const after = runTests(task, dir);
  console.log(`${task.id}: real fix applied → tests ${after ? "PASS (good — ground truth verified)" : "STILL FAIL (bad task, drop it)"}`);
  dropWorktree(dir);
  process.exit(before || !after ? 1 : 0);
}

console.log(`zod bench: model=${MODEL} arms=${ARMS.join(",")} tasks=${TASKS.map((t) => t.id).join(",")}`);
mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const rows: Array<Record<string, unknown>> = [];

for (const task of TASKS) {
  for (const arm of ARMS) {
    const name = `${task.id}-${arm}-${MODEL.replace(/[^a-z0-9]/gi, "")}`;
    process.stdout.write(`▶ ${name} … `);
    const dir = makeWorktree(name, arm, task);
    try {
      const run = runClaude(dir, prompt(task));
      const s = scoreFix(task, dir);
      const hunchCalls = hunchCallCount(run.sessionId);
      rows.push({
        task: task.id, arm, model: MODEL, score: s.pass ? "PASS" : `FAIL(tests=${s.testsPass},untouched=${s.testUntouched})`,
        scoreNum: s.pass ? 1 : 0, turns: run.numTurns, hunchCalls, durationMs: run.durationMs, answer: run.result.slice(0, 3000),
      });
      console.log(`${s.pass ? "PASS" : "FAIL"}  ${run.numTurns} turns, ${hunchCalls} hunch calls, ${(run.durationMs / 1000).toFixed(0)}s`);
    } finally { dropWorktree(dir); }
    writeFileSync(join(OUT_DIR, `${stamp}.json`), JSON.stringify({ model: MODEL, rows }, null, 2));
  }
}

console.log(`\n| task | ${ARMS.map((a) => `${a}`).join(" | ")} |`);
console.log(`|---${ARMS.map(() => "|---").join("")}|`);
for (const task of TASKS) {
  const cells = ARMS.map((arm) => {
    const r = rows.find((x) => x.task === task.id && x.arm === arm);
    return r ? `${r.score === "PASS" ? "✅" : "❌"} ${r.turns}t` : "-";
  });
  console.log(`| ${task.id} | ${cells.join(" | ")} |`);
}
console.log(`\nresults: bench/external/results/${stamp}.json`);
