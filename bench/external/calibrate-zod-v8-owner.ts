/** Inspect evidence-conditioned ranking for an already-opened Zod task. */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { collectV8OwnerEvidence, conditionOwnersOnV8Evidence } from "./v8-owner-evidence.js";

interface Task { id: string; fixSha: string; issueTitle: string; issueBody: string }
const argv = process.argv.slice(2);
const flag = (name: string): string => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0 || !argv[index + 1]) throw new Error(`missing --${name}`);
  return argv[index + 1]!;
};
const taskId = flag("task");
const coveragePaths = flag("coverage").split(",");
const zod = resolve(flag("zod"));
const tasks = (JSON.parse(readFileSync(join(import.meta.dirname, "zod-tasks.json"), "utf8")) as { tasks: Task[] }).tasks;
const task = tasks.find((candidate) => candidate.id === taskId);
if (!task) throw new Error(`unknown task ${taskId}`);
const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const preFix = git(["rev-parse", `${task.fixSha}^1`]).trim();
const dir = mkdtempSync(join(tmpdir(), "hunch-zod-v8-owner-"));
try {
  const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", preFix, "packages/zod/src/v4"], { maxBuffer: 256 * 1024 * 1024 });
  const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
  if (extraction.status !== 0) throw new Error(String(extraction.stderr));
  const walk = (path: string): string[] => readdirSync(path).flatMap((name) => {
    const child = join(path, name);
    return statSync(child).isDirectory() ? walk(child) : [child];
  });
  const sources = walk(join(dir, "packages/zod/src/v4"))
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path: path.slice(dir.length + 1), content: readFileSync(path, "utf8") }));
  const coverage = coveragePaths.map((path) => JSON.parse(readFileSync(path, "utf8")) as unknown);
  const conditioned = conditionOwnersOnV8Evidence(`${task.issueTitle}\n${task.issueBody}`, sources, coverage);
  const paths = git(["diff", "--name-only", preFix, task.fixSha, "--", "packages/zod/src"])
    .split("\n").filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"));
  const truth = new Set<string>();
  for (const path of paths) {
    const diff = git(["diff", "--unified=0", preFix, task.fixSha, "--", path]);
    const changed = changedLineNumbers(diff);
    for (const [sha, lines] of [[task.fixSha, changed.after], [preFix, changed.before]] as const) {
      const shown = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8" });
      if (shown.status !== 0) continue;
      for (const span of declarationOwners(path, shown.stdout)) {
        if ([...lines].some((line) => line >= span.startLine && line <= span.endLine)) truth.add(span.owner);
      }
    }
  }
  const observed = coverage.flatMap(collectV8OwnerEvidence);
  process.stdout.write(`${JSON.stringify({
    task: task.id,
    top: conditioned.slice(0, 10),
    top_correct: Boolean(conditioned[0] && truth.has(conditioned[0].owner)),
    truth: [...truth].sort(),
    observed_owner_count: new Set(observed.map((item) => item.owner)).size,
  }, null, 2)}\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
