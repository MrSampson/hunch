/** Score frozen cross-view consensus predictions against narrow fix diffs. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyAdaptiveViewConsensus, type AdaptiveViewConsensusEvidence } from "./adaptive-stage-view-consensus.js";
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";

interface Task { id: string; repo: string; number: number; url: string; title: string; body: string; fix_sha: string; pre_fix_sha: string }
interface Prediction { id: string; repo: string; input_hash: string; pre_fix_sha: string; fix_sha: string; evidence: AdaptiveViewConsensusEvidence; views: { full: AdaptiveCorrectionCandidate[]; title: AdaptiveCorrectionCandidate[]; body: AdaptiveCorrectionCandidate[] } }
const BENCHMARK = "adaptive-stage-view-consensus-transfer-v1";
const base = join(import.meta.dirname, "results", "2026-08-25-adaptive-stage-view-consensus-transfer-v1");
const rankerPath = join(import.meta.dirname, "adaptive-stage-ranker.ts"); const policyPath = join(import.meta.dirname, "adaptive-stage-view-consensus.ts");
const expectedRankerHash = "40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f";
const expectedPolicyHash = "69cacc6fe39682562a9d5fc2d5075a01524549ba23ee237f80891bb81f15ebd5";
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const taskArtifact = JSON.parse(readFileSync(`${base}.tasks.json`, "utf8")) as { ranker_hash: string; policy_hash: string; task_hash: string; tasks: Task[] };
const frozen = JSON.parse(readFileSync(`${base}.predictions.json`, "utf8")) as { ranker_hash: string; policy_hash: string; task_hash: string; prediction_hash: string; predictions: Prediction[] };
if (hash(readFileSync(rankerPath)) !== expectedRankerHash || taskArtifact.ranker_hash !== expectedRankerHash || frozen.ranker_hash !== expectedRankerHash) throw new Error("ranker hash mismatch");
if (hash(readFileSync(policyPath)) !== expectedPolicyHash || taskArtifact.policy_hash !== expectedPolicyHash || frozen.policy_hash !== expectedPolicyHash) throw new Error("policy hash mismatch");
if (hash(JSON.stringify(taskArtifact.tasks)) !== taskArtifact.task_hash || frozen.task_hash !== taskArtifact.task_hash) throw new Error("task hash mismatch");
if (hash(JSON.stringify(frozen.predictions)) !== frozen.prediction_hash || frozen.predictions.length !== taskArtifact.tasks.length) throw new Error("prediction hash mismatch");
for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!; const prediction = frozen.predictions[index]!;
  if (prediction.id !== task.id || prediction.pre_fix_sha !== task.pre_fix_sha || prediction.fix_sha !== task.fix_sha) throw new Error(`${task.id}: identity mismatch`);
  if (prediction.input_hash !== hash(JSON.stringify({ title: task.title, body: task.body }))) throw new Error(`${task.id}: input mismatch`);
  if (JSON.stringify(prediction.evidence) !== JSON.stringify(classifyAdaptiveViewConsensus(prediction.views.full, prediction.views.title, prediction.views.body))) throw new Error(`${task.id}: evidence mismatch`);
}
function sections(diff: string): Array<{ before: string; after: string; text: string }> {
  const matches = [...diff.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
  return matches.map((match, index) => ({ before: match[1]!, after: match[2]!, text: diff.slice(match.index!, matches[index + 1]?.index ?? diff.length) }));
}
const encoded = (path: string): string => path.split("/").map(encodeURIComponent).join("/");
async function raw(repo: string, sha: string, path: string): Promise<string | null> {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${encoded(path)}`); if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${repo}:${path}: HTTP ${response.status}`); return response.text();
}
async function truth(task: Task): Promise<{ paths: string[]; symbols: string[] }> {
  const response = await fetch(`https://github.com/${task.repo}/pull/${task.number}.diff`); if (!response.ok) throw new Error(`${task.id}: diff HTTP ${response.status}`);
  const paths = new Set<string>(); const symbols = new Set<string>();
  for (const section of sections(await response.text())) {
    const beforeMissing = /^--- \/dev\/null$/m.test(section.text); const afterMissing = /^\+\+\+ \/dev\/null$/m.test(section.text); const path = afterMissing ? section.before : section.after;
    if (!/\.tsx?$/.test(path) || excludedSource.test(path)) continue; paths.add(path); if (beforeMissing) continue;
    const before = await raw(task.repo, task.pre_fix_sha, section.before); if (!before) continue; const changed = changedLineNumbers(section.text).before;
    for (const span of declarationOwners(section.before, before)) if ([...changed].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
  }
  return { paths: [...paths].sort(), symbols: [...symbols].sort() };
}
const rows = [] as Array<{ id: string; repo: string; url: string; evidence: AdaptiveViewConsensusEvidence; top: AdaptiveCorrectionCandidate[]; ground_truth: { paths: string[]; symbols: string[] }; symbol_scorable: boolean; exact: boolean; top5: boolean; file: boolean }>;
for (let index = 0; index < taskArtifact.tasks.length; index++) {
  const task = taskArtifact.tasks[index]!; const prediction = frozen.predictions[index]!; const ground = await truth(task); const owner = prediction.views.full[0]?.owner; const path = owner?.split("::")[0];
  rows.push({ id: task.id, repo: task.repo, url: task.url, evidence: prediction.evidence, top: prediction.views.full, ground_truth: ground, symbol_scorable: ground.symbols.length > 0, exact: !!owner && ground.symbols.includes(owner), top5: prediction.views.full.slice(0, 5).some((candidate) => ground.symbols.includes(candidate.owner)), file: !!path && ground.paths.includes(path) });
  process.stderr.write(`[score ${index + 1}/${taskArtifact.tasks.length}] ${task.id}: ${ground.symbols.length} pre-existing owner(s)\n`);
}
const scorable = rows.filter((row) => row.symbol_scorable); const supported = scorable.filter((row) => row.evidence.level === "supported");
const count = (values: typeof rows, key: "top5" | "file"): number => values.filter((row) => row[key]).length; const ratio = (hits: number, total: number): number | null => total ? hits / total : null;
const baselineHits = count(scorable, "top5"), supportedHits = count(supported, "top5"), fileHits = count(supported, "file");
const baselineRate = ratio(baselineHits, scorable.length), supportedRate = ratio(supportedHits, supported.length), coverage = ratio(supported.length, scorable.length);
const improvement = baselineRate === null || supportedRate === null ? null : supportedRate - baselineRate;
const promoted = scorable.length >= 10 && supported.length >= 4 && (coverage ?? 0) >= 0.25 && (supportedRate ?? 0) >= 0.85 && (improvement ?? -1) >= 0.10;
const filePromoted = supported.length > 0 && fileHits / supported.length >= 0.85;
const summary = { tasks: rows.length, scorable_tasks: scorable.length, baseline_top5_hits: baselineHits, baseline_top5_rate: baselineRate, supported_tasks: supported.length, supported_coverage: coverage, supported_top5_hits: supportedHits, supported_top5_rate: supportedRate, supported_improvement: improvement, supported_file_hits: fileHits, supported_file_rate: ratio(fileHits, supported.length), tentative_tasks: scorable.filter((row) => row.evidence.level === "tentative").length, insufficient_tasks: scorable.filter((row) => row.evidence.level === "insufficient").length, decision: promoted ? "promote-cross-view-evidence" : "reject-cross-view-evidence", likely_file_confidence: filePromoted ? "promoted" : "disabled", exact_owner_policy: "disabled" };
const result = { benchmark: BENCHMARK, generated_at: new Date().toISOString(), ranker_hash: expectedRankerHash, policy_hash: expectedPolicyHash, task_hash: taskArtifact.task_hash, prediction_hash: frozen.prediction_hash, locked_rule: "At least 10 scorable; >=4 supported and >=25% coverage; supported top-five >=85% and >=10 points over baseline.", summary, rows };
writeFileSync(`${base}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${base}.md`, ["# Adaptive shortlist cross-view consensus transfer v1", "", "All three rankings and evidence labels were frozen from issue text and pre-fix source before any fix diff was requested.", "", "## Verdict", "", `**${summary.decision}**`, "", `- Scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`, `- Unfiltered top-five accuracy: ${summary.baseline_top5_hits}/${summary.scorable_tasks} (${pct(summary.baseline_top5_rate)})`, `- Supported coverage: ${summary.supported_tasks}/${summary.scorable_tasks} (${pct(summary.supported_coverage)})`, `- Supported top-five accuracy: ${summary.supported_top5_hits}/${summary.supported_tasks} (${pct(summary.supported_top5_rate)})`, `- Improvement over unfiltered: ${pct(summary.supported_improvement)}`, `- Supported likely-file accuracy: ${summary.supported_file_hits}/${summary.supported_tasks} (${pct(summary.supported_file_rate)}) — ${summary.likely_file_confidence}`, `- Exact-owner policy: ${summary.exact_owner_policy}`, "", "| task | repo | evidence | top prediction | top 5 | file | pre-existing ground truth |", "|---|---|---|---|:---:|:---:|---|", ...rows.map((row) => `| [${row.id}](${row.url}) | ${row.repo} | ${row.evidence.level} | ${row.top[0] ? `\`${row.top[0].owner}\`` : "abstain"} | ${row.top5 ? "yes" : "no"} | ${row.file ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`), "", `Ranker SHA-256: \`${expectedRankerHash}\`.`, `Policy SHA-256: \`${expectedPolicyHash}\`.`, `Task SHA-256: \`${taskArtifact.task_hash}\`.`, `Prediction SHA-256: \`${frozen.prediction_hash}\`.`, "", "## Interpretation", "", promoted ? "The locked rule passed. Cross-view support may be exposed for the bounded shortlist; likely-file and exact-owner confidence remain governed by their separate results." : "The locked rule failed. Do not productize or tune and rescore this policy on this holdout.", ""].join("\n"));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
