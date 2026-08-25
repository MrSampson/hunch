/** Preregistered blind cross-repository transfer for the progressive plan.
 * Phase 1 opens only issue text and the pre-fix parent. Predictions and plan
 * receipts are on disk before phase 2 opens any fixing diff or post-fix source.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type {
  FileFirstDeclarationDiagnostic,
  ProgressiveDeclarationPlan,
} from "../../src/core/declarationClusters.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";

interface TransferCase { id: string; fix_sha: string; issue: string }
interface TaskFile { benchmark: string; repository: string; selection: string; cases: TransferCase[] }
interface FrozenPrediction {
  id: string;
  fix_sha: string;
  pre_fix_sha: string;
  case_hash: string;
  baseline_top5: string[];
  file_first_declaration_clusters: FileFirstDeclarationDiagnostic;
  progressive_inspection: ProgressiveDeclarationPlan;
}

const EXPECTED = {
  tasks: "f040c672ff8ef41be16218212ea28e94bf19fe9041ff696a06cf355e19a31250",
  declaration_clusters: "4254e044bde84287aa8ac399e81ae3bdeaddd1d6bc1ce4b340c8b84040347f95",
  correction_stage: "2cf306fd2cb4814ad5ec5f3ca6ac79e946f0aad8e180626130559758523d942a",
  static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
  truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
} as const;
const taskPath = join(import.meta.dirname, "results", "2026-08-25-progressive-inspection-transfer-v4.tasks.json");
const outputBase = resolve(process.env.HUNCH_PROGRESSIVE_TRANSFER_OUT
  ?? join(import.meta.dirname, "results", "2026-08-25-progressive-inspection-transfer-v4"));
const repo = resolve(process.env.HUNCH_ARKTYPE_BENCH_REPO ?? "../arktype-bench");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const assertHash = (path: string, expected: string): void => {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
};
assertHash(taskPath, EXPECTED.tasks);
assertHash(resolve(import.meta.dirname, "../../src/core/declarationClusters.ts"), EXPECTED.declaration_clusters);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.correction_stage);
assertHash(resolve(import.meta.dirname, "../../src/core/pipeline.ts"), EXPECTED.static_ranker);
assertHash(join(import.meta.dirname, "evaluate-zod-owner-ranker.ts"), EXPECTED.truth_mapper);

function git(args: string[], maxBuffer = 128 * 1024 * 1024): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer });
}

function eligible(path: string): boolean {
  return /\.tsx?$/.test(path)
    && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.tsx?$/.test(path);
}

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha])
    .split("\n")
    .filter(eligible)
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

// Phase 1: freeze issue-only predictions and receipts before opening labels.
const predictions: FrozenPrediction[] = tasks.cases.map((entry, index) => {
  const preFix = git(["rev-parse", `${entry.fix_sha}^1`]).trim();
  const diagnostic = diagnoseIssueCorrectionStage(entry.issue, sourcesAt(preFix), 5);
  const prediction = {
    id: entry.id,
    fix_sha: entry.fix_sha,
    pre_fix_sha: preFix,
    case_hash: sha256(JSON.stringify(entry)),
    baseline_top5: diagnostic.candidates.map((candidate) => candidate.owner),
    file_first_declaration_clusters: diagnostic.file_first_declaration_clusters,
    progressive_inspection: diagnostic.progressive_inspection,
  };
  process.stderr.write(`[freeze ${index + 1}/${tasks.cases.length}] ${entry.id}: plan=${prediction.progressive_inspection.candidates.length} receipt=${prediction.progressive_inspection.receipt.receipt_id}\n`);
  return prediction;
});
const predictionHash = sha256(JSON.stringify(predictions));
const receiptHash = sha256(JSON.stringify(predictions.map((prediction) => prediction.progressive_inspection.receipt)));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({
  benchmark: tasks.benchmark,
  freeze_boundary: "written-before-post-fix-source-or-fixing-diff-was-opened",
  hashes: { ...EXPECTED, predictions: predictionHash, receipts: receiptHash },
  predictions,
}, null, 2)}\n`);

function gitFile(sha: string, path: string): string | null {
  const result = spawnSync("git", ["-C", repo, "show", `${sha}:${path}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

function truthFor(preFix: string, fixSha: string): { paths: string[]; symbols: string[] } {
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha])
    .split("\n")
    .filter(eligible);
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

const ownerPath = (owner: string): string => owner.split("::")[0]!;
// Phase 2: the complete prediction artifact exists. Labels may now be opened.
const rows = predictions.map((prediction, index) => {
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const progressiveOwners = prediction.progressive_inspection.candidates.map((candidate) => candidate.owner);
  const throughTenOwners = prediction.progressive_inspection.candidates
    .filter((candidate) => candidate.inspection_rank <= 10)
    .map((candidate) => candidate.owner);
  const clusterOwners = prediction.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner)));
  const selectedFiles = prediction.file_first_declaration_clusters.files.map((file) => file.path);
  const hit = (owners: string[]): boolean => owners.some((owner) => truth.symbols.includes(owner));
  const baselineHit = hit(prediction.baseline_top5);
  const clusterHit = hit(clusterOwners);
  const progressiveHit = hit(progressiveOwners);
  const fullUnionHit = baselineHit || clusterHit;
  const baselinePreserved = prediction.baseline_top5.every((owner, ownerIndex) => progressiveOwners[ownerIndex] === owner);
  process.stderr.write(`[score ${index + 1}/${predictions.length}] ${prediction.id}: scorable=${truth.symbols.length > 0} baseline=${baselineHit} progressive=${progressiveHit} full=${fullUnionHit}\n`);
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    baseline_hit: baselineHit,
    through_ten_hit: hit(throughTenOwners),
    progressive_hit: progressiveHit,
    cluster_hit: clusterHit,
    full_cluster_union_hit: fullUnionHit,
    progressive_rescue: !baselineHit && progressiveHit,
    loss_against_full_union: fullUnionHit && !progressiveHit,
    baseline_preserved: baselinePreserved,
    baseline_file: prediction.baseline_top5.some((owner) => truth.paths.includes(ownerPath(owner))),
    cluster_file: selectedFiles.some((path) => truth.paths.includes(path)),
    inspected_declarations: new Set(progressiveOwners).size,
    full_cluster_declarations: new Set(clusterOwners).size,
  };
});
const scorable = rows.filter((row) => row.symbol_scorable);
const baselineHits = scorable.filter((row) => row.baseline_hit).length;
const progressiveHits = scorable.filter((row) => row.progressive_hit).length;
const fullUnionHits = scorable.filter((row) => row.full_cluster_union_hit).length;
const inspected = scorable.map((row) => row.inspected_declarations);
const fullInspected = scorable.map((row) => row.full_cluster_declarations);
const average = (values: number[]): number | null => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;
const averageInspected = average(inspected);
const averageFullInspected = average(fullInspected);
const inspectionReduction = averageInspected !== null && averageFullInspected !== null && averageFullInspected > 0
  ? 1 - averageInspected / averageFullInspected
  : null;
const receiptsComplete = rows.every((row) => {
  const receipt = row.progressive_inspection.receipt;
  return /^[a-f0-9]{24}$/.test(receipt.receipt_id)
    && receipt.flat_shortlist_preserved
    && receipt.rejected_rerankers_disabled
    && receipt.exact_owner_enabled === false;
});
const rescues = scorable.filter((row) => row.progressive_rescue).length;
const losses = scorable.filter((row) => row.loss_against_full_union).length;
const promoted = scorable.length >= 8
  && rows.every((row) => row.baseline_preserved)
  && progressiveHits >= baselineHits
  && rescues >= 1
  && progressiveHits === fullUnionHits
  && losses === 0
  && Math.max(...inspected) <= 11
  && inspectionReduction !== null && inspectionReduction >= 0.35
  && receiptsComplete;
const summary = {
  tasks: rows.length,
  scorable_tasks: scorable.length,
  baseline_top5_hits: baselineHits,
  through_ten_hits: scorable.filter((row) => row.through_ten_hit).length,
  progressive_hits: progressiveHits,
  full_cluster_union_hits: fullUnionHits,
  progressive_rescues: rescues,
  losses_against_full_union: losses,
  baseline_file_hits: scorable.filter((row) => row.baseline_file).length,
  cluster_file_hits: scorable.filter((row) => row.cluster_file).length,
  average_inspected_declarations: averageInspected,
  max_inspected_declarations: Math.max(...inspected),
  average_full_cluster_declarations: averageFullInspected,
  inspection_reduction: inspectionReduction,
  baseline_preserved: rows.every((row) => row.baseline_preserved),
  receipts_complete: receiptsComplete,
  decision: promoted ? "promote-progressive-inspection-v4" : "reject-progressive-inspection-v4",
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "Cross-repository issue-only predictions and deterministic plan receipts were frozen from ArkType pre-fix parents before any fixing diff or post-fix source was opened.",
  hashes: { ...EXPECTED, predictions: predictionHash, receipts: receiptHash },
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  "# Progressive inspection cross-repository transfer v4",
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Baseline top-five hits: ${summary.baseline_top5_hits}/${summary.scorable_tasks}`,
  `- Hits through position ten: ${summary.through_ten_hits}/${summary.scorable_tasks}`,
  `- Progressive-plan hits: ${summary.progressive_hits}/${summary.scorable_tasks}`,
  `- Full-cluster-union hits: ${summary.full_cluster_union_hits}/${summary.scorable_tasks}`,
  `- Progressive rescues / losses against full union: ${summary.progressive_rescues}/${summary.losses_against_full_union}`,
  `- Baseline / cluster file hits: ${summary.baseline_file_hits}/${summary.cluster_file_hits}`,
  `- Progressive average / max declarations: ${summary.average_inspected_declarations?.toFixed(1) ?? "n/a"}/${summary.max_inspected_declarations}`,
  `- Full-cluster average declarations: ${summary.average_full_cluster_declarations?.toFixed(1) ?? "n/a"}`,
  `- Inspection reduction: ${pct(summary.inspection_reduction)}`,
  `- Flat shortlist preserved and receipts complete: ${summary.baseline_preserved && summary.receipts_complete ? "yes" : "no"}`,
  `- Exact-owner output: ${summary.exact_owner_policy}`,
  "",
  "| case | scorable | top five | through 10 | plan | full union | rescue | plan/full declarations | receipt | truth |",
  "|---|:---:|:---:|:---:|:---:|:---:|:---:|---:|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.symbol_scorable ? "yes" : "no"} | ${row.baseline_hit ? "hit" : "miss"} | ${row.through_ten_hit ? "hit" : "miss"} | ${row.progressive_hit ? "hit" : "miss"} | ${row.full_cluster_union_hit ? "hit" : "miss"} | ${row.progressive_rescue ? "yes" : "no"} | ${row.inspected_declarations}/${row.full_cluster_declarations} | \`${row.progressive_inspection.receipt.receipt_id}\` | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  `Receipt-set SHA-256: \`${receiptHash}\`.`,
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary, hashes: result.hashes }, null, 2)}\n`);
