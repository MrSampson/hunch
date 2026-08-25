/** Preregistered blind transfer evaluation for file-first declaration clusters.
 * Phase 1 freezes predictions from issue text and pre-fix source. Phase 2 only
 * starts after the prediction artifact exists, then derives truth from the fix.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { FileFirstDeclarationDiagnostic } from "../../src/core/declarationClusters.js";
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
}

const transferVersion = process.env.HUNCH_FILE_CLUSTER_TRANSFER_VERSION === "v3"
  ? "v3"
  : process.env.HUNCH_FILE_CLUSTER_TRANSFER_VERSION === "v2" ? "v2" : "v1";
const config = transferVersion === "v3" ? {
  taskFile: "2026-08-25-flat-file-anchored-clusters-transfer-v3.tasks.json",
  outputName: "2026-08-25-flat-file-anchored-clusters-transfer-v3",
  title: "Flat-file-anchored declaration clusters transfer v3",
  decisionName: "flat-file-anchored-clusters-v3",
  expected: {
    tasks: "da08d983f81298f66f762e277b0f07aae38a8ed0c27ccb4139b7c3d8938df7dd",
    clusters: "c5b65248a17e25e2e9ab59fab84c2df867aeb1d0517e001bc07989a2f82d064e",
    correction: "0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64",
    static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
    truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
  },
} as const : transferVersion === "v2" ? {
  taskFile: "2026-08-25-flat-file-anchored-clusters-transfer-v2.tasks.json",
  outputName: "2026-08-25-flat-file-anchored-clusters-transfer-v2",
  title: "Flat-file-anchored declaration clusters transfer v2",
  decisionName: "flat-file-anchored-clusters-v2",
  expected: {
    tasks: "7e56aaa6318bb71e37260c4bbd7c6415cc9368974dffd13c24e21ee1297dc0d0",
    clusters: "f2135d3980a2007182ae86e33e97a968be5a4ed649895338ca0aa78364f0bc86",
    correction: "0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64",
    static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
    truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
  },
} as const : {
  taskFile: "2026-08-25-file-first-declaration-clusters-transfer-v1.tasks.json",
  outputName: "2026-08-25-file-first-declaration-clusters-transfer-v1",
  title: "File-first declaration clusters transfer v1",
  decisionName: "file-first-declaration-clusters-v1",
  expected: {
  tasks: "e5375e57f8ab42417c0e14732fb85e6adf9aab64139e5e84578e77867aeee14d",
  clusters: "5c1584c8aee9d2d87a8f69d2f6c94d98c7107286b4c7d57548e6758fc57a4702",
  correction: "0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64",
  static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
  truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
  },
} as const;
const EXPECTED = config.expected;
const taskPath = join(import.meta.dirname, "results", config.taskFile);
const outputBase = resolve(process.env.HUNCH_FILE_CLUSTER_OUT
  ?? join(import.meta.dirname, "results", config.outputName));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function assertHash(path: string, expected: string): void {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
}
assertHash(taskPath, EXPECTED.tasks);
assertHash(resolve(import.meta.dirname, "../../src/core/declarationClusters.ts"), EXPECTED.clusters);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.correction);
assertHash(resolve(import.meta.dirname, "../../src/core/pipeline.ts"), EXPECTED.static_ranker);
assertHash(join(import.meta.dirname, "evaluate-zod-owner-ranker.ts"), EXPECTED.truth_mapper);

function git(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });
}

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

// Phase 1: issue text and pre-fix source only. No fixing diff or post-fix file
// is opened until the complete prediction set and receipt set are on disk.
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
  };
  process.stderr.write(`[freeze ${index + 1}/${tasks.cases.length}] ${entry.id}: files=${prediction.file_first_declaration_clusters.files.length} receipt=${prediction.file_first_declaration_clusters.receipt.receipt_id}\n`);
  return prediction;
});
const predictionHash = sha256(JSON.stringify(predictions));
const receiptHash = sha256(JSON.stringify(predictions.map((prediction) =>
  prediction.file_first_declaration_clusters.receipt)));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({
  benchmark: tasks.benchmark,
  freeze_boundary: "written-before-post-fix-source-or-fixing-diff-was-opened",
  hashes: { ...EXPECTED, predictions: predictionHash, receipts: receiptHash },
  predictions,
}, null, 2)}\n`);

function gitFile(sha: string, path: string): string | null {
  const result = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

function truthFor(preFix: string, fixSha: string): { paths: string[]; symbols: string[] } {
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha, "--", "packages/zod/src/v4"])
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

const ownerPath = (owner: string): string => owner.split("::")[0]!;

// Phase 2: the frozen prediction file now exists; derive ground truth.
const rows = predictions.map((prediction, index) => {
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const clusterOwners = prediction.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner)));
  const selectedFiles = prediction.file_first_declaration_clusters.files.map((file) => file.path);
  const baselineHit = prediction.baseline_top5.some((owner) => truth.symbols.includes(owner));
  const clusterHit = clusterOwners.some((owner) => truth.symbols.includes(owner));
  const baselineFile = prediction.baseline_top5.some((owner) => truth.paths.includes(ownerPath(owner)));
  const clusterFile = selectedFiles.some((path) => truth.paths.includes(path));
  process.stderr.write(`[score ${index + 1}/${predictions.length}] ${prediction.id}: scorable=${truth.symbols.length > 0} baseline=${baselineHit} cluster=${clusterHit}\n`);
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    baseline_hit: baselineHit,
    cluster_hit: clusterHit,
    combined_hit: baselineHit || clusterHit,
    cluster_rescue: !baselineHit && clusterHit,
    cluster_loss: baselineHit && !clusterHit,
    baseline_file: baselineFile,
    cluster_file: clusterFile,
    cluster_families: prediction.file_first_declaration_clusters.files.reduce((sum, file) =>
      sum + file.declaration_clusters.length, 0),
    inspected_declarations: new Set(clusterOwners).size,
  };
});
const scorable = rows.filter((row) => row.symbol_scorable);
const baselineHits = scorable.filter((row) => row.baseline_hit).length;
const clusterHits = scorable.filter((row) => row.cluster_hit).length;
const combinedHits = scorable.filter((row) => row.combined_hit).length;
const clusterFiles = scorable.filter((row) => row.cluster_file).length;
const rescues = scorable.filter((row) => row.cluster_rescue).length;
const inspected = scorable.map((row) => row.inspected_declarations);
const averageInspected = inspected.length ? inspected.reduce((sum, value) => sum + value, 0) / inspected.length : null;
const maxInspected = inspected.length ? Math.max(...inspected) : null;
const receiptsComplete = scorable.every((row) => {
  const receipt = row.file_first_declaration_clusters.receipt;
  return /^[a-f0-9]{24}$/.test(receipt.receipt_id)
    && receipt.flat_shortlist_preserved
    && receipt.exact_owner_enabled === false
    && (transferVersion === "v1" || receipt.file_selection_strategy === "flat-shortlist-file-anchor");
});
const baselineRate = scorable.length ? baselineHits / scorable.length : null;
const clusterRate = scorable.length ? clusterHits / scorable.length : null;
const fileRate = scorable.length ? clusterFiles / scorable.length : null;
const baselineFileHits = scorable.filter((row) => row.baseline_file).length;
const v1Promoted = scorable.length >= 8
  && clusterRate !== null && clusterRate >= 0.7
  && baselineRate !== null && clusterRate >= baselineRate
  && rescues >= 2
  && fileRate !== null && fileRate >= 0.75
  && combinedHits >= baselineHits
  && receiptsComplete
  && averageInspected !== null && averageInspected <= 30
  && maxInspected !== null && maxInspected <= 36;
const v2Promoted = scorable.length >= 8
  && clusterRate !== null && clusterRate >= 0.7
  && baselineRate !== null && clusterRate >= baselineRate
  && rescues >= 2
  && combinedHits - baselineHits >= 2
  && clusterFiles >= baselineFileHits
  && combinedHits >= baselineHits
  && receiptsComplete
  && averageInspected !== null && averageInspected <= 24
  && maxInspected !== null && maxInspected <= 30;
const combinedRate = scorable.length ? combinedHits / scorable.length : null;
const combinedImprovement = scorable.length ? (combinedHits - baselineHits) / scorable.length : null;
const v3Promoted = scorable.length >= 8
  && combinedRate !== null && combinedRate >= 0.5
  && combinedImprovement !== null && combinedImprovement >= 0.15
  && combinedHits - baselineHits >= 2
  && rescues >= 2
  && clusterFiles >= baselineFileHits
  && receiptsComplete
  && averageInspected !== null && averageInspected <= 24
  && maxInspected !== null && maxInspected <= 30;
const promoted = transferVersion === "v3" ? v3Promoted : transferVersion === "v2" ? v2Promoted : v1Promoted;
const summary = {
  tasks: rows.length,
  scorable_tasks: scorable.length,
  baseline_top5_hits: baselineHits,
  baseline_top5_rate: baselineRate,
  cluster_hits: clusterHits,
  cluster_rate: clusterRate,
  combined_hits: combinedHits,
  combined_rate: combinedRate,
  combined_improvement_points: combinedImprovement,
  cluster_rescues: rescues,
  cluster_losses: scorable.filter((row) => row.cluster_loss).length,
  baseline_file_hits: baselineFileHits,
  cluster_file_hits: clusterFiles,
  cluster_file_rate: fileRate,
  average_inspected_declarations: averageInspected,
  max_inspected_declarations: maxInspected,
  receipts_complete: receiptsComplete,
  flat_shortlist_preserved: scorable.every((row) => row.file_first_declaration_clusters.receipt.flat_shortlist_preserved),
  decision: `${promoted ? "promote" : "reject"}-${config.decisionName}`,
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "Predictions and deterministic receipts were frozen from issue text and pre-fix source before any fixing diff or post-fix source was opened. Cluster coverage has an explicitly larger inspection budget than the flat top five.",
  hashes: { ...EXPECTED, predictions: predictionHash, receipts: receiptHash },
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);

const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  `# ${config.title}`,
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Baseline top five: ${summary.baseline_top5_hits}/${summary.scorable_tasks} (${pct(summary.baseline_top5_rate)})`,
  `- Supplemental cluster families: ${summary.cluster_hits}/${summary.scorable_tasks} (${pct(summary.cluster_rate)})`,
  `- Combined preserved-top-five plus clusters: ${summary.combined_hits}/${summary.scorable_tasks} (${pct(summary.combined_rate)})`,
  `- Combined improvement over the flat top five: ${pct(summary.combined_improvement_points)} points`,
  `- Cluster rescues/losses relative to top five: ${summary.cluster_rescues}/${summary.cluster_losses}`,
  `- Baseline/cluster file coverage: ${summary.baseline_file_hits}/${summary.cluster_file_hits} (${pct(summary.cluster_file_rate)} cluster)`,
  `- Cluster inspection budget, average/max declarations: ${summary.average_inspected_declarations?.toFixed(1) ?? "n/a"}/${summary.max_inspected_declarations ?? "n/a"}`,
  `- Receipts complete and flat shortlist preserved: ${summary.receipts_complete ? "yes" : "no"}`,
  `- Exact-owner output: ${summary.exact_owner_policy}`,
  "",
  transferVersion !== "v1"
    ? "The cluster percentage is not a top-five accuracy number: it measures a bounded hierarchical view anchored to up to five flat-shortlist files, with two families and three declarations per file."
    : "The cluster percentage is not a top-five accuracy number: it measures a bounded hierarchical view with up to four files, three families per file, and three declarations per family.",
  "",
  "| case | scorable | top five | clusters | rescue | file | declarations | receipt | truth |",
  "|---|:---:|:---:|:---:|:---:|:---:|---:|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.symbol_scorable ? "yes" : "no"} | ${row.baseline_hit ? "hit" : "miss"} | ${row.cluster_hit ? "hit" : "miss"} | ${row.cluster_rescue ? "yes" : "no"} | ${row.cluster_file ? "yes" : "no"} | ${row.inspected_declarations} | \`${row.file_first_declaration_clusters.receipt.receipt_id}\` | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  `Receipt-set SHA-256: \`${receiptHash}\`.`,
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary, hashes: result.hashes }, null, 2)}\n`);
