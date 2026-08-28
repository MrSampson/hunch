/** Development-only causal-ranker evaluation on already-consumed holdouts. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankIssueCausalCorrectionCandidates } from "./adaptive-stage-causal-ranker.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface Task { id: string; repo: string; title: string; body: string; pre_fix_sha: string }
interface ResultRow { id: string; symbol_scorable: boolean; top5: boolean; file: boolean; ground_truth: { paths: string[]; symbols: string[] } }
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const results = join(import.meta.dirname, "results");
const bases = ["2026-08-25-adaptive-stage-transfer-v1", "2026-08-25-adaptive-stage-confidence-transfer-v2", "2026-08-25-adaptive-stage-view-consensus-transfer-v1"];
function walk(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; }); }
function sources(task: Task): ContractAxisOwnerSource[] {
  const archive = execFileSync("gh", ["api", `repos/${task.repo}/tarball/${task.pre_fix_sha}`], { encoding: "buffer", maxBuffer: 256 << 20, timeout: 90_000 });
  const dir = mkdtempSync(join(tmpdir(), "hunch-causal-dev-"));
  try {
    const extraction = spawnSync("tar", ["-xzf", "-", "-C", dir], { input: archive }); if (extraction.status !== 0) throw new Error(`${task.id}: extraction failed`);
    const root = join(dir, readdirSync(dir)[0]!);
    return walk(root).filter((path) => /\.tsx?$/.test(path) && !excludedSource.test(path.slice(root.length + 1))).map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const work = bases.flatMap((base) => {
  const tasks = (JSON.parse(readFileSync(join(results, `${base}.tasks.json`), "utf8")) as { tasks: Task[] }).tasks;
  const rows = (JSON.parse(readFileSync(join(results, `${base}.json`), "utf8")) as { rows: ResultRow[] }).rows;
  const byId = new Map(rows.filter((row) => row.symbol_scorable).map((row) => [row.id, row]));
  return tasks.filter((task) => byId.has(task.id)).map((task) => ({ task, baseline: byId.get(task.id)!, source_artifact: base }));
});
const rows = [] as Array<Record<string, unknown>>;
for (const [index, item] of work.entries()) {
  const ranked = rankIssueCausalCorrectionCandidates(`${item.task.title}\n${item.task.body}`, sources(item.task));
  const top = ranked.slice(0, 10); const owner = top[0]?.owner; const path = owner?.split("::")[0]; const truth = item.baseline.ground_truth;
  rows.push({ id: item.task.id, repo: item.task.repo, source_artifact: item.source_artifact, baseline_top5: item.baseline.top5, baseline_file: item.baseline.file, causal_exact: !!owner && truth.symbols.includes(owner), causal_top5: top.slice(0, 5).some((candidate) => truth.symbols.includes(candidate.owner)), causal_file: !!path && truth.paths.includes(path), top, ground_truth: truth });
  process.stderr.write(`[develop ${index + 1}/${work.length}] ${item.task.id}: ${top[0]?.owner ?? "abstain"}\n`);
}
const count = (key: string, selected = rows): number => selected.filter((row) => row[key] === true).length;
const repos = [...new Set(rows.map((row) => row.repo as string))];
const summarize = (selected: typeof rows) => ({ tasks: selected.length, baseline_top5: count("baseline_top5", selected), causal_exact: count("causal_exact", selected), causal_top5: count("causal_top5", selected), baseline_file: count("baseline_file", selected), causal_file: count("causal_file", selected) });
const summary = { overall: summarize(rows), by_repo: Object.fromEntries(repos.map((repo) => [repo, summarize(rows.filter((row) => row.repo === repo))])) };
const output = { benchmark: "adaptive-stage-causal-development-v2", development_only: true, options: { seed_limit: 3, max_depth: 4, upstream_weight: 35, downstream_weight: 25, issue_seed_bonus: 8, upstream_centrality_weight: 18, downstream_centrality_weight: 12 }, summary, rows };
writeFileSync(join(results, "2026-08-25-adaptive-stage-causal-development-v2.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
