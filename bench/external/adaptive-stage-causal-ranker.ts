/** Experimental graph-conditioned correction shortlist; not product-delivered. */
import { resolveRelativeImport } from "../../src/core/relativeImports.js";
import { attributeCalls, parseSource, type ParsedSymbolKind } from "../../src/extractors/parse.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { rankIssueAdaptiveCorrectionCandidates, type AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";

export interface CausalRankerOptions {
  seed_limit?: number;
  max_depth?: number;
  upstream_weight?: number;
  downstream_weight?: number;
  issue_seed_bonus?: number;
  upstream_centrality_weight?: number;
  downstream_centrality_weight?: number;
}

export interface CausalCorrectionCandidate extends AdaptiveCorrectionCandidate {
  adaptive_rank: number;
  causal_score: number;
  upstream_distance: number | null;
  downstream_distance: number | null;
  issue_seed: boolean;
  graph_seed: boolean;
  fan_in: number;
  fan_out: number;
}

interface GraphNode { owner: string; path: string; name: string; kind: ParsedSymbolKind; fan_in: number; fan_out: number }
interface Graph { nodes: Map<string, GraphNode>; outgoing: Map<string, Set<string>>; incoming: Map<string, Set<string>> }
const GENERIC_SEED = new Set(["array", "assert", "build", "check", "create", "error", "format", "input", "object", "output", "parse", "parser", "process", "request", "response", "schema", "string", "type", "validate", "validator", "value"]);
const normalized = (value: string): string => value.replace(/^[$_]+/, "").toLowerCase();

function add(map: Map<string, Set<string>>, from: string, to: string): void {
  (map.get(from) ?? map.set(from, new Set()).get(from)!).add(to);
}

function buildGraph(sources: ContractAxisOwnerSource[]): Graph {
  const parsed = sources.map((source) => ({ source, parsed: parseSource(source.path, source.content) })).filter((item) => item.parsed);
  const available = parsed.map((item) => item.source.path);
  const nodes = new Map<string, GraphNode>();
  const byFileName = new Map<string, string[]>();
  const imports = new Map<string, Set<string>>();
  for (const item of parsed) {
    const imported = new Set(item.parsed!.imports.map((specifier) => resolveRelativeImport(item.source.path, specifier, available).path).filter((path): path is string => !!path));
    imports.set(item.source.path, imported);
    for (const symbol of item.parsed!.symbols) {
      const owner = `${item.source.path}::${symbol.name}`;
      if (!nodes.has(owner)) nodes.set(owner, { owner, path: item.source.path, name: symbol.name, kind: symbol.kind, fan_in: 0, fan_out: 0 });
      (byFileName.get(`${item.source.path}\0${symbol.name}`) ?? byFileName.set(`${item.source.path}\0${symbol.name}`, []).get(`${item.source.path}\0${symbol.name}`)!).push(owner);
    }
  }
  const outgoing = new Map<string, Set<string>>(); const incoming = new Map<string, Set<string>>();
  for (const item of parsed) {
    const symbols = item.parsed!.symbols; const attributed = attributeCalls(item.parsed!);
    for (const [callerIndex, calls] of attributed) {
      const callerSymbol = symbols[callerIndex]; if (!callerSymbol) continue;
      const caller = `${item.source.path}::${callerSymbol.name}`; if (!nodes.has(caller)) continue;
      for (const [calleeName, memberOnly] of calls) {
        const same = byFileName.get(`${item.source.path}\0${calleeName}`) ?? [];
        let targets = same.length === 1 ? same : [];
        if (!targets.length) {
          targets = [...(imports.get(item.source.path) ?? [])].flatMap((path) => byFileName.get(`${path}\0${calleeName}`) ?? []);
          if (targets.length !== 1) targets = [];
        }
        const target = targets[0]; if (!target || target === caller) continue;
        const node = nodes.get(target); if (memberOnly && node?.kind !== "method" && node?.path !== item.source.path) continue;
        add(outgoing, caller, target); add(incoming, target, caller);
      }
    }
  }
  for (const [owner, targets] of outgoing) {
    const node = nodes.get(owner); if (node) node.fan_out = targets.size;
  }
  for (const [owner, callers] of incoming) {
    const node = nodes.get(owner); if (node) node.fan_in = callers.size;
  }
  return { nodes, outgoing, incoming };
}

