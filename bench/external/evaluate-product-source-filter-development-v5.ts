/** Development-only replay of the product-source corpus filter on the now
 * revealed ArkType v4 cohort. This cannot provide transfer evidence.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { diagnoseWithProductSourceFilter } from "./product-source-filter.js";

const results = join(import.meta.dirname, "results");
const taskPath = join(results, "2026-08-25-progressive-inspection-transfer-v4.tasks.json");
const resultPath = join(results, "2026-08-25-progressive-inspection-transfer-v4.json");
const outputPath = join(results, "2026-08-25-product-source-filter-development-v5.json");
const repo = resolve(process.env.HUNCH_ARKTYPE_BENCH_REPO ?? "../arktype-bench");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as { cases: Array<{ id: string; issue: string }> };
const revealed = JSON.parse(readFileSync(resultPath, "utf8")) as { rows: Array<{
  id: string;
  pre_fix_sha: string;
  symbol_scorable: boolean;
  baseline_hit: boolean;
  progressive_hit: boolean;
  full_cluster_union_hit: boolean;
  ground_truth: { paths: string[]; symbols: string[] };
}> };
const issueById = new Map(tasks.cases.map((entry) => [entry.id, entry.issue]));
const git = (args: string[]): string => execFileSync("git", ["-C", repo, ...args], {
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
});
const eligible = (path: string): boolean => /\.tsx?$/.test(path)
  && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.tsx?$/.test(path);
function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha]).split("\n").filter(eligible)
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const rows = revealed.rows.filter((row) => row.symbol_scorable).map((entry, index) => {
  const sources = sourcesAt(entry.pre_fix_sha);
  const diagnostic = diagnoseWithProductSourceFilter(issueById.get(entry.id)!, sources, 5);
  const baseline = diagnostic.candidates.map((candidate) => candidate.owner);
  const progressive = diagnostic.progressive_inspection.candidates.map((candidate) => candidate.owner);
  const cluster = diagnostic.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((family) => family.members.map((member) => member.owner)));
  const hit = (owners: string[]): boolean => owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  const baselineHit = hit(baseline);
  const progressiveHit = hit(progressive);
  const fullUnionHit = baselineHit || hit(cluster);
  process.stderr.write(`[develop ${index + 1}/${revealed.rows.length}] ${entry.id}: ${entry.baseline_hit}->${baselineHit} / ${entry.progressive_hit}->${progressiveHit}\n`);
  return {
    id: entry.id,
    old_baseline_hit: entry.baseline_hit,
    new_baseline_hit: baselineHit,
    old_progressive_hit: entry.progressive_hit,
    new_progressive_hit: progressiveHit,
    old_full_union_hit: entry.full_cluster_union_hit,
    new_full_union_hit: fullUnionHit,
    newly_rescued: !entry.progressive_hit && progressiveHit,
    newly_lost: entry.progressive_hit && !progressiveHit,
    supplied_sources: sources.length,
    product_sources: sources.filter((source) => !/(?:^|\/)(?:docs?|playgrounds?|scratch)(?:\/|$)/i.test(source.path)).length,
    baseline_top5: baseline,
    progressive_owners: progressive,
    receipt: diagnostic.progressive_inspection.receipt,
    truth: entry.ground_truth,
  };
});
const output = {
  benchmark: "product-source-filter-development-v5",
  evidence_status: "development-only-v4-labels-revealed-before-filter",
  methodology: "Exclude docs, playground, fixture, benchmark, generated declaration, config, and scratch paths from correction-owner ranking; fail open to the original corpus only if nothing remains.",
  hashes: {
    tasks: createHash("sha256").update(readFileSync(taskPath)).digest("hex"),
    revealed_result: createHash("sha256").update(readFileSync(resultPath)).digest("hex"),
    product_source_filter: createHash("sha256").update(readFileSync(join(import.meta.dirname, "product-source-filter.ts"))).digest("hex"),
  },
  summary: {
    cases: rows.length,
    old_baseline_hits: rows.filter((row) => row.old_baseline_hit).length,
    new_baseline_hits: rows.filter((row) => row.new_baseline_hit).length,
    old_progressive_hits: rows.filter((row) => row.old_progressive_hit).length,
    new_progressive_hits: rows.filter((row) => row.new_progressive_hit).length,
    old_full_union_hits: rows.filter((row) => row.old_full_union_hit).length,
    new_full_union_hits: rows.filter((row) => row.new_full_union_hit).length,
    newly_rescued: rows.filter((row) => row.newly_rescued).length,
    newly_lost: rows.filter((row) => row.newly_lost).length,
    receipts_complete: rows.every((row) => /^[a-f0-9]{24}$/.test(row.receipt.receipt_id)),
  },
  rows,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary: output.summary, hashes: output.hashes }, null, 2)}\n`);
