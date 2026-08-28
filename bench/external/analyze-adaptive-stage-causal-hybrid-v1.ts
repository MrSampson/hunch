/** Development-only allocation analysis over already-generated causal rankings. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";
import type { CausalCorrectionCandidate } from "./adaptive-stage-causal-ranker.js";

interface BaselineRow { id: string; top: AdaptiveCorrectionCandidate[] }
interface CausalRow { id: string; repo: string; top: CausalCorrectionCandidate[]; ground_truth: { symbols: string[] } }
const results = join(import.meta.dirname, "results");
const bases = ["2026-08-25-adaptive-stage-transfer-v1", "2026-08-25-adaptive-stage-confidence-transfer-v2", "2026-08-25-adaptive-stage-view-consensus-transfer-v1"];
const baseline = new Map(bases.flatMap((base) => (JSON.parse(readFileSync(join(results, `${base}.json`), "utf8")) as { rows: BaselineRow[] }).rows).map((row) => [row.id, row.top]));
const causalFile = process.env.HUNCH_CAUSAL_DEVELOPMENT ?? "2026-08-25-adaptive-stage-causal-development-v2.json";
const causal = (JSON.parse(readFileSync(join(results, causalFile), "utf8")) as { rows: CausalRow[] }).rows;
function hybrid(adaptive: AdaptiveCorrectionCandidate[], graph: CausalCorrectionCandidate[], retained: number): Array<AdaptiveCorrectionCandidate | CausalCorrectionCandidate> {
  const output = adaptive.slice(0, retained); const seen = new Set(output.map((candidate) => candidate.owner));
  for (const candidate of graph) {
    if (output.length >= 5) break;
    if (seen.has(candidate.owner)) continue;
    output.push(candidate); seen.add(candidate.owner);
  }
  return output;
}
const allocations = [1, 2, 3, 4, 5].map((retained) => {
  const rows = causal.map((row) => {
    const top = hybrid(baseline.get(row.id) ?? [], row.top, retained);
    return { id: row.id, repo: row.repo, hit: top.some((candidate) => row.ground_truth.symbols.includes(candidate.owner)), top: top.map((candidate) => candidate.owner) };
  });
  return { retained_adaptive: retained, causal_slots: 5 - retained, hits: rows.filter((row) => row.hit).length, tasks: rows.length, by_repo: Object.fromEntries([...new Set(rows.map((row) => row.repo))].map((repo) => [repo, { hits: rows.filter((row) => row.repo === repo && row.hit).length, tasks: rows.filter((row) => row.repo === repo).length }])), rows };
});
const output = { benchmark: "adaptive-stage-causal-hybrid-development-v1", development_only: true, allocations };
writeFileSync(join(results, "2026-08-25-adaptive-stage-causal-hybrid-development-v1.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(allocations.map(({ rows: _, ...summary }) => summary), null, 2)}\n`);
