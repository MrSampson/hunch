/** Blind cross-repository transfer for the two-slot additive file frontier.
 * Predictions are persisted before labels are opened. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { FileFirstDeclarationDiagnostic, ProgressiveDeclarationPlan } from "../../src/core/declarationClusters.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { buildFileFrontierPlan } from "./file-frontier-expansion.js";
import { buildAdditiveFrontierVariants } from "./hybrid-frontier-expansion.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";

interface TransferCase { id: string; fix_sha: string; issue: string }
interface TaskFile { benchmark: string; repository: string; selection: string; cases: TransferCase[] }
interface FrozenPrediction {
  id: string;
  fix_sha: string;
  pre_fix_sha: string;
  case_hash: string;
  baseline_top5: string[];
  clusters: FileFirstDeclarationDiagnostic;
  promoted_plan: ProgressiveDeclarationPlan;
  additive_plan: { added_frontier_slots: number; owners: string[]; receipt_id: string };
}

const EXPECTED = {
  tasks: "18d5bceeb0290dc56cbaac281103f677c0e1ed51970048ed78bebdee02807b5f",
  additive_rule: "bfb4b9093b0ed27942069e6bb790c92e47e4835baf8709d4c48754eda0a19351",
  frontier_rule: "4825e4c91d3fb6e25584297351bd2ec2d545fca7bd9c64becdb2f3338ed185f2",
  declaration_clusters: "4254e044bde84287aa8ac399e81ae3bdeaddd1d6bc1ce4b340c8b84040347f95",
  correction_stage: "2cf306fd2cb4814ad5ec5f3ca6ac79e946f0aad8e180626130559758523d942a",
  static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
  truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
} as const;
const resultDir = join(import.meta.dirname, "results");
const taskPath = join(resultDir, "2026-08-25-additive-frontier-transfer-v5.tasks.json");
const outputBase = resolve(process.env.HUNCH_ADDITIVE_FRONTIER_OUT
  ?? join(resultDir, "2026-08-25-additive-frontier-transfer-v5"));
const repo = resolve(process.env.HUNCH_ARKTYPE_BENCH_REPO ?? "../arktype-bench");
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const assertHash = (path: string, expected: string): void => {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
};
assertHash(taskPath, EXPECTED.tasks);
assertHash(join(import.meta.dirname, "hybrid-frontier-expansion.ts"), EXPECTED.additive_rule);
assertHash(join(import.meta.dirname, "file-frontier-expansion.ts"), EXPECTED.frontier_rule);
assertHash(resolve(import.meta.dirname, "../../src/core/declarationClusters.ts"), EXPECTED.declaration_clusters);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.correction_stage);
assertHash(resolve(import.meta.dirname, "../../src/core/pipeline.ts"), EXPECTED.static_ranker);
assertHash(join(import.meta.dirname, "evaluate-zod-owner-ranker.ts"), EXPECTED.truth_mapper);
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;

function git(args: string[], maxBuffer = 128 * 1024 * 1024): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer });
}
function eligible(path: string): boolean {
  return /\.tsx?$/.test(path)
    && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.tsx?$/.test(path);
}
function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha]).split("\n").filter(eligible)
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

// Phase 1: issue-only candidate lists and receipts are on disk before truth.
const predictions: FrozenPrediction[] = tasks.cases.map((entry, index) => {
  const preFix = git(["rev-parse", `${entry.fix_sha}^1`]).trim();
  const sources = sourcesAt(preFix);
  const diagnostic = diagnoseIssueCorrectionStage(entry.issue, sources, 5);
  const promotedOwners = diagnostic.progressive_inspection.candidates.map((candidate) => candidate.owner);
  const frontier = buildFileFrontierPlan(entry.issue, sources);
  const additive = buildAdditiveFrontierVariants(
    promotedOwners,
    frontier.frontier.map((candidate) => candidate.owner),
  ).find((variant) => variant.added_frontier_slots === 2)!;
  const prediction = {
    id: entry.id,
    fix_sha: entry.fix_sha,
    pre_fix_sha: preFix,
    case_hash: sha256(JSON.stringify(entry)),
    baseline_top5: diagnostic.candidates.map((candidate) => candidate.owner),
    clusters: diagnostic.file_first_declaration_clusters,
    promoted_plan: diagnostic.progressive_inspection,
    additive_plan: additive,
  };
  process.stderr.write(`[freeze ${index + 1}/${tasks.cases.length}] ${entry.id}: ${promotedOwners.length}->${additive.owners.length} receipt=${additive.receipt_id}\n`);
  return prediction;
});
const predictionHash = sha256(JSON.stringify(predictions));
const receiptHash = sha256(JSON.stringify(predictions.map((prediction) => prediction.additive_plan.receipt_id)));
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
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha]).split("\n").filter(eligible);
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
// Phase 2 starts only after the complete prediction artifact was written.
const rows = predictions.map((prediction, index) => {
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const promotedOwners = prediction.promoted_plan.candidates.map((candidate) => candidate.owner);
  const additiveOwners = prediction.additive_plan.owners;
  const clusterOwners = prediction.clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner)));
  const fullClusterUnion = [...new Set([...prediction.baseline_top5, ...clusterOwners])];
  const hit = (owners: string[]): boolean => owners.some((owner) => truth.symbols.includes(owner));
  const promotedHit = hit(promotedOwners);
  const additiveHit = hit(additiveOwners);
  const topFiles = new Set(prediction.baseline_top5.map(ownerPath));
  const appended = additiveOwners.slice(promotedOwners.length);
  const promotedPreserved = promotedOwners.every((owner, ownerIndex) => additiveOwners[ownerIndex] === owner);
  const baselinePreserved = prediction.baseline_top5.every((owner, ownerIndex) => promotedOwners[ownerIndex] === owner);
  process.stderr.write(`[score ${index + 1}/${predictions.length}] ${prediction.id}: scorable=${truth.symbols.length > 0} promoted=${promotedHit} additive=${additiveHit}\n`);
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    baseline_hit: hit(prediction.baseline_top5),
    promoted_hit: promotedHit,
    additive_hit: additiveHit,
    additive_rescue: !promotedHit && additiveHit,
    loss_against_promoted: promotedHit && !additiveHit,
    baseline_preserved: baselinePreserved,
    promoted_preserved: promotedPreserved,
    appended_same_file_only: appended.every((owner) => topFiles.has(ownerPath(owner))),
    inspected_declarations: new Set(additiveOwners).size,
    full_cluster_declarations: new Set(fullClusterUnion).size,
  };
});
const scorable = rows.filter((row) => row.symbol_scorable);
const average = (values: number[]): number | null => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;
const inspected = scorable.map((row) => row.inspected_declarations);
const fullInspected = scorable.map((row) => row.full_cluster_declarations);
const averageInspected = average(inspected);
const averageFull = average(fullInspected);
const inspectionReduction = averageInspected !== null && averageFull !== null && averageFull > 0
  ? 1 - averageInspected / averageFull
  : null;
const promotedHits = scorable.filter((row) => row.promoted_hit).length;
const additiveHits = scorable.filter((row) => row.additive_hit).length;
const rescues = scorable.filter((row) => row.additive_rescue).length;
const losses = scorable.filter((row) => row.loss_against_promoted).length;
const receiptsComplete = rows.every((row) => /^[a-f0-9]{24}$/.test(row.additive_plan.receipt_id)
  && row.promoted_plan.receipt.rejected_rerankers_disabled
  && row.promoted_plan.receipt.exact_owner_enabled === false);
const promoted = scorable.length >= 8
  && rows.every((row) => row.baseline_preserved && row.promoted_preserved && row.appended_same_file_only)
  && additiveHits >= promotedHits
  && rescues >= 1
  && losses === 0
  && Math.max(...inspected) <= 13
  && inspectionReduction !== null && inspectionReduction >= 0.20
  && receiptsComplete;
const summary = {
  tasks: rows.length,
  scorable_tasks: scorable.length,
  baseline_top5_hits: scorable.filter((row) => row.baseline_hit).length,
  promoted_plan_hits: promotedHits,
  additive_plan_hits: additiveHits,
  additive_rescues: rescues,
  losses_against_promoted: losses,
  average_inspected_declarations: averageInspected,
  max_inspected_declarations: Math.max(...inspected),
  average_full_cluster_declarations: averageFull,
  inspection_reduction: inspectionReduction,
  baseline_and_promoted_preserved: rows.every((row) => row.baseline_preserved && row.promoted_preserved),
  appended_same_file_only: rows.every((row) => row.appended_same_file_only),
  receipts_complete: receiptsComplete,
  decision: promoted ? "promote-additive-frontier-v5" : "reject-additive-frontier-v5",
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "Issue-only predictions and deterministic receipts were frozen from ArkType pre-fix parents before any fixing diff or post-fix source was opened.",
  hashes: { ...EXPECTED, predictions: predictionHash, receipts: receiptHash },
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  "# Additive same-file frontier cross-repository transfer v5",
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Scorable tasks: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Baseline / promoted / additive hits: ${summary.baseline_top5_hits}/${summary.promoted_plan_hits}/${summary.additive_plan_hits}`,
  `- Additive rescues / losses: ${summary.additive_rescues}/${summary.losses_against_promoted}`,
  `- Additive average / max declarations: ${summary.average_inspected_declarations?.toFixed(1) ?? "n/a"}/${summary.max_inspected_declarations}`,
  `- Full-cluster average declarations: ${summary.average_full_cluster_declarations?.toFixed(1) ?? "n/a"}`,
  `- Inspection reduction: ${pct(summary.inspection_reduction)}`,
  `- Prior order preserved / same-file tail / receipts complete: ${summary.baseline_and_promoted_preserved ? "yes" : "no"}/${summary.appended_same_file_only ? "yes" : "no"}/${summary.receipts_complete ? "yes" : "no"}`,
  `- Exact-owner output: ${summary.exact_owner_policy}`,
  "",
  "| case | scorable | promoted | additive | rescue | declarations | receipt | truth |",
  "|---|:---:|:---:|:---:|:---:|---:|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.symbol_scorable ? "yes" : "no"} | ${row.promoted_hit ? "hit" : "miss"} | ${row.additive_hit ? "hit" : "miss"} | ${row.additive_rescue ? "yes" : "no"} | ${row.inspected_declarations}/${row.full_cluster_declarations} | \`${row.additive_plan.receipt_id}\` | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  `Receipt-set SHA-256: \`${receiptHash}\`.`,
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary, hashes: result.hashes }, null, 2)}\n`);
