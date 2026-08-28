/** Repository-adaptive correction shortlist experiment; not product-delivered. */
import { rankIssueImplementationOwners, type ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { inferIssueCorrectionStage, type CorrectionStage } from "../../src/core/correctionStage.js";

const STOP = new Set([
  "src", "source", "lib", "library", "package", "packages", "core", "index", "type", "types", "schema", "schemas",
  "test", "tests", "with", "from", "into", "this", "that", "when", "then", "value", "values", "error", "issue",
]);
const TYPE_SCAFFOLD = /(?:Def|Internals?|Context|Options?|Params?|Input|Output|Config|Props|Type)$/;
const GENERIC_ENTRANCE = /^(?:parse|parser|validate|validator|check|schema|error|assert|create|build|process|compile)$/i;

export interface AdaptiveCorrectionCandidate {
  owner: string;
  stage: CorrectionStage;
  score: number;
  lexical_score: number;
  path_overlap: number;
  symbol_overlap: number;
  component_support: number;
  runtime_declaration: boolean;
  invoked_entrance: boolean;
  generic_entrance: boolean;
  type_scaffolding: boolean;
}

function terms(value: string): Set<string> {
  return new Set(value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_$]+/)
    .map((term) => term.replace(/^[$_]+/, ""))
    .filter((term) => term.length >= 3 && !STOP.has(term)));
}

function overlap(left: Set<string>, right: Set<string>): number {
  return [...left].filter((term) => right.has(term)).length;
}

function runtimeOwners(sources: ContractAxisOwnerSource[]): Set<string> {
  const owners = new Set<string>();
  const declaration = /^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function|class|enum|const|let|var)\s+([$A-Za-z_][$\w]*)/gm;
  for (const source of sources) {
    for (const match of source.content.matchAll(declaration)) owners.add(`${source.path}::${match[1]}`);
  }
  return owners;
}

function componentKeys(path: string): string[] {
  const parts = path.split("/");
  const directories = parts.slice(0, -1);
  const keys: string[] = [];
  for (let depth = Math.max(0, directories.length - 3); depth < directories.length; depth++) {
    const suffix = directories.slice(depth).join("/");
    if (suffix && !/^(?:src|lib|source|packages?)$/.test(suffix)) keys.push(suffix);
  }
  return keys;
}

/** Rank declarations using vocabulary discovered from this repository's paths,
 * symbols, and issue-specific component consensus. It intentionally has no
 * hardcoded Zod filenames or repository identities. */
export function rankIssueAdaptiveCorrectionCandidates(
  issueValue: unknown,
  sources: ContractAxisOwnerSource[],
): AdaptiveCorrectionCandidate[] {
  const issue = typeof issueValue === "string" ? issueValue.trim().slice(0, 100_000) : "";
  if (!issue) return [];
  const issueTerms = terms(issue);
  const invoked = new Set([...issue.matchAll(/\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)]
    .map((match) => match[1]!.replace(/^[$_]+/, "").toLowerCase()));
  const runtime = runtimeOwners(sources);
  const lexical = rankIssueImplementationOwners(issue, sources, 4_000)?.candidates ?? [];
  const distinct = lexical.filter((candidate, index, all) => all.findIndex((item) => item.owner === candidate.owner) === index);

  const prepared = distinct.map((candidate) => {
    const [path, symbol = ""] = candidate.owner.split("::");
    const pathOverlap = overlap(issueTerms, terms(path!));
    const symbolOverlap = overlap(issueTerms, terms(symbol));
    const direct = candidate.score + pathOverlap * 14 + symbolOverlap * 10;
    return { candidate, path: path!, symbol, pathOverlap, symbolOverlap, direct, keys: componentKeys(path!) };
  });
  const componentScores = new Map<string, number>();
  for (const item of prepared) {
    for (const key of item.keys) componentScores.set(key, Math.max(componentScores.get(key) ?? 0, item.direct));
  }

  const ranked = prepared.map((item) => {
    const normalized = item.symbol.replace(/^[$_]+/, "").toLowerCase();
    const invokedEntrance = invoked.has(normalized);
    const genericEntrance = GENERIC_ENTRANCE.test(item.symbol);
    const typeScaffolding = TYPE_SCAFFOLD.test(item.symbol);
    const componentSupport = item.keys.reduce((best, key) => Math.max(best, componentScores.get(key) ?? 0), 0);
    let score = item.direct + componentSupport * 0.12;
    if (runtime.has(item.candidate.owner)) score += 4;
    if (invokedEntrance) score -= 14;
    if (genericEntrance && item.pathOverlap === 0 && item.symbolOverlap === 0) score -= 8;
    if (typeScaffolding) score -= 3;
    return {
      owner: item.candidate.owner,
      stage: inferIssueCorrectionStage(issue),
      score: Math.round(score * 100) / 100,
      lexical_score: item.candidate.score,
      path_overlap: item.pathOverlap,
      symbol_overlap: item.symbolOverlap,
      component_support: Math.round(componentSupport * 100) / 100,
      runtime_declaration: runtime.has(item.candidate.owner),
      invoked_entrance: invokedEntrance,
      generic_entrance: genericEntrance,
      type_scaffolding: typeScaffolding,
    };
  }).sort((a, b) => b.score - a.score
    || b.path_overlap - a.path_overlap
    || b.symbol_overlap - a.symbol_overlap
    || Number(b.runtime_declaration) - Number(a.runtime_declaration)
    || a.owner.localeCompare(b.owner));
  const deeper = ranked.filter((candidate) => !candidate.invoked_entrance
    && (candidate.path_overlap > 0 || candidate.symbol_overlap > 0));
  return deeper.length ? ranked.filter((candidate) => !candidate.invoked_entrance) : ranked;
}
