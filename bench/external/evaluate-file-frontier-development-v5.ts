/** Development-only replay of the flat-file frontier on all 48 revealed cases. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { buildFileFrontierPlan } from "./file-frontier-expansion.js";
import { buildAdditiveFrontierVariants, buildHybridFrontierVariants } from "./hybrid-frontier-expansion.js";

interface DevelopmentCase {
  cohort: string;
  repository: "zod" | "arktype";
  id: string;
  issue: string;
  pre_fix_sha: string;
  prior_progressive_hit: boolean;
  ground_truth: { paths: string[]; symbols: string[] };
}
const results = join(import.meta.dirname, "results");
const zodCohorts = [
  "2026-08-25-file-first-declaration-clusters-transfer-v1",
  "2026-08-25-flat-file-anchored-clusters-transfer-v2",
  "2026-08-25-flat-file-anchored-clusters-transfer-v3",
];
const cases: DevelopmentCase[] = zodCohorts.flatMap((cohort) => {
  const tasks = JSON.parse(readFileSync(join(results, `${cohort}.tasks.json`), "utf8")) as { cases: Array<{ id: string; issue: string }> };
  const result = JSON.parse(readFileSync(join(results, `${cohort}.json`), "utf8")) as { rows: Array<{
    id: string; pre_fix_sha: string; symbol_scorable: boolean; baseline_hit: boolean; cluster_hit: boolean;
    ground_truth: { paths: string[]; symbols: string[] };
  }> };
  const issueById = new Map(tasks.cases.map((entry) => [entry.id, entry.issue]));
  return result.rows.filter((row) => row.symbol_scorable).map((row) => ({
    cohort,
    repository: "zod" as const,
    id: row.id,
    issue: issueById.get(row.id)!,
    pre_fix_sha: row.pre_fix_sha,
    prior_progressive_hit: row.baseline_hit || row.cluster_hit,
    ground_truth: row.ground_truth,
  }));
});
{
  const cohort = "2026-08-25-progressive-inspection-transfer-v4";
  const tasks = JSON.parse(readFileSync(join(results, `${cohort}.tasks.json`), "utf8")) as { cases: Array<{ id: string; issue: string }> };
  const result = JSON.parse(readFileSync(join(results, `${cohort}.json`), "utf8")) as { rows: Array<{
    id: string; pre_fix_sha: string; symbol_scorable: boolean; progressive_hit: boolean;
    ground_truth: { paths: string[]; symbols: string[] };
  }> };
  const issueById = new Map(tasks.cases.map((entry) => [entry.id, entry.issue]));
  cases.push(...result.rows.filter((row) => row.symbol_scorable).map((row) => ({
    cohort,
    repository: "arktype" as const,
    id: row.id,
    issue: issueById.get(row.id)!,
    pre_fix_sha: row.pre_fix_sha,
    prior_progressive_hit: row.progressive_hit,
    ground_truth: row.ground_truth,
  })));
}
const repositories = {
  zod: resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench"),
  arktype: resolve(process.env.HUNCH_ARKTYPE_BENCH_REPO ?? "../arktype-bench"),
};
const eligible = (path: string): boolean => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.tsx?$/.test(path);
function sourcesAt(repository: keyof typeof repositories, sha: string): ContractAxisOwnerSource[] {
  const root = repositories[repository];
  const git = (args: string[]): string => execFileSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const sourceScope = repository === "zod" ? ["--", "packages/zod/src/v4"] : [];
  return git(["ls-tree", "-r", "--name-only", sha, ...sourceScope]).split("\n").filter(eligible)
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}
const rows = cases.map((entry, index) => {
  const sources = sourcesAt(entry.repository, entry.pre_fix_sha);
  const plan = buildFileFrontierPlan(entry.issue, sources);
  const builtHybridVariants = buildHybridFrontierVariants(entry.issue, sources);
  const hybridVariants = builtHybridVariants.map((variant) => ({
    cluster_slots: variant.cluster_slots,
    frontier_slots: variant.frontier_slots,
    hit: variant.owners.some((owner) => entry.ground_truth.symbols.includes(owner)),
    inspected_declarations: new Set(variant.owners).size,
    receipt_id: variant.receipt_id,
  }));
  const promotedOwners = builtHybridVariants.find((variant) => variant.cluster_slots === 6)!.owners;
  const additiveVariants = buildAdditiveFrontierVariants(
    promotedOwners,
    plan.frontier.map((candidate) => candidate.owner),
  ).map((variant) => ({
    added_frontier_slots: variant.added_frontier_slots,
    hit: variant.owners.some((owner) => entry.ground_truth.symbols.includes(owner)),
    inspected_declarations: new Set(variant.owners).size,
    receipt_id: variant.receipt_id,
  }));
  const hit = plan.owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  process.stderr.write(`[develop ${index + 1}/${cases.length}] ${entry.id}: ${entry.prior_progressive_hit}->${hit}\n`);
  return {
    cohort: entry.cohort,
    repository: entry.repository,
    id: entry.id,
    prior_progressive_hit: entry.prior_progressive_hit,
    file_frontier_hit: hit,
    rescue: !entry.prior_progressive_hit && hit,
    loss: entry.prior_progressive_hit && !hit,
    inspected_declarations: new Set(plan.owners).size,
    receipt_id: plan.receipt_id,
    hybrid_variants: hybridVariants,
    additive_variants: additiveVariants,
    truth: entry.ground_truth,
  };
});
function summarize(items: typeof rows) {
  return {
    cases: items.length,
    prior_progressive_hits: items.filter((row) => row.prior_progressive_hit).length,
    file_frontier_hits: items.filter((row) => row.file_frontier_hit).length,
    rescues: items.filter((row) => row.rescue).length,
    losses: items.filter((row) => row.loss).length,
    average_inspected_declarations: items.reduce((sum, row) => sum + row.inspected_declarations, 0) / items.length,
    max_inspected_declarations: Math.max(...items.map((row) => row.inspected_declarations)),
    receipts_complete: items.every((row) => /^[a-f0-9]{24}$/.test(row.receipt_id)),
  };
}
const output = {
  benchmark: "file-frontier-development-v5",
  evidence_status: "development-only-all-48-labels-revealed-before-rule-lock",
  methodology: "Preserve the adaptive top five, anchor its distinct files, and spend six supplemental slots on the globally strongest remaining declarations from only those files.",
  summary: summarize(rows),
  hybrid_allocations: Array.from({ length: 7 }, (_, clusterSlots) => {
    const frontierSlots = 6 - clusterSlots;
    const variants = rows.map((row) => row.hybrid_variants.find((variant) => variant.cluster_slots === clusterSlots)!);
    return {
      cluster_slots: clusterSlots,
      frontier_slots: frontierSlots,
      hits: variants.filter((variant) => variant.hit).length,
      rescues: rows.filter((row, index) => !row.prior_progressive_hit && variants[index]!.hit).length,
      losses: rows.filter((row, index) => row.prior_progressive_hit && !variants[index]!.hit).length,
      average_inspected_declarations: variants.reduce((sum, variant) => sum + variant.inspected_declarations, 0) / variants.length,
      max_inspected_declarations: Math.max(...variants.map((variant) => variant.inspected_declarations)),
      receipts_complete: variants.every((variant) => /^[a-f0-9]{24}$/.test(variant.receipt_id)),
    };
  }),
  additive_frontier_allocations: Array.from({ length: 7 }, (_, addedFrontierSlots) => {
    const variants = rows.map((row) => row.additive_variants.find((variant) => variant.added_frontier_slots === addedFrontierSlots)!);
    return {
      promoted_slots: 11,
      added_frontier_slots: addedFrontierSlots,
      total_budget: 11 + addedFrontierSlots,
      hits: variants.filter((variant) => variant.hit).length,
      rescues: rows.filter((row, index) => !row.prior_progressive_hit && variants[index]!.hit).length,
      losses: rows.filter((row, index) => row.prior_progressive_hit && !variants[index]!.hit).length,
      average_inspected_declarations: variants.reduce((sum, variant) => sum + variant.inspected_declarations, 0) / variants.length,
      max_inspected_declarations: Math.max(...variants.map((variant) => variant.inspected_declarations)),
      receipts_complete: variants.every((variant) => /^[a-f0-9]{24}$/.test(variant.receipt_id)),
    };
  }),
  by_cohort: Object.fromEntries([...new Set(rows.map((row) => row.cohort))].map((cohort) => [cohort, summarize(rows.filter((row) => row.cohort === cohort))])),
  hashes: {
    rule: createHash("sha256").update(readFileSync(join(import.meta.dirname, "file-frontier-expansion.ts"))).digest("hex"),
    hybrid_rule: createHash("sha256").update(readFileSync(join(import.meta.dirname, "hybrid-frontier-expansion.ts"))).digest("hex"),
    inputs: [...zodCohorts, "2026-08-25-progressive-inspection-transfer-v4"].map((cohort) => ({
      cohort,
      tasks: createHash("sha256").update(readFileSync(join(results, `${cohort}.tasks.json`))).digest("hex"),
      result: createHash("sha256").update(readFileSync(join(results, `${cohort}.json`))).digest("hex"),
    })),
  },
  rows,
};
const outputPath = join(results, "2026-08-25-file-frontier-development-v5.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary: output.summary, by_cohort: output.by_cohort, hashes: output.hashes }, null, 2)}\n`);
