/** Development-only replay of one-hop relationship expansion on revealed v4. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { buildFileFrontierPlan } from "./file-frontier-expansion.js";
import { buildRelationshipExpandedPlan } from "./relationship-expansion.js";

const results = join(import.meta.dirname, "results");
const taskPath = join(results, "2026-08-25-progressive-inspection-transfer-v4.tasks.json");
const resultPath = join(results, "2026-08-25-progressive-inspection-transfer-v4.json");
const outputPath = join(results, "2026-08-25-relationship-expansion-development-v5.json");
const repo = resolve(process.env.HUNCH_ARKTYPE_BENCH_REPO ?? "../arktype-bench");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as { cases: Array<{ id: string; issue: string }> };
const revealed = JSON.parse(readFileSync(resultPath, "utf8")) as { rows: Array<{
  id: string; pre_fix_sha: string; symbol_scorable: boolean; baseline_hit: boolean; progressive_hit: boolean;
  ground_truth: { paths: string[]; symbols: string[] };
}> };
const issueById = new Map(tasks.cases.map((entry) => [entry.id, entry.issue]));
const git = (args: string[]): string => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
const eligible = (path: string): boolean => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.(?:test|spec)\.tsx?$/.test(path);
function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha]).split("\n").filter(eligible)
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const rows = revealed.rows.filter((row) => row.symbol_scorable).map((entry, index) => {
  const sources = sourcesAt(entry.pre_fix_sha);
  const plan = buildRelationshipExpandedPlan(issueById.get(entry.id)!, sources);
  const frontier = buildFileFrontierPlan(issueById.get(entry.id)!, sources);
  const hit = plan.owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  const frontierHit = frontier.owners.some((owner) => entry.ground_truth.symbols.includes(owner));
  process.stderr.write(`[develop ${index + 1}/${revealed.rows.length}] ${entry.id}: old=${entry.progressive_hit} relationship=${hit} frontier=${frontierHit}\n`);
  return {
    id: entry.id,
    baseline_hit: entry.baseline_hit,
    old_progressive_hit: entry.progressive_hit,
    relationship_hit: hit,
    file_frontier_hit: frontierHit,
    rescue_over_baseline: !entry.baseline_hit && hit,
    rescue_over_old_plan: !entry.progressive_hit && hit,
    loss_against_old_plan: entry.progressive_hit && !hit,
    file_frontier_rescue_over_baseline: !entry.baseline_hit && frontierHit,
    file_frontier_rescue_over_old_plan: !entry.progressive_hit && frontierHit,
    file_frontier_loss_against_old_plan: entry.progressive_hit && !frontierHit,
    owners: plan.owners,
    relationships: plan.candidates,
    receipt_id: plan.receipt_id,
    file_frontier_owners: frontier.owners,
    file_frontier: frontier.frontier,
    file_frontier_receipt_id: frontier.receipt_id,
    truth: entry.ground_truth,
  };
});
const output = {
  benchmark: "relationship-expansion-development-v5",
  evidence_status: "development-only-v4-labels-revealed-before-rule",
  summary: {
    cases: rows.length,
    baseline_hits: rows.filter((row) => row.baseline_hit).length,
    old_progressive_hits: rows.filter((row) => row.old_progressive_hit).length,
    relationship_hits: rows.filter((row) => row.relationship_hit).length,
    file_frontier_hits: rows.filter((row) => row.file_frontier_hit).length,
    rescues_over_baseline: rows.filter((row) => row.rescue_over_baseline).length,
    rescues_over_old_plan: rows.filter((row) => row.rescue_over_old_plan).length,
    losses_against_old_plan: rows.filter((row) => row.loss_against_old_plan).length,
    file_frontier_rescues_over_baseline: rows.filter((row) => row.file_frontier_rescue_over_baseline).length,
    file_frontier_rescues_over_old_plan: rows.filter((row) => row.file_frontier_rescue_over_old_plan).length,
    file_frontier_losses_against_old_plan: rows.filter((row) => row.file_frontier_loss_against_old_plan).length,
    average_inspected_declarations: rows.reduce((sum, row) => sum + row.owners.length, 0) / rows.length,
    receipts_complete: rows.every((row) => /^[a-f0-9]{24}$/.test(row.receipt_id)),
    file_frontier_receipts_complete: rows.every((row) => /^[a-f0-9]{24}$/.test(row.file_frontier_receipt_id)),
  },
  hashes: {
    tasks: createHash("sha256").update(readFileSync(taskPath)).digest("hex"),
    revealed_result: createHash("sha256").update(readFileSync(resultPath)).digest("hex"),
    relationship_rule: createHash("sha256").update(readFileSync(join(import.meta.dirname, "relationship-expansion.ts"))).digest("hex"),
    file_frontier_rule: createHash("sha256").update(readFileSync(join(import.meta.dirname, "file-frontier-expansion.ts"))).digest("hex"),
  },
  rows,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary: output.summary, hashes: output.hashes }, null, 2)}\n`);
