/** Score the already-frozen adaptive-router holdout against future fix diffs. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";

interface Task { id: string; repo: string; number: number; url: string; title: string; body: string; fix_sha: string; pre_fix_sha: string }
interface Prediction { id: string; repo: string; input_hash: string; pre_fix_sha: string; fix_sha: string; stage: string; top: AdaptiveCorrectionCandidate[] }
const BENCHMARK = "adaptive-stage-transfer-v1";
const base = join(import.meta.dirname, "results", "2026-08-25-adaptive-stage-transfer-v1");
const algorithmPath = join(import.meta.dirname, "adaptive-stage-ranker.ts");
const expectedAlgorithmHash = "40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f";
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const taskArtifact = JSON.parse(readFileSync(`${base}.tasks.json`, "utf8")) as { algorithm_hash: string; task_hash: string; tasks: Task[] };
const frozen = JSON.parse(readFileSync(`${base}.predictions.json`, "utf8")) as { algorithm_hash: string; task_hash: string; prediction_hash: string; predictions: Prediction[] };
if (hash(readFileSync(algorithmPath)) !== expectedAlgorithmHash || taskArtifact.algorithm_hash !== expectedAlgorithmHash || frozen.algorithm_hash !== expectedAlgorithmHash) throw new Error("algorithm hash mismatch");
if (hash(JSON.stringify(taskArtifact.tasks)) !== taskArtifact.task_hash || frozen.task_hash !== taskArtifact.task_hash) throw new Error("task hash mismatch");
if (hash(JSON.stringify(frozen.predictions)) !== frozen.prediction_hash || frozen.predictions.length !== taskArtifact.tasks.length) throw new Error("prediction hash mismatch");
for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!; const prediction = frozen.predictions[index]!;
  if (prediction.id !== task.id || prediction.pre_fix_sha !== task.pre_fix_sha || prediction.fix_sha !== task.fix_sha) throw new Error(`${task.id}: identity mismatch`);
  if (prediction.input_hash !== hash(JSON.stringify({ title: task.title, body: task.body }))) throw new Error(`${task.id}: input mismatch`);
}

function sections(diff: string): Array<{ before: string; after: string; text: string }> {
  const matches = [...diff.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
  return matches.map((match, index) => ({ before: match[1]!, after: match[2]!, text: diff.slice(match.index!, matches[index + 1]?.index ?? diff.length) }));
}
const encoded = (path: string): string => path.split("/").map(encodeURIComponent).join("/");
async function raw(repo: string, sha: string, path: string): Promise<string | null> {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${encoded(path)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${repo}:${path}: HTTP ${response.status}`);
  return response.text();
}
async function truth(task: Task): Promise<{ paths: string[]; symbols: string[] }> {
  const response = await fetch(`https://github.com/${task.repo}/pull/${task.number}.diff`); if (!response.ok) throw new Error(`${task.id}: diff HTTP ${response.status}`);
  const paths = new Set<string>(); const symbols = new Set<string>();
  for (const section of sections(await response.text())) {
    const beforeMissing = /^--- \/dev\/null$/m.test(section.text); const afterMissing = /^\+\+\+ \/dev\/null$/m.test(section.text);
    const path = afterMissing ? section.before : section.after;
    if (!/\.tsx?$/.test(path) || excludedSource.test(path)) continue;
    paths.add(path); if (beforeMissing) continue;
    const before = await raw(task.repo, task.pre_fix_sha, section.before); if (!before) continue;
    const changed = changedLineNumbers(section.text).before;
    for (const span of declarationOwners(section.before, before)) if ([...changed].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
  }
  return { paths: [...paths].sort(), symbols: [...symbols].sort() };
}

const rows = [] as Array<{ id: string; repo: string; url: string; stage: string; top: AdaptiveCorrectionCandidate[]; ground_truth: { paths: string[]; symbols: string[] }; symbol_scorable: boolean; exact: boolean; top5: boolean; file: boolean }>;
for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!; const prediction = frozen.predictions[index]!; const ground = await truth(task);
  const owner = prediction.top[0]?.owner; const path = owner?.split("::")[0];
  rows.push({ id: task.id, repo: task.repo, url: task.url, stage: prediction.stage, top: prediction.top, ground_truth: ground, symbol_scorable: !!ground.symbols.length, exact: !!owner && ground.symbols.includes(owner), top5: prediction.top.slice(0, 5).some((item) => ground.symbols.includes(item.owner)), file: !!path && ground.paths.includes(path) });
  process.stderr.write(`[score ${index + 1}/${taskArtifact.tasks.length}] ${task.id}: ${ground.symbols.length} pre-existing owner(s)\n`);
}
const scorable = rows.filter((row) => row.symbol_scorable); const count = (key: "exact" | "top5" | "file") => scorable.filter((row) => row[key]).length; const ratio = (n: number) => scorable.length ? n / scorable.length : null;
const exact = count("exact"), top5 = count("top5"), file = count("file");
const summary = { tasks: rows.length, scorable_tasks: scorable.length, exact_symbol_correct: exact, top5_symbol_hits: top5, correct_file: file, exact_rate: ratio(exact), top5_rate: ratio(top5), file_rate: ratio(file), abstentions: rows.filter((row) => !row.top.length).length, decision: scorable.length >= 10 && top5 / scorable.length >= 0.7 && file / scorable.length >= 0.7 ? "promote-adaptive-diagnostic" : "reject-adaptive-transfer", exact_owner_policy: "disabled" };
const result = { benchmark: BENCHMARK, generated_at: new Date().toISOString(), algorithm_hash: expectedAlgorithmHash, task_hash: taskArtifact.task_hash, prediction_hash: frozen.prediction_hash, locked_rule: "At least 10 scorable tasks, >=70% top-five pre-existing declaration recall, and >=70% top-one file accuracy.", summary, rows };
writeFileSync(`${base}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const lines = ["# Repository-adaptive correction shortlist transfer v1", "", "Predictions were frozen from issue text and pre-fix source before any fix diff was requested.", "", "## Verdict", "", `**${summary.decision}**`, "", `- Scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`, `- Exact declaration: ${summary.exact_symbol_correct}/${summary.scorable_tasks} (${pct(summary.exact_rate)})`, `- Top five: ${summary.top5_symbol_hits}/${summary.scorable_tasks} (${pct(summary.top5_rate)})`, `- Correct file: ${summary.correct_file}/${summary.scorable_tasks} (${pct(summary.file_rate)})`, `- Exact-owner policy: ${summary.exact_owner_policy}`, "", "| task | repo | stage | top prediction | exact | top 5 | file | pre-existing ground truth |", "|---|---|---|---|:---:|:---:|:---:|---|", ...rows.map((row) => `| [${row.id}](${row.url}) | ${row.repo} | ${row.stage} | ${row.top[0] ? `\`${row.top[0].owner}\`` : "abstain"} | ${row.exact ? "yes" : "no"} | ${row.top5 ? "yes" : "no"} | ${row.file ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`), "", `Algorithm SHA-256: \`${expectedAlgorithmHash}\`.`, `Task SHA-256: \`${taskArtifact.task_hash}\`.`, `Prediction SHA-256: \`${frozen.prediction_hash}\`.`, "", "## Interpretation", "", summary.decision === "promote-adaptive-diagnostic" ? "The locked transfer rule passed. The adaptive ranker may replace the Zod-specific path router as an experimental stage + likely-file + bounded-shortlist diagnostic; exact-owner output remains disabled." : "The locked transfer rule failed. Do not productize or tune and rescore this holdout.", ""];
writeFileSync(`${base}.md`, lines.join("\n")); process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
