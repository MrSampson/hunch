/** Development-only one-hop declaration relationship expansion. */
import { createHash } from "node:crypto";
import {
  diagnoseIssueCorrectionStage,
  rankIssueAdaptiveCorrectionCandidates,
} from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

const LIMIT = 11;
const GENERIC_RELATION_SYMBOLS = new Set([
  "value", "values", "data", "result", "type", "node", "root", "schema", "config", "context", "options", "error",
]);
interface Declaration { owner: string; path: string; symbol: string; body: string; tokens: Set<string> }
interface RelationshipCandidate {
  owner: string;
  global_rank: number;
  relationship_score: number;
  outgoing_from_seed: number;
  incoming_to_seed: number;
  cluster_member: boolean;
}

function tokenSet(value: string): Set<string> {
  return new Set(value.match(/[$A-Za-z_][$A-Za-z0-9_]*/g) ?? []);
}

function declarations(sources: ContractAxisOwnerSource[]): Declaration[] {
  const output: Declaration[] = [];
  const declaration = /^(?:export\s+)?(?:declare\s+)?(?:interface|class|function|const|type)\s+([$A-Za-z_][$\w]*)/gm;
  for (const source of sources) {
    const matches = [...source.content.matchAll(declaration)];
    for (let index = 0; index < matches.length; index++) {
      const match = matches[index]!;
      const symbol = match[1]!;
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? source.content.length;
      const body = source.content.slice(start, end).slice(0, 80_000);
      output.push({ owner: `${source.path}::${symbol}`, path: source.path, symbol, body, tokens: tokenSet(body) });
    }
  }
  return output;
}

export function buildRelationshipExpandedPlan(
  issue: string,
  sources: ContractAxisOwnerSource[],
): { owners: string[]; candidates: RelationshipCandidate[]; receipt_id: string } {
  const diagnostic = diagnoseIssueCorrectionStage(issue, sources, 5);
  const ranked = rankIssueAdaptiveCorrectionCandidates(issue, sources);
  const globalRank = new Map(ranked.map((candidate, index) => [candidate.owner, index + 1]));
  const baseline = ranked.slice(0, 5).map((candidate) => candidate.owner);
  const baselineSet = new Set(baseline);
  const clusterOwners = new Set(diagnostic.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner))));
  const allDeclarations = declarations(sources);
  const byOwner = new Map(allDeclarations.map((declaration) => [declaration.owner, declaration]));
  const symbolFrequency = new Map<string, number>();
  for (const declaration of allDeclarations) {
    symbolFrequency.set(declaration.symbol, (symbolFrequency.get(declaration.symbol) ?? 0) + 1);
  }
  const relation = new Map<string, { score: number; outgoing: number; incoming: number }>();
  const add = (owner: string, weight: number, direction: "outgoing" | "incoming"): void => {
    if (baselineSet.has(owner) || !globalRank.has(owner)) return;
    const current = relation.get(owner) ?? { score: 0, outgoing: 0, incoming: 0 };
    current.score += weight;
    current[direction]++;
    relation.set(owner, current);
  };
  for (const seedOwner of baseline) {
    const seed = byOwner.get(seedOwner);
    if (!seed) continue;
    const seedSymbol = seed.symbol.replace(/^[$_]+/, "");
    const seedFrequency = symbolFrequency.get(seed.symbol) ?? 1;
    for (const target of allDeclarations) {
      if (target.owner === seed.owner || !globalRank.has(target.owner)) continue;
      const targetSymbol = target.symbol.replace(/^[$_]+/, "");
      const targetFrequency = symbolFrequency.get(target.symbol) ?? 1;
      const targetGeneric = GENERIC_RELATION_SYMBOLS.has(targetSymbol.toLowerCase());
      const targetDisclosed = targetSymbol.length >= 3 && issue.toLowerCase().includes(targetSymbol.toLowerCase());
      if ((seed.tokens.has(target.symbol) || seed.tokens.has(targetSymbol)) && (!targetGeneric || targetDisclosed)) {
        add(target.owner, 5 / Math.sqrt(targetFrequency) + Number(seed.path === target.path), "outgoing");
      }
      if ((target.tokens.has(seed.symbol) || target.tokens.has(seedSymbol))
        && (!GENERIC_RELATION_SYMBOLS.has(seedSymbol.toLowerCase()) || issue.toLowerCase().includes(seedSymbol.toLowerCase()))) {
        add(target.owner, 2.5 / Math.sqrt(seedFrequency) + Number(seed.path === target.path), "incoming");
      }
    }
  }
  const pool = [...new Set([...clusterOwners, ...relation.keys()])]
    .filter((owner) => !baselineSet.has(owner) && globalRank.has(owner))
    .map((owner): RelationshipCandidate => {
      const linked = relation.get(owner);
      return {
        owner,
        global_rank: globalRank.get(owner)!,
        relationship_score: Math.round((linked?.score ?? 0) * 100) / 100,
        outgoing_from_seed: linked?.outgoing ?? 0,
        incoming_to_seed: linked?.incoming ?? 0,
        cluster_member: clusterOwners.has(owner),
      };
    })
    .sort((left, right) => right.relationship_score - left.relationship_score
      || Number(right.cluster_member) - Number(left.cluster_member)
      || left.global_rank - right.global_rank
      || left.owner.localeCompare(right.owner))
    .slice(0, LIMIT - baseline.length);
  const owners = [...baseline, ...pool.map((candidate) => candidate.owner)];
  return {
    owners,
    candidates: pool,
    receipt_id: createHash("sha256").update(JSON.stringify({
      rule: "one-hop-declaration-relationship-expansion-v5",
      owners,
      relationships: pool,
      exact_owner_enabled: false,
    })).digest("hex").slice(0, 24),
  };
}
