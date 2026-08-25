/** Calibration-only replay over the already-opened v1 owner-transfer corpus. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  inferIssueImplementationOwner,
  rankIssueImplementationOwners,
  type ContractAxisOwnerSource,
} from "../../src/core/pipeline.js";

interface Task { id: string; issueTitle: string; issueBody: string }
interface V1Row { id: string; pre_fix_sha: string; ground_truth: { paths: string[]; symbols: string[] }; discovery_case: boolean }

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};
const root = resolve(import.meta.dirname, "../..");
const zod = resolve(flag("zod", join(root, "../zod-bench")));
const v1Path = resolve(flag("v1", join(import.meta.dirname, "results/2026-08-25-zod-owner-transfer-v1.json")));
const tasksPath = resolve(flag("tasks", join(import.meta.dirname, "zod-tasks.json")));
const out = resolve(flag("out", join(import.meta.dirname, "results/2026-08-25-zod-implementation-ranker-calibration.json")));

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  const dir = mkdtempSync(join(tmpdir(), "hunch-zod-implementation-"));
  try {
    const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "packages/zod/src/v4"], { maxBuffer: 256 * 1024 * 1024 });
    const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
    if (extraction.status !== 0) throw new Error(String(extraction.stderr));
    return walk(join(dir, "packages/zod/src/v4"))
      .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
      .map((path) => ({ path: path.slice(dir.length + 1), content: readFileSync(path, "utf8") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tasks = new Map((JSON.parse(readFileSync(tasksPath, "utf8")) as { tasks: Task[] }).tasks.map((task) => [task.id, task]));
const v1 = JSON.parse(readFileSync(v1Path, "utf8")) as { rows: V1Row[] };
const rows = v1.rows.map((prior, index) => {
  const task = tasks.get(prior.id)!;
  const issue = `${task.issueTitle}\n${task.issueBody}`;
  const sources = sourcesAt(prior.pre_fix_sha);
  const ranking = rankIssueImplementationOwners(issue, sources);
  const inference = inferIssueImplementationOwner(issue, sources);
  const top1 = ranking?.candidates[0]?.owner ?? null;
  const top5 = ranking?.candidates.slice(0, 5).map((candidate) => candidate.owner) ?? [];
  const result = {
    id: prior.id,
    inference,
    top1,
    top1_correct: Boolean(top1 && prior.ground_truth.symbols.includes(top1)),
    inferred_correct: Boolean(inference && prior.ground_truth.symbols.includes(inference.owner)),
    top5_hit: top5.some((owner) => prior.ground_truth.symbols.includes(owner)),
    top5,
    ground_truth: prior.ground_truth,
    discovery_case: prior.discovery_case,
  };
  process.stderr.write(`[${index + 1}/${v1.rows.length}] ${prior.id}: ${top1 ?? "none"}\n`);
  return result;
});
const inferred = rows.filter((row) => row.inference);
const discoveryInferred = inferred.filter((row) => row.discovery_case);
const summary = {
  tasks: rows.length,
  top1_correct: rows.filter((row) => row.top1_correct).length,
  top5_hits: rows.filter((row) => row.top5_hit).length,
  inferred: inferred.length,
  inferred_correct: inferred.filter((row) => row.inferred_correct).length,
  discovery_inferred: discoveryInferred.length,
  discovery_inferred_correct: discoveryInferred.filter((row) => row.inferred_correct).length,
};
writeFileSync(out, `${JSON.stringify({ calibration_only: true, summary, rows }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ out, summary }, null, 2)}\n`);
