/** Calibration-only: intersect lexical owners with Hunch's pre-fix call graph. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hunchPaths } from "../../src/core/paths.js";
import { rankIssueImplementationOwners } from "../../src/core/pipeline.js";
import { scanRepo } from "../../src/extractors/indexer.js";
import { HunchStore } from "../../src/store/hunchStore.js";

interface Task { id: string; issueTitle: string; issueBody: string }
interface PriorRow { id: string; pre_fix_sha: string; truth: { symbols: string[] }; discovery: boolean }
const root = resolve(import.meta.dirname, "../..");
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? join(root, "../zod-bench"));
const tasks = new Map((JSON.parse(readFileSync(join(import.meta.dirname, "zod-owner-holdout-v2-tasks.json"), "utf8")) as { tasks: Task[] }).tasks.map((task) => [task.id, task]));
const prior = JSON.parse(readFileSync(join(import.meta.dirname, "results/2026-08-25-zod-implementation-holdout-v2.json"), "utf8")) as { rows: PriorRow[] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function issueSeeds(issue: string): Set<string> {
  const seeds = new Set<string>();
  for (const match of issue.matchAll(/\bz\.([$A-Za-z_][$\w]*)\s*\(/g)) {
    const name = match[1];
    if (name && name.length >= 3) seeds.add(name.toLowerCase().replace(/^\$+/, ""));
  }
  return seeds;
}

function analyze(preFix: string, issue: string) {
  const dir = mkdtempSync(join(tmpdir(), "hunch-zod-evidence-"));
  let store: HunchStore | null = null;
  try {
    const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", preFix, "packages/zod/src/v4"], { maxBuffer: 256 * 1024 * 1024 });
    const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
    if (extraction.status !== 0) throw new Error(String(extraction.stderr));
    const sources = walk(join(dir, "packages/zod/src/v4"))
      .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
      .map((path) => ({ path: path.slice(dir.length + 1), content: readFileSync(path, "utf8") }));
    const lexical = rankIssueImplementationOwners(issue, sources)?.candidates ?? [];
    store = new HunchStore(hunchPaths(dir));
    store.json.ensureDirs();
    const graph = scanRepo(store, dir, { churn: false, source: { kind: "working" } });
    const seeds = issueSeeds(issue);
    const byId = new Map(graph.symbols.map((symbol) => [symbol.id, symbol]));
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (edge.type !== "calls" && edge.type !== "references") continue;
      (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push(edge.to);
    }
    const distance = new Map<string, number>();
    const queue: string[] = [];
    for (const symbol of graph.symbols) {
      if (!seeds.has(symbol.name.toLowerCase().replace(/^\$+/, ""))) continue;
      distance.set(symbol.id, 0);
      queue.push(symbol.id);
    }
    while (queue.length) {
      const id = queue.shift()!;
      const depth = distance.get(id)!;
      if (depth >= 4) continue;
      for (const target of adjacency.get(id) ?? []) {
        if (distance.has(target)) continue;
        distance.set(target, depth + 1);
        queue.push(target);
      }
    }
    const evidence = new Map<string, number>();
    for (const [id, depth] of distance) {
      const symbol = byId.get(id);
      if (symbol) evidence.set(`${symbol.file}::${symbol.name}`, depth);
    }
    const conditioned = lexical.filter((candidate) => evidence.has(candidate.owner))
      .map((candidate) => ({ ...candidate, distance: evidence.get(candidate.owner)!, conditioned_score: candidate.score + 20 / (1 + evidence.get(candidate.owner)!) }))
      .sort((a, b) => b.conditioned_score - a.conditioned_score || a.owner.localeCompare(b.owner));
    return { seeds: [...seeds].sort(), graph_symbols: graph.symbols.length, graph_edges: graph.edges.length, lexical, conditioned };
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

const rows = prior.rows.map((row, index) => {
  const task = tasks.get(row.id)!;
  const issue = `${task.issueTitle}\n${task.issueBody}`;
  const analysis = analyze(row.pre_fix_sha, issue);
  const top1 = analysis.conditioned[0]?.owner ?? null;
  const top5 = analysis.conditioned.slice(0, 5).map((candidate) => candidate.owner);
  const result = { id: row.id, top1, top1_correct: Boolean(top1 && row.truth.symbols.includes(top1)), top5_hit: top5.some((owner) => row.truth.symbols.includes(owner)), discovery: row.discovery, truth: row.truth, ...analysis };
  process.stderr.write(`[${index + 1}/${prior.rows.length}] ${row.id}: ${top1 ?? "abstain"}\n`);
  return result;
});
const emitted = rows.filter((row) => row.top1);
const discovery = rows.filter((row) => row.discovery);
const summary = {
  tasks: rows.length,
  emitted: emitted.length,
  exact: emitted.filter((row) => row.top1_correct).length,
  top5_hits: rows.filter((row) => row.top5_hit).length,
  discovery_tasks: discovery.length,
  discovery_emitted: discovery.filter((row) => row.top1).length,
  discovery_exact: discovery.filter((row) => row.top1_correct).length,
  discovery_top5_hits: discovery.filter((row) => row.top5_hit).length,
};
process.stdout.write(`${JSON.stringify({ calibration_only: true, summary, rows }, null, 2)}\n`);