function issueSeedNames(issue: string): Set<string> {
  const seeds = new Set<string>();
  for (const match of issue.matchAll(/\b([$A-Za-z_][$\w]*)\s*\(/g)) seeds.add(normalized(match[1]!));
  for (const match of issue.matchAll(/\.([$A-Za-z_][$\w]*)\b/g)) seeds.add(normalized(match[1]!));
  for (const match of issue.matchAll(/`([$A-Za-z_][$\w]*)`/g)) seeds.add(normalized(match[1]!));
  return new Set([...seeds].filter((name) => name.length >= 3 && !GENERIC_SEED.has(name)));
}

function distances(seeds: Set<string>, adjacency: Map<string, Set<string>>, maxDepth: number): Map<string, number> {
  const found = new Map([...seeds].map((seed) => [seed, 0] as const)); const queue = [...seeds];
  while (queue.length) {
    const current = queue.shift()!; const depth = found.get(current)!; if (depth >= maxDepth) continue;
    for (const next of adjacency.get(current) ?? []) {
      if (found.has(next)) continue; found.set(next, depth + 1); queue.push(next);
    }
  }
  return found;
}

/** Re-rank adaptive candidates by proximity to issue-disclosed and high-ranked
 * surface declarations. Reverse edges reward callers/orchestrators; forward
 * edges reward delegated handlers. Unconnected candidates retain adaptive order. */
export function rankIssueCausalCorrectionCandidates(
  issueValue: unknown,
  sources: ContractAxisOwnerSource[],
  options: CausalRankerOptions = {},
): CausalCorrectionCandidate[] {
  const issue = typeof issueValue === "string" ? issueValue.trim().slice(0, 100_000) : ""; if (!issue) return [];
  const adaptive = rankIssueAdaptiveCorrectionCandidates(issue, sources); if (!adaptive.length) return [];
  const graph = buildGraph(sources); const seedLimit = options.seed_limit ?? 3; const maxDepth = options.max_depth ?? 4;
  const issueNames = issueSeedNames(issue); const issueOwners = new Set([...graph.nodes.values()].filter((node) => issueNames.has(normalized(node.name))).map((node) => node.owner));
  const graphSeeds = new Set(adaptive.slice(0, seedLimit).map((candidate) => candidate.owner).filter((owner) => graph.nodes.has(owner)));
  const seeds = new Set([...issueOwners, ...graphSeeds]);
  const downstream = distances(seeds, graph.outgoing, maxDepth); const upstream = distances(seeds, graph.incoming, maxDepth);
  const upstreamWeight = options.upstream_weight ?? 35; const downstreamWeight = options.downstream_weight ?? 25; const issueSeedBonus = options.issue_seed_bonus ?? 8;
  const upstreamCentralityWeight = options.upstream_centrality_weight ?? 18; const downstreamCentralityWeight = options.downstream_centrality_weight ?? 12;
  return adaptive.map((candidate, index) => {
    const upstreamDistance = upstream.get(candidate.owner); const downstreamDistance = downstream.get(candidate.owner);
    const base = 1_000 / (20 + index);
    const node = graph.nodes.get(candidate.owner); const fanIn = node?.fan_in ?? 0; const fanOut = node?.fan_out ?? 0;
    const upstreamBoost = upstreamDistance && upstreamDistance > 0 ? (upstreamWeight + upstreamCentralityWeight * Math.log2(1 + fanOut)) / Math.sqrt(upstreamDistance) : 0;
    const downstreamBoost = downstreamDistance && downstreamDistance > 0 ? (downstreamWeight + downstreamCentralityWeight * Math.log2(1 + fanIn)) / Math.sqrt(downstreamDistance) : 0;
    const issueSeed = issueOwners.has(candidate.owner); const graphSeed = graphSeeds.has(candidate.owner);
    const causalScore = base + upstreamBoost + downstreamBoost + (issueSeed ? issueSeedBonus : 0);
    return { ...candidate, adaptive_rank: index + 1, causal_score: Math.round(causalScore * 100) / 100, upstream_distance: upstreamDistance && upstreamDistance > 0 ? upstreamDistance : null, downstream_distance: downstreamDistance && downstreamDistance > 0 ? downstreamDistance : null, issue_seed: issueSeed, graph_seed: graphSeed, fan_in: fanIn, fan_out: fanOut };
  }).sort((a, b) => b.causal_score - a.causal_score || a.adaptive_rank - b.adaptive_rank || a.owner.localeCompare(b.owner));
}

/** Preserve four adaptive choices and spend exactly one bounded shortlist slot
 * on the highest graph-conditioned alternative. */
export function rankIssueCausalHybridCandidates(
  issueValue: unknown,
  sources: ContractAxisOwnerSource[],
): CausalCorrectionCandidate[] {
  const causal = rankIssueCausalCorrectionCandidates(issueValue, sources);
  const adaptive = [...causal].sort((a, b) => a.adaptive_rank - b.adaptive_rank);
  const output = adaptive.slice(0, 4); const seen = new Set(output.map((candidate) => candidate.owner));
  const alternative = causal.find((candidate) => !seen.has(candidate.owner));
  if (alternative) output.push(alternative);
  return output;
}
