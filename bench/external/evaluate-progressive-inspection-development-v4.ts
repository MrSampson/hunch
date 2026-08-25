/** Development replay for the promoted-only progressive inspection plan.
 * Every case in this file is already revealed; this may tune the budget but
 * can never serve as transfer evidence.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface TaskCase { id: string; issue: string }
interface RevealedRow {
  id: string;
  pre_fix_sha: string;
  symbol_scorable: boolean;
  ground_truth: { paths: string[]; symbols: string[] };
}

const cohorts = [
  "2026-08-25-file-first-declaration-clusters-transfer-v1",
  "2026-08-25-flat-file-anchored-clusters-transfer-v2",
  "2026-08-25-flat-file-anchored-clusters-transfer-v3",
];
const results = join(import.meta.dirname, "results");
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const outputPath = join(results, "2026-08-25-progressive-inspection-development-v4.json");
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const rows = cohorts.flatMap((cohort) => {
  const taskPath = join(results, `${cohort}.tasks.json`);
  const resultPath = join(results, `${cohort}.json`);
  const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as { cases: TaskCase[] };
  const result = JSON.parse(readFileSync(resultPath, "utf8")) as { rows: RevealedRow[] };
  const issueById = new Map(tasks.cases.map((entry) => [entry.id, entry.issue]));
  return result.rows.filter((row) => row.symbol_scorable).map((row) => ({
    cohort,
    ...row,
    issue: issueById.get(row.id)!,
  }));
});

const evaluated = rows.map((entry, index) => {
  const diagnostic = diagnoseIssueCorrectionStage(entry.issue, sourcesAt(entry.pre_fix_sha), 5);
  const baseline = diagnostic.candidates.map((candidate) => candidate.owner);
  const progressive = diagnostic.progressive_inspection.candidates.map((candidate) => candidate.owner);
  const throughTen = diagnostic.progressive_inspection.candidates
    .filter((candidate) => candidate.inspection_rank <= 10)
    .map((candidate) => candidate.owner);
  const fullClusters = diagnostic.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner)));
  const hit = (owners: string[]): boolean => owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  const baselineHit = hit(baseline);
  const progressiveHit = hit(progressive);
  const fullUnionHit = baselineHit || hit(fullClusters);
  process.stderr.write(`[develop ${index + 1}/${rows.length}] ${entry.id}: baseline=${baselineHit} progressive=${progressiveHit} full=${fullUnionHit}\n`);
  return {
    cohort: entry.cohort,
    id: entry.id,
    baseline_hit: baselineHit,
    through_ten_hit: hit(throughTen),
    progressive_hit: progressiveHit,
    full_cluster_union_hit: fullUnionHit,
    rescue: !baselineHit && progressiveHit,
    loss_against_full_union: fullUnionHit && !progressiveHit,
    inspected_declarations: new Set(progressive).size,
    full_cluster_declarations: new Set(fullClusters).size,
    receipt: diagnostic.progressive_inspection.receipt,
    truth: entry.ground_truth,
  };
});

function summarize(items: typeof evaluated): object {
  const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
  const progressiveAverage = average(items.map((row) => row.inspected_declarations));
  const fullAverage = average(items.map((row) => row.full_cluster_declarations));
  return {
    cases: items.length,
    baseline_hits: items.filter((row) => row.baseline_hit).length,
    through_ten_hits: items.filter((row) => row.through_ten_hit).length,
    progressive_hits: items.filter((row) => row.progressive_hit).length,
    full_cluster_union_hits: items.filter((row) => row.full_cluster_union_hit).length,
    progressive_rescues: items.filter((row) => row.rescue).length,
    losses_against_full_union: items.filter((row) => row.loss_against_full_union).length,
    average_inspected_declarations: progressiveAverage,
    max_inspected_declarations: Math.max(...items.map((row) => row.inspected_declarations)),
    previous_average_cluster_declarations: fullAverage,
    inspection_reduction: 1 - progressiveAverage / fullAverage,
    receipts_complete: items.every((row) => /^[a-f0-9]{24}$/.test(row.receipt.receipt_id)
      && row.receipt.flat_shortlist_preserved
      && row.receipt.rejected_rerankers_disabled
      && row.receipt.exact_owner_enabled === false),
  };
}

const output = {
  benchmark: "progressive-inspection-development-v4",
  evidence_status: "development-only-all-36-cases-revealed-before-rule-lock",
  methodology: "Replay the two promoted mechanisms as a progressive queue: preserve the flat five, add the strongest declarations only from already-selected semantic families through rank ten, allow one final fallback at rank eleven, and disable every reranker rejected by fresh transfer.",
  hashes: {
    inputs: cohorts.map((cohort) => ({
      cohort,
      tasks: sha256(readFileSync(join(results, `${cohort}.tasks.json`))),
      result: sha256(readFileSync(join(results, `${cohort}.json`))),
    })),
    declaration_clusters: sha256(readFileSync(resolve(import.meta.dirname, "../../src/core/declarationClusters.ts"))),
    correction_stage: sha256(readFileSync(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"))),
  },
  summary: summarize(evaluated),
  by_cohort: Object.fromEntries(cohorts.map((cohort) => [cohort, summarize(evaluated.filter((row) => row.cohort === cohort))])),
  rows: evaluated,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary: output.summary, by_cohort: output.by_cohort, hashes: output.hashes }, null, 2)}\n`);
