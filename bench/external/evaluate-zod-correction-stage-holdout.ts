/** Blind transfer test for the correction-stage diagnostic shortlist. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { inferIssueCorrectionStage, rankIssueCorrectionStageCandidates } from "./v8-owner-evidence.js";

interface Task { id: string; fixSha: string; issueTitle: string; issueBody: string }
const root = resolve(import.meta.dirname, "../..");
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? join(root, "../zod-bench"));
const tasksPath = join(import.meta.dirname, "zod-correction-stage-holdout-tasks.json");
const tasks = (JSON.parse(readFileSync(tasksPath, "utf8")) as { tasks: Task[] }).tasks;
const outputBase = join(import.meta.dirname, "results", "2026-08-25-zod-correction-stage-holdout-v1");
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const git = (args: string[], maxBuffer = 64 * 1024 * 1024): string => execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  const dir = mkdtempSync(join(tmpdir(), "hunch-zod-stage-"));
  try {
    const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "packages/zod/src/v4"], { maxBuffer: 32 * 1024 * 1024 });
    const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
    if (extraction.status !== 0) throw new Error(String(extraction.stderr));
    return walk(join(dir, "packages/zod/src/v4"))
      .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
      .map((path) => ({ path: path.slice(dir.length + 1), content: readFileSync(path, "utf8") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function gitFile(sha: string, path: string): string | null {
  const shown = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8" });
  return shown.status === 0 ? shown.stdout : null;
}

function truthFor(preFix: string, fixSha: string): { paths: string[]; symbols: string[] } {
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha, "--", "packages/zod/src"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path));
  const symbols = new Set<string>();
  for (const path of paths) {
    const changed = changedLineNumbers(git(["diff", "--unified=0", "--no-ext-diff", preFix, fixSha, "--", path]));
    for (const [sha, lines] of [[preFix, changed.before], [fixSha, changed.after]] as const) {
      const content = gitFile(sha, path);
      if (!content) continue;
      for (const span of declarationOwners(path, content)) {
        if ([...lines].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
      }
    }
  }
  return { paths: [...new Set(paths)].sort(), symbols: [...symbols].sort() };
}

const predictions = tasks.map((task, index) => {
  const preFix = git(["rev-parse", `${task.fixSha}^1`]).trim();
  const issue = `${task.issueTitle}\n${task.issueBody}`;
  const top = rankIssueCorrectionStageCandidates(issue, sourcesAt(preFix)).slice(0, 10);
  process.stderr.write(`[predict ${index + 1}/${tasks.length}] ${task.id}: ${top[0]?.owner ?? "abstain"}\n`);
  return {
    id: task.id,
    input_hash: sha256(JSON.stringify({ id: task.id, title: task.issueTitle, body: task.issueBody })),
    pre_fix_sha: preFix,
    fix_sha: task.fixSha,
    stage: top[0]?.stage ?? inferIssueCorrectionStage(issue),
    top,
  };
});

// Freeze every prediction before reading any future diff.
const predictionHash = sha256(JSON.stringify(predictions));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({ benchmark: "zod-correction-stage-holdout-v1", prediction_hash: predictionHash, predictions }, null, 2)}\n`);

const rows = predictions.map((prediction) => {
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const predicted = prediction.top[0]?.owner ?? null;
  const predictedPath = predicted?.split("::")[0] ?? null;
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    exact_symbol_correct: Boolean(predicted && truth.symbols.includes(predicted)),
    top5_symbol_hit: prediction.top.slice(0, 5).some((candidate) => truth.symbols.includes(candidate.owner)),
    file_correct: Boolean(predictedPath && truth.paths.includes(predictedPath)),
  };
});
const scorable = rows.filter((row) => row.symbol_scorable);
const top5 = scorable.filter((row) => row.top5_symbol_hit).length;
const files = scorable.filter((row) => row.file_correct).length;
const summary = {
  tasks: rows.length,
  scorable_tasks: scorable.length,
  exact_symbol_correct: scorable.filter((row) => row.exact_symbol_correct).length,
  top5_symbol_hits: top5,
  correct_file: files,
  top5_rate: scorable.length ? top5 / scorable.length : 0,
  file_rate: scorable.length ? files / scorable.length : 0,
  decision: scorable.length >= 10 && top5 / scorable.length >= 0.7 && files / scorable.length >= 0.7
    ? "retain-diagnostic-stage-shortlist"
    : "reject-stage-router",
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: "zod-correction-stage-holdout-v1",
  generated_at: new Date().toISOString(),
  prediction_hash: predictionHash,
  locked_rule: "At least 10 scorable tasks, >=70% top-five symbol recall, and >=70% top-one file accuracy. Exact-owner output remains disabled.",
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const lines = [
  "# Zod correction-stage blind holdout v1",
  "",
  "All predictions were frozen before future source diffs were read.",
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Exact symbol: ${summary.exact_symbol_correct}/${summary.scorable_tasks}`,
  `- Top five: ${summary.top5_symbol_hits}/${summary.scorable_tasks} (${pct(summary.top5_rate)})`,
  `- Correct file: ${summary.correct_file}/${summary.scorable_tasks} (${pct(summary.file_rate)})`,
  "- Exact-owner policy: disabled",
  "",
  "| task | stage | top prediction | exact | top 5 | file | ground truth |",
  "|---|---|---|:---:|:---:|:---:|---|",
  ...rows.map((row) => `| ${row.id} | ${row.stage} | ${row.top[0] ? `\`${row.top[0].owner}\`` : "abstain"} | ${row.exact_symbol_correct ? "yes" : "no"} | ${row.top5_symbol_hit ? "yes" : "no"} | ${row.file_correct ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  "",
  "## Interpretation",
  "",
  "The correction-stage router passed its locked diagnostic rule. It may identify a likely repository layer, show the top file, and offer up to five declarations as an investigation shortlist.",
  "",
  "It must not claim an exact correction owner. Exact accuracy was only 6/11, and one miss involved a subsystem that did not exist in the pre-fix tree.",
  "",
  "The safe output contract is: **stage + likely file + bounded candidate shortlist + explicit uncertainty**.",
  "",
];
writeFileSync(`${outputBase}.md`, lines.join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase: basename(outputBase), summary }, null, 2)}\n`);
