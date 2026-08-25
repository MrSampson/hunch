/** Time-forward holdout for declaration-level implementation-owner retrieval. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  inferIssueImplementationOwner,
  rankIssueImplementationOwners,
  type ContractAxisOwnerSource,
} from "../../src/core/pipeline.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";

interface Task { id: string; fixSha: string; issueTitle: string; issueBody: string }
interface Truth { paths: string[]; symbols: string[] }
const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : fallback;
};
const root = resolve(import.meta.dirname, "../..");
const zod = resolve(flag("zod", join(root, "../zod-bench")));
const tasksPath = resolve(flag("tasks", join(import.meta.dirname, "zod-owner-holdout-v2-tasks.json")));
const outBase = resolve(flag("out", join(import.meta.dirname, "results/2026-08-25-zod-implementation-holdout-v2")));

const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const gitFile = (sha: string, path: string): string | null => {
  const result = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
};
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  const dir = mkdtempSync(join(tmpdir(), "hunch-zod-holdout-"));
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
function ownersAt(path: string, content: string | null, lines: Set<number>): string[] {
  if (!content) return [];
  return declarationOwners(path, content)
    .filter((span) => [...lines].some((line) => line >= span.startLine && line <= span.endLine))
    .map((span) => span.owner);
}
function truthAfterPrediction(preFix: string, fixSha: string): Truth {
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha, "--", "packages/zod/src"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path));
  const symbols = new Set<string>();
  for (const path of paths) {
    const lines = changedLineNumbers(git(["diff", "--unified=0", "--no-ext-diff", preFix, fixSha, "--", path]));
    for (const owner of ownersAt(path, gitFile(fixSha, path), lines.after)) symbols.add(owner);
    for (const owner of ownersAt(path, gitFile(preFix, path), lines.before)) symbols.add(owner);
  }
  return { paths: [...new Set(paths)].sort(), symbols: [...symbols].sort() };
}
function disclosed(issue: string, truth: Truth): boolean {
  const lower = issue.toLowerCase();
  if (truth.symbols.some((owner) => {
    const symbol = owner.split("::")[1]!;
    return symbol.length >= 4 && lower.includes(symbol.toLowerCase().replace(/^\$+/, ""));
  })) return true;
  return truth.paths.some((path) => lower.includes(path.toLowerCase())
    || lower.includes(path.replace(/^packages\/zod\//, "").toLowerCase())
    || lower.includes(basename(path).toLowerCase()));
}
const tasks = (JSON.parse(readFileSync(tasksPath, "utf8")) as { tasks: Task[] }).tasks;
const evaluatorHash = createHash("sha256").update(readFileSync(new URL(import.meta.url), "utf8")).digest("hex");
if (argv.includes("--manifest")) {
  process.stdout.write(`${JSON.stringify({
    benchmark: "zod-implementation-holdout-v2",
    evaluator_hash: evaluatorHash,
    pipeline_hash: createHash("sha256").update(readFileSync(join(root, "src/core/pipeline.ts"), "utf8")).digest("hex"),
    tasks_hash: createHash("sha256").update(readFileSync(tasksPath, "utf8")).digest("hex"),
    tasks: tasks.map((task) => ({
      id: task.id,
      input_hash: createHash("sha256").update(JSON.stringify({ id: task.id, issueTitle: task.issueTitle, issueBody: task.issueBody })).digest("hex"),
    })),
  }, null, 2)}\n`);
  process.exit(0);
}
const rows = tasks.map((task, index) => {
  const preFix = git(["rev-parse", `${task.fixSha}^1`]).trim();
  const issue = `${task.issueTitle}\n${task.issueBody}`;
  const sources = sourcesAt(preFix);
  const ranking = rankIssueImplementationOwners(issue, sources);
  const inference = inferIssueImplementationOwner(issue, sources);
  const top5 = ranking?.candidates.slice(0, 5) ?? [];
  // No future object is read before ranking and inference have completed.
  const truth = truthAfterPrediction(preFix, task.fixSha);
  const ownerDisclosed = disclosed(issue, truth);
  const predictedPath = inference?.owner.split("::")[0] ?? null;
  const row = {
    id: task.id,
    input_hash: createHash("sha256").update(JSON.stringify({ id: task.id, issueTitle: task.issueTitle, issueBody: task.issueBody })).digest("hex"),
    pre_fix_sha: preFix,
    fix_sha: task.fixSha,
    inference,
    top5,
    truth,
    symbol_correct: Boolean(inference && truth.symbols.includes(inference.owner)),
    file_correct: Boolean(predictedPath && truth.paths.includes(predictedPath)),
    top1_correct: Boolean(top5[0] && truth.symbols.includes(top5[0].owner)),
    top5_hit: top5.some((candidate) => truth.symbols.includes(candidate.owner)),
    disclosed: ownerDisclosed,
    discovery: !ownerDisclosed,
  };
  process.stderr.write(`[${index + 1}/${tasks.length}] ${task.id}: ${inference?.owner ?? "abstain"}\n`);
  return row;
});
const scorable = rows.filter((row) => row.truth.symbols.length);
const inferred = rows.filter((row) => row.inference);
const discovery = rows.filter((row) => row.discovery);
const discoveryInferred = discovery.filter((row) => row.inference);
const ratio = (a: number, b: number): number | null => b ? a / b : null;
const summary = {
  tasks: rows.length,
  scorable: scorable.length,
  inferred: inferred.length,
  inferred_correct: inferred.filter((row) => row.symbol_correct).length,
  precision: ratio(inferred.filter((row) => row.symbol_correct).length, inferred.length),
  coverage: ratio(inferred.length, scorable.length),
  file_accuracy: ratio(inferred.filter((row) => row.file_correct).length, inferred.length),
  top1_correct: rows.filter((row) => row.top1_correct).length,
  top1_recall: ratio(rows.filter((row) => row.top1_correct).length, scorable.length),
  top5_hits: rows.filter((row) => row.top5_hit).length,
  top5_recall: ratio(rows.filter((row) => row.top5_hit).length, scorable.length),
  discovery_tasks: discovery.length,
  discovery_inferred: discoveryInferred.length,
  discovery_inferred_correct: discoveryInferred.filter((row) => row.symbol_correct).length,
  discovery_precision: ratio(discoveryInferred.filter((row) => row.symbol_correct).length, discoveryInferred.length),
  discovery_top5_hits: discovery.filter((row) => row.top5_hit).length,
  discovery_top5_recall: ratio(discovery.filter((row) => row.top5_hit).length, discovery.filter((row) => row.truth.symbols.length).length),
};
const decisions = {
  promote_single_hint: inferred.length >= 10 && (summary.precision ?? 0) >= 0.9 && (summary.coverage ?? 0) >= 0.5
    && discoveryInferred.length >= 8 && (summary.discovery_precision ?? 0) >= 0.85,
  advance_shortlist_experiment: (summary.top5_recall ?? 0) >= 0.75 && (summary.discovery_top5_recall ?? 0) >= 0.65,
};
const result = { benchmark: "zod-implementation-holdout-v2", evaluator_hash: evaluatorHash, summary, decisions, rows };
writeFileSync(`${outBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const markdown = [
  "# Zod implementation-owner holdout v2", "", `Evaluator: \`${evaluatorHash}\``, "",
  "## Decisions", "", `- Single automatic hint: **${decisions.promote_single_hint ? "promote" : "reject"}**`,
  `- Top-five hypothesis shortlist: **${decisions.advance_shortlist_experiment ? "advance" : "reject"}**`, "",
  `Exact delivered precision: ${summary.inferred_correct}/${summary.inferred}; top-five recall: ${summary.top5_hits}/${summary.scorable}; discovery top-five recall: ${summary.discovery_top5_hits}/${discovery.filter((row) => row.truth.symbols.length).length}.`, "",
  "| task | inference | exact | top 5 | ground truth |", "|---|---|:---:|:---:|---|",
  ...rows.map((row) => `| ${row.id} | ${row.inference ? `\`${row.inference.owner}\`` : "abstain"} | ${row.symbol_correct ? "yes" : "no"} | ${row.top5_hit ? "yes" : "no"} | ${row.truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`), "",
].join("\n");
writeFileSync(`${outBase}.md`, markdown);
process.stdout.write(`${JSON.stringify({ outBase, evaluatorHash, summary, decisions }, null, 2)}\n`);
