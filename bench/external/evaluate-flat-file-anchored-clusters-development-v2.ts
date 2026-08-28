/** Development-only replay for the baseline-file-anchored cluster design. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface RevealedCase {
  cohort: string;
  id: string;
  issue: string;
  pre_fix_sha: string;
  baseline_top5: string[];
  ground_truth: { paths: string[]; symbols: string[] };
}

const bridgePaths = [
  join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1.json"),
  join(import.meta.dirname, "results", "2026-08-25-evidence-file-reserve-transfer-v2.json"),
  join(import.meta.dirname, "results", "2026-08-25-guarded-evidence-bridge-transfer-v3.json"),
];
const clusterTransfers = [
  {
    result: join(import.meta.dirname, "results", "2026-08-25-file-first-declaration-clusters-transfer-v1.json"),
    tasks: join(import.meta.dirname, "results", "2026-08-25-file-first-declaration-clusters-transfer-v1.tasks.json"),
  },
  {
    result: join(import.meta.dirname, "results", "2026-08-25-flat-file-anchored-clusters-transfer-v2.json"),
    tasks: join(import.meta.dirname, "results", "2026-08-25-flat-file-anchored-clusters-transfer-v2.tasks.json"),
  },
];
const outputPath = resolve(join(import.meta.dirname, "results", "2026-08-25-flat-file-anchored-clusters-development-v3.json"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const bridgeCases: RevealedCase[] = bridgePaths.flatMap((path) => {
  const data = JSON.parse(readFileSync(path, "utf8")) as { benchmark: string; rows: Array<{
    id: string; authenticated: boolean; pre_fix_sha: string; baseline_top5: string[];
    verified_evidence_receipt: { claim: string }; ground_truth: { paths: string[]; symbols: string[] };
  }> };
  return data.rows.filter((row) => row.authenticated && row.ground_truth.symbols.length > 0).map((row) => ({
    cohort: data.benchmark,
    id: row.id,
    issue: row.verified_evidence_receipt.claim,
    pre_fix_sha: row.pre_fix_sha,
    baseline_top5: row.baseline_top5,
    ground_truth: row.ground_truth,
  }));
});
const freshCases: RevealedCase[] = clusterTransfers.flatMap((paths) => {
  const result = JSON.parse(readFileSync(paths.result, "utf8")) as { benchmark: string; rows: Array<{
    id: string; symbol_scorable: boolean; pre_fix_sha: string; baseline_top5: string[];
    ground_truth: { paths: string[]; symbols: string[] };
  }> };
  const issueById = new Map((JSON.parse(readFileSync(paths.tasks, "utf8")) as {
    cases: Array<{ id: string; issue: string }>;
  }).cases.map((entry) => [entry.id, entry.issue]));
  return result.rows.filter((row) => row.symbol_scorable).map((row) => ({
    cohort: result.benchmark,
    id: row.id,
    issue: issueById.get(row.id)!,
    pre_fix_sha: row.pre_fix_sha,
    baseline_top5: row.baseline_top5,
    ground_truth: row.ground_truth,
  }));
});
const cases = [...bridgeCases, ...freshCases];

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const evaluated = cases.map((entry, index) => {
  const diagnostic = diagnoseIssueCorrectionStage(entry.issue, sourcesAt(entry.pre_fix_sha), 5);
  const clustered = diagnostic.file_first_declaration_clusters;
  const owners = clustered.files.flatMap((file) => file.declaration_clusters.flatMap((cluster) =>
    cluster.members.map((member) => member.owner)));
  const baselineHit = entry.baseline_top5.some((owner) => entry.ground_truth.symbols.includes(owner));
  const clusterHit = owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  process.stderr.write(`[develop ${index + 1}/${cases.length}] ${entry.id}: baseline=${baselineHit} cluster=${clusterHit}\n`);
  return {
    cohort: entry.cohort,
    id: entry.id,
    baseline_hit: baselineHit,
    cluster_hit: clusterHit,
    combined_hit: baselineHit || clusterHit,
    rescue: !baselineHit && clusterHit,
    cluster_loss: baselineHit && !clusterHit,
    selected_files: clustered.files.map((file) => file.path),
    inspected_declarations: new Set(owners).size,
    receipt: clustered.receipt,
    truth: entry.ground_truth,
  };
});

function summarize(rows: typeof evaluated): object {
  return {
    cases: rows.length,
    baseline_hits: rows.filter((row) => row.baseline_hit).length,
    cluster_hits: rows.filter((row) => row.cluster_hit).length,
    combined_hits: rows.filter((row) => row.combined_hit).length,
    rescues: rows.filter((row) => row.rescue).length,
    cluster_losses: rows.filter((row) => row.cluster_loss).length,
    average_inspected_declarations: rows.reduce((sum, row) => sum + row.inspected_declarations, 0) / rows.length,
    max_inspected_declarations: Math.max(...rows.map((row) => row.inspected_declarations)),
    receipts_complete: rows.every((row) => /^[a-f0-9]{24}$/.test(row.receipt.receipt_id)),
  };
}
const cohorts = [...new Set(evaluated.map((row) => row.cohort))];
const output = {
  benchmark: "flat-file-anchored-clusters-development-v3",
  evidence_status: "development-only-all-revealed-bridge-and-cluster-v1-v2-cases",
  methodology: "V3 preserves distinct files represented by the flat top five, exposes three semantic declaration families with two members per file, keys families by their leading distinctive term, and retains the flat shortlist separately.",
  input_sha256: [...bridgePaths, ...clusterTransfers.flatMap((paths) => [paths.result, paths.tasks])].map((path) =>
    createHash("sha256").update(readFileSync(path)).digest("hex")),
  summary: summarize(evaluated),
  by_cohort: Object.fromEntries(cohorts.map((cohort) => [cohort, summarize(evaluated.filter((row) => row.cohort === cohort))])),
  rows: evaluated,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary: output.summary, by_cohort: output.by_cohort }, null, 2)}\n`);
