/** Reveal fix diffs and score predictions that were already frozen by cross-stage-v2.ts. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import type { CorrectionStageCandidate } from "../../src/core/correctionStage.js";

interface Task {
  id: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  body: string;
  merged_at: string;
  fix_sha: string;
  pre_fix_sha: string;
}
interface Prediction {
  id: string;
  repo: string;
  input_hash: string;
  pre_fix_sha: string;
  fix_sha: string;
  stage: string;
  top: CorrectionStageCandidate[];
}

const BENCHMARK = "cross-repo-correction-stage-transfer-v2";
const outputBase = join(import.meta.dirname, "results", "2026-08-25-cross-repo-correction-stage-transfer-v2");
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const taskArtifact = JSON.parse(readFileSync(`${outputBase}.tasks.json`, "utf8")) as { task_hash: string; tasks: Task[] };
const frozen = JSON.parse(readFileSync(`${outputBase}.predictions.json`, "utf8")) as {
  task_hash: string;
  prediction_hash: string;
  predictions: Prediction[];
};

if (sha256(JSON.stringify(taskArtifact.tasks)) !== taskArtifact.task_hash) throw new Error("task manifest hash mismatch");
if (frozen.task_hash !== taskArtifact.task_hash) throw new Error("prediction/task hash mismatch");
if (sha256(JSON.stringify(frozen.predictions)) !== frozen.prediction_hash) throw new Error("frozen prediction hash mismatch");
if (frozen.predictions.length !== taskArtifact.tasks.length) throw new Error("prediction/task count mismatch");
for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!;
  const prediction = frozen.predictions[index]!;
  if (prediction.id !== task.id || prediction.pre_fix_sha !== task.pre_fix_sha || prediction.fix_sha !== task.fix_sha) {
    throw new Error(`${task.id}: prediction identity mismatch`);
  }
  if (prediction.input_hash !== sha256(JSON.stringify({ title: task.title, body: task.body }))) {
    throw new Error(`${task.id}: issue input changed after prediction`);
  }
}

interface DiffSection { beforePath: string; afterPath: string; text: string }

function diffSections(diff: string): DiffSection[] {
  const matches = [...diff.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
  return matches.map((match, index) => ({
    beforePath: match[1]!,
    afterPath: match[2]!,
    text: diff.slice(match.index!, matches[index + 1]?.index ?? diff.length),
  }));
}

function encodedPath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function rawFile(repo: string, sha: string, path: string): Promise<string | null> {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${encodedPath(path)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${repo}@${sha}:${path}: HTTP ${response.status}`);
  return response.text();
}

async function truthFor(task: Task): Promise<{ paths: string[]; symbols: string[] }> {
  const response = await fetch(`https://github.com/${task.repo}/pull/${task.number}.diff`);
  if (!response.ok) throw new Error(`${task.id}: diff HTTP ${response.status}`);
  const diff = await response.text();
  const paths = new Set<string>();
  const symbols = new Set<string>();
  for (const section of diffSections(diff)) {
    const beforeMissing = /^--- \/dev\/null$/m.test(section.text);
    const afterMissing = /^\+\+\+ \/dev\/null$/m.test(section.text);
    const path = afterMissing ? section.beforePath : section.afterPath;
    if (!/\.tsx?$/.test(path) || excludedSource.test(path)) continue;
    paths.add(path);
    const changed = changedLineNumbers(section.text);
    const [before, after] = await Promise.all([
      beforeMissing ? Promise.resolve(null) : rawFile(task.repo, task.pre_fix_sha, section.beforePath),
      afterMissing ? Promise.resolve(null) : rawFile(task.repo, task.fix_sha, section.afterPath),
    ]);
    if (before) {
      for (const span of declarationOwners(section.beforePath, before)) {
        if ([...changed.before].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
      }
    }
    if (after) {
      for (const span of declarationOwners(section.afterPath, after)) {
        if ([...changed.after].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
      }
    }
  }
  return { paths: [...paths].sort(), symbols: [...symbols].sort() };
}

const rows = [] as Array<{
  id: string;
  repo: string;
  url: string;
  stage: string;
  top: CorrectionStageCandidate[];
  ground_truth: { paths: string[]; symbols: string[] };
  symbol_scorable: boolean;
  exact_symbol_correct: boolean;
  top5_symbol_hit: boolean;
  file_correct: boolean;
}>;

for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!;
  const prediction = frozen.predictions[index]!;
  const truth = await truthFor(task);
  const predicted = prediction.top[0]?.owner ?? null;
  const predictedPath = predicted?.split("::")[0] ?? null;
  rows.push({
    id: task.id,
    repo: task.repo,
    url: task.url,
    stage: prediction.stage,
    top: prediction.top,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    exact_symbol_correct: Boolean(predicted && truth.symbols.includes(predicted)),
    top5_symbol_hit: prediction.top.slice(0, 5).some((candidate) => truth.symbols.includes(candidate.owner)),
    file_correct: Boolean(predictedPath && truth.paths.includes(predictedPath)),
  });
  process.stderr.write(`[score ${index + 1}/${taskArtifact.tasks.length}] ${task.id}: ${truth.symbols.length} truth owner(s)\n`);
}

const scorable = rows.filter((row) => row.symbol_scorable);
const exact = scorable.filter((row) => row.exact_symbol_correct).length;
const top5 = scorable.filter((row) => row.top5_symbol_hit).length;
const files = scorable.filter((row) => row.file_correct).length;
const abstentions = rows.filter((row) => row.top.length === 0).length;
const ratio = (count: number, total: number): number | null => total ? count / total : null;
const byRepo = Object.fromEntries([...new Set(rows.map((row) => row.repo))].map((repo) => {
  const repoRows = rows.filter((row) => row.repo === repo && row.symbol_scorable);
  return [repo, {
    tasks: rows.filter((row) => row.repo === repo).length,
    scorable_tasks: repoRows.length,
    top5_symbol_hits: repoRows.filter((row) => row.top5_symbol_hit).length,
    correct_file: repoRows.filter((row) => row.file_correct).length,
    abstentions: rows.filter((row) => row.repo === repo && row.top.length === 0).length,
  }];
}));
const summary = {
  tasks: rows.length,
  scorable_tasks: scorable.length,
  exact_symbol_correct: exact,
  top5_symbol_hits: top5,
  correct_file: files,
  exact_symbol_rate: ratio(exact, scorable.length),
  top5_rate: ratio(top5, scorable.length),
  file_rate: ratio(files, scorable.length),
  abstentions,
  abstention_rate: ratio(abstentions, rows.length),
  by_repo: byRepo,
  decision: scorable.length >= 10 && top5 / scorable.length >= 0.7 && files / scorable.length >= 0.7
    ? "retain-cross-repository-diagnostic"
    : "reject-cross-repository-transfer",
  exact_owner_policy: "disabled",
};

const result = {
  benchmark: BENCHMARK,
  generated_at: new Date().toISOString(),
  task_hash: taskArtifact.task_hash,
  prediction_hash: frozen.prediction_hash,
  locked_rule: "At least 10 symbol-scorable tasks across both repositories, >=70% top-five declaration recall, and >=70% top-one file accuracy. Exact-owner output remains disabled.",
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);

const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const lines = [
  "# Cross-repository correction-stage transfer v2",
  "",
  "All predictions were frozen from issue text plus pre-fix source before any fix diff was requested.",
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Symbol-scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Exact declaration: ${summary.exact_symbol_correct}/${summary.scorable_tasks} (${pct(summary.exact_symbol_rate)})`,
  `- Top five: ${summary.top5_symbol_hits}/${summary.scorable_tasks} (${pct(summary.top5_rate)})`,
  `- Correct file: ${summary.correct_file}/${summary.scorable_tasks} (${pct(summary.file_rate)})`,
  `- Abstentions: ${summary.abstentions}/${summary.tasks} (${pct(summary.abstention_rate)})`,
  "- Exact-owner policy: disabled",
  "",
  "| task | repository | stage | top prediction | exact | top 5 | file | ground truth |",
  "|---|---|---|---|:---:|:---:|:---:|---|",
  ...rows.map((row) => `| [${row.id}](${row.url}) | ${row.repo} | ${row.stage} | ${row.top[0] ? `\`${row.top[0].owner}\`` : "abstain"} | ${row.exact_symbol_correct ? "yes" : "no"} | ${row.top5_symbol_hit ? "yes" : "no"} | ${row.file_correct ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Task SHA-256: \`${taskArtifact.task_hash}\`.`,
  `Prediction SHA-256: \`${frozen.prediction_hash}\`.`,
  "",
  "## Interpretation",
  "",
  summary.decision === "retain-cross-repository-diagnostic"
    ? "The locked transfer rule passed. The stage + file + bounded-shortlist contract can be described as cross-repository evidence, while exact-owner output remains disabled."
    : "The locked transfer rule failed. The current stage/path ontology remains Zod-domain evidence only; these holdout tasks must not be used for tuning and rescoring.",
  "",
];
writeFileSync(`${outputBase}.md`, lines.join("\n"));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
