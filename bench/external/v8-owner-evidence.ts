/** Map Node V8 precise coverage through inline source maps to TS declarations. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { rankIssueImplementationOwners, type ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { inferIssueCorrectionStage, rankIssueCorrectionStageCandidates } from "../../src/core/correctionStage.js";
export { inferIssueCorrectionStage, rankIssueCorrectionStageCandidates };
export type { CorrectionStage, CorrectionStageCandidate } from "../../src/core/correctionStage.js";

interface RawSourceMap {
  version: number;
  sources: string[];
  sourcesContent?: Array<string | null>;
  mappings: string;
}
interface CachedSourceMap { data: RawSourceMap; lineLengths: number[]; url: string }
interface V8Range { startOffset: number; endOffset: number; count: number }
interface V8Function { functionName: string; ranges: V8Range[] }
interface V8Script { url: string; functions: V8Function[] }
interface V8Coverage {
  result: V8Script[];
  "source-map-cache"?: Record<string, CachedSourceMap>;
}
export interface V8OwnerEvidence {
  owner: string;
  path: string;
  symbol: string;
  count: number;
  function_name: string;
  original_line: number;
  script_url: string;
}

export interface V8RangeEvidence extends V8OwnerEvidence {
  function_root: boolean;
  range_index: number;
}

export interface CausalBoundaryCandidate {
  owner: string;
  evidence_tier: "stack" | "target-only-branch" | "target-only-declaration" | "shared-execution";
  lexical_score: number;
  stack_rank?: number;
  target_lines: number[];
  target_only_lines: number[];
  target_only_branch_lines: number[];
}

export interface EvidenceConditionedOwner {
  owner: string;
  score: number;
  lexical_score: number;
  execution_count: number;
  observed_functions: string[];
  internal_execution: boolean;
  stack_observed?: boolean;
  stack_rank?: number;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let value = 0;
  let shift = 0;
  for (const char of segment) {
    const digit = BASE64.indexOf(char);
    if (digit < 0) throw new Error(`invalid source-map VLQ character ${JSON.stringify(char)}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    const negative = value & 1;
    values.push(negative ? -(value >> 1) : value >> 1);
    value = 0;
    shift = 0;
  }
  if (shift) throw new Error("truncated source-map VLQ segment");
  return values;
}

export function originalPositionFor(
  mappings: string,
  generatedLine: number,
  generatedColumn: number,
): { source: number; line: number; column: number } | null {
  let source = 0;
  let originalLine = 0;
  let originalColumn = 0;
  const lines = mappings.split(";");
  for (let line = 0; line <= generatedLine && line < lines.length; line++) {
    let generated = 0;
    let best: { source: number; line: number; column: number } | null = null;
    for (const raw of lines[line]!.split(",")) {
      if (!raw) continue;
      const values = decodeVlq(raw);
      generated += values[0] ?? 0;
      if (values.length < 4) continue;
      source += values[1]!;
      originalLine += values[2]!;
      originalColumn += values[3]!;
      if (line === generatedLine && generated <= generatedColumn) best = { source, line: originalLine, column: originalColumn };
    }
    if (line === generatedLine) return best;
  }
  return null;
}

function offsetPosition(offset: number, lineLengths: number[]): { line: number; column: number } {
  let consumed = 0;
  for (let line = 0; line < lineLengths.length; line++) {
    const length = lineLengths[line]!;
    if (offset <= consumed + length) return { line, column: offset - consumed };
    consumed += length + 1;
  }
  return { line: Math.max(0, lineLengths.length - 1), column: Math.max(0, offset - consumed) };
}

function repositoryPath(sourceUrl: string): string | null {
  let path = sourceUrl;
  if (sourceUrl.startsWith("file:")) {
    try {
      // V8/source-map fixtures and reports may be produced on another OS. Converting a
      // POSIX file URL through Windows' fileURLToPath rejects the otherwise valid `/tmp/...`
      // path before we can extract its repository-relative suffix. URL pathname parsing is
      // deliberately host-independent; this function never opens the resulting path.
      path = decodeURIComponent(new URL(sourceUrl).pathname);
    } catch {
      return null;
    }
  }
  const normalized = path.replace(/\\/g, "/");
  const marker = normalized.lastIndexOf("/packages/");
  return marker >= 0 ? normalized.slice(marker + 1) : null;
}

export function collectV8OwnerEvidence(value: unknown): V8OwnerEvidence[] {
  if (!value || typeof value !== "object") return [];
  const coverage = value as V8Coverage;
  const cache = coverage["source-map-cache"] ?? {};
  const evidence: V8OwnerEvidence[] = [];
  for (const script of coverage.result ?? []) {
    const cached = cache[script.url];
    if (!cached?.data?.mappings || !cached.data.sourcesContent?.length) continue;
    for (const fn of script.functions) {
      const active = fn.ranges.filter((range) => range.count > 0).sort((a, b) => a.startOffset - b.startOffset)[0];
      if (!active) continue;
      const generated = offsetPosition(active.startOffset, cached.lineLengths);
      const original = originalPositionFor(cached.data.mappings, generated.line, generated.column);
      if (!original) continue;
      const sourceUrl = cached.data.sources[original.source];
      const source = cached.data.sourcesContent[original.source];
      if (!sourceUrl || !source) continue;
      const path = repositoryPath(sourceUrl);
      if (!path || !path.startsWith("packages/") || /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path)) continue;
      const owner = declarationOwners(path, source).find((span) => original.line + 1 >= span.startLine && original.line + 1 <= span.endLine);
      if (!owner) continue;
      evidence.push({
        owner: owner.owner,
        path,
        symbol: owner.owner.split("::")[1]!,
        count: active.count,
        function_name: fn.functionName,
        original_line: original.line + 1,
        script_url: script.url,
      });
    }
  }
  const unique = new Map<string, V8OwnerEvidence>();
  for (const item of evidence) {
    const key = `${item.owner}\0${item.function_name}\0${item.original_line}`;
    const prior = unique.get(key);
    if (!prior || item.count > prior.count) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => b.count - a.count || a.owner.localeCompare(b.owner));
}

/** Preserve nested V8 ranges instead of collapsing each function to its entry.
 * Nested ranges represent branches and expressions, which lets a target/control
 * pair identify the first source boundaries where their behavior diverges. */
export function collectV8RangeEvidence(value: unknown): V8RangeEvidence[] {
  if (!value || typeof value !== "object") return [];
  const coverage = value as V8Coverage;
  const cache = coverage["source-map-cache"] ?? {};
  const evidence: V8RangeEvidence[] = [];
  for (const script of coverage.result ?? []) {
    const cached = cache[script.url];
    if (!cached?.data?.mappings || !cached.data.sourcesContent?.length) continue;
    for (const fn of script.functions) {
      for (const [rangeIndex, range] of fn.ranges.entries()) {
        if (range.count <= 0) continue;
        const generated = offsetPosition(range.startOffset, cached.lineLengths);
        const original = originalPositionFor(cached.data.mappings, generated.line, generated.column);
        if (!original) continue;
        const sourceUrl = cached.data.sources[original.source];
        const source = cached.data.sourcesContent[original.source];
        if (!sourceUrl || !source) continue;
        const path = repositoryPath(sourceUrl);
        if (!path || !path.startsWith("packages/") || /(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path)) continue;
        const owner = declarationOwners(path, source).find((span) => original.line + 1 >= span.startLine && original.line + 1 <= span.endLine);
        if (!owner) continue;
        evidence.push({
          owner: owner.owner,
          path,
          symbol: owner.owner.split("::")[1]!,
          count: range.count,
          function_name: fn.functionName,
          original_line: original.line + 1,
          script_url: script.url,
          function_root: rangeIndex === 0,
          range_index: rangeIndex,
        });
      }
    }
  }
  const unique = new Map<string, V8RangeEvidence>();
  for (const item of evidence) {
    const key = `${item.owner}\0${item.function_name}\0${item.original_line}\0${item.function_root}`;
    const prior = unique.get(key);
    if (!prior || item.count > prior.count) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => a.owner.localeCompare(b.owner) || a.original_line - b.original_line || Number(b.function_root) - Number(a.function_root));
}

/** Rank evidence boundaries without claiming they own a correction. The rule is
 * deliberately lexicographic: a direct stack frame wins, then a target-only
 * nested branch, then a target-only declaration, then shared execution. Issue
 * relevance only orders candidates inside the same evidence tier. */
export function rankCausalBoundaryCandidates(
  issue: string,
  sources: ContractAxisOwnerSource[],
  targetCoverage: unknown[],
  controlCoverage: unknown[],
  targetOutput = "",
): CausalBoundaryCandidate[] {
  const lexical = new Map(
    (rankIssueImplementationOwners(issue, sources, 4_000)?.candidates ?? []).map((candidate) => [candidate.owner, candidate.score]),
  );
  const stackRank = new Map(collectStackOwnerEvidence(targetOutput, sources).map((owner, index) => [owner, index + 1]));
  const target = targetCoverage.flatMap(collectV8RangeEvidence);
  const controlCounts = new Map<string, number>();
  for (const item of controlCoverage.flatMap(collectV8RangeEvidence)) {
    const key = `${item.owner}\0${item.original_line}`;
    controlCounts.set(key, Math.max(controlCounts.get(key) ?? 0, item.count));
  }
  const byOwner = new Map<string, {
    target: Set<number>;
    targetOnly: Set<number>;
    targetOnlyBranch: Set<number>;
  }>();
  for (const item of target) {
    const entry = byOwner.get(item.owner) ?? { target: new Set<number>(), targetOnly: new Set<number>(), targetOnlyBranch: new Set<number>() };
    entry.target.add(item.original_line);
    const control = controlCounts.get(`${item.owner}\0${item.original_line}`) ?? 0;
    if (control === 0) {
      entry.targetOnly.add(item.original_line);
      if (!item.function_root) entry.targetOnlyBranch.add(item.original_line);
    }
    byOwner.set(item.owner, entry);
  }
  const tier = (owner: string, entry: typeof byOwner extends Map<string, infer T> ? T : never): CausalBoundaryCandidate["evidence_tier"] => {
    if (stackRank.has(owner)) return "stack";
    if (entry.targetOnlyBranch.size) return "target-only-branch";
    if (entry.targetOnly.size) return "target-only-declaration";
    return "shared-execution";
  };
  const tierRank: Record<CausalBoundaryCandidate["evidence_tier"], number> = {
    stack: 3,
    "target-only-branch": 2,
    "target-only-declaration": 1,
    "shared-execution": 0,
  };
  return [...byOwner].map(([owner, entry]) => {
    const rank = stackRank.get(owner);
    return {
      owner,
      evidence_tier: tier(owner, entry),
      lexical_score: lexical.get(owner) ?? 0,
      ...(rank ? { stack_rank: rank } : {}),
      target_lines: [...entry.target].sort((a, b) => a - b),
      target_only_lines: [...entry.targetOnly].sort((a, b) => a - b),
      target_only_branch_lines: [...entry.targetOnlyBranch].sort((a, b) => a - b),
    };
  }).sort((a, b) => {
    const stack = (a.stack_rank ?? Number.POSITIVE_INFINITY) - (b.stack_rank ?? Number.POSITIVE_INFINITY);
    if (a.evidence_tier === "stack" && b.evidence_tier === "stack" && stack) return stack;
    return tierRank[b.evidence_tier] - tierRank[a.evidence_tier]
      || b.target_only_branch_lines.length - a.target_only_branch_lines.length
      || b.target_only_lines.length - a.target_only_lines.length
      || b.lexical_score - a.lexical_score
      || a.owner.localeCompare(b.owner);
  });
}

/** Lexical relevance may order candidates, but only red-probe execution can
 * admit one. This makes prose nomination and runtime evidence independent. */
export function conditionOwnersOnV8Evidence(
  issue: string,
  sources: ContractAxisOwnerSource[],
  coverageValues: unknown[],
): EvidenceConditionedOwner[] {
  const lexical = rankIssueImplementationOwners(issue, sources, 4_000)?.candidates ?? [];
  const observed = new Map<string, { count: number; functions: Set<string> }>();
  for (const coverage of coverageValues) {
    for (const evidence of collectV8OwnerEvidence(coverage)) {
      const entry = observed.get(evidence.owner) ?? { count: 0, functions: new Set<string>() };
      entry.count += evidence.count;
      if (evidence.function_name) entry.functions.add(evidence.function_name);
      observed.set(evidence.owner, entry);
    }
  }
  const byOwner = new Map<string, typeof lexical[number]>();
  for (const candidate of lexical) if (!byOwner.has(candidate.owner)) byOwner.set(candidate.owner, candidate);
  return [...byOwner.values()].flatMap((candidate) => {
    const evidence = observed.get(candidate.owner);
    if (!evidence) return [];
    const functions = [...evidence.functions].sort();
    const symbol = candidate.owner.split("::")[1] ?? "";
    const internalExecution = functions.some((name) => /(?:^|\.)_?zod\.(?:parse|run|check)$|(?:^|\.)(?:parse|run|check)$/.test(name))
      || (symbol.startsWith("$Zod") && functions.length === 0);
    return [{
      owner: candidate.owner,
      score: Math.round((candidate.score + Math.min(10, Math.log1p(evidence.count) * 4) + (internalExecution ? 36 : 0)) * 100) / 100,
      lexical_score: candidate.score,
      execution_count: evidence.count,
      observed_functions: functions,
      internal_execution: internalExecution,
    }];
  }).sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner));
}

/** A passing control removes module initialization and ordinary downstream
 * execution from the ownership signal. Parser/check/run closures remain strong
 * only inside the target slice; target-unique declarations receive a separate
 * novelty bonus. */
export function conditionOwnersOnContrastiveV8Evidence(
  issue: string,
  sources: ContractAxisOwnerSource[],
  targetCoverage: unknown[],
  controlCoverage: unknown[],
): EvidenceConditionedOwner[] {
  const target = conditionOwnersOnV8Evidence(issue, sources, targetCoverage);
  const controlCounts = new Map<string, number>();
  for (const coverage of controlCoverage) {
    for (const evidence of collectV8OwnerEvidence(coverage)) {
      controlCounts.set(evidence.owner, (controlCounts.get(evidence.owner) ?? 0) + evidence.count);
    }
  }
  return target.map((candidate) => {
    const control = controlCounts.get(candidate.owner) ?? 0;
    const targetOnly = control === 0;
    const ratio = Math.log((candidate.execution_count + 1) / (control + 1));
    return {
      ...candidate,
      score: Math.round((candidate.lexical_score
        + (candidate.internal_execution ? 40 : 0)
        + (targetOnly ? 30 : 0)
        + Math.max(-10, Math.min(10, ratio * 6))) * 100) / 100,
    };
  }).sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner));
}

export function collectStackOwnerEvidence(
  output: string,
  sources: ContractAxisOwnerSource[],
): string[] {
  const byPath = new Map(sources.map((source) => [source.path, source.content]));
  const owners = new Set<string>();
  for (const match of output.matchAll(/(?:file:\/\/)?[^\s()]*?(packages\/[A-Za-z0-9._/-]+\.tsx?):(\d+):(\d+)/g)) {
    const path = match[1]!;
    const line = Number(match[2]);
    const content = byPath.get(path);
    if (!content || !Number.isSafeInteger(line)) continue;
    const owner = declarationOwners(path, content).find((span) => line >= span.startLine && line <= span.endLine);
    if (owner) owners.add(owner.owner);
  }
  return [...owners];
}

/** Source-mapped stack frames are direct execution evidence and outrank coverage
 * heuristics. Coverage remains the fallback for wrong-result failures that do
 * not throw. */
export function conditionOwnersOnRuntimeEvidence(
  issue: string,
  sources: ContractAxisOwnerSource[],
  targetCoverage: unknown[],
  controlCoverage: unknown[],
  targetOutput: string,
): EvidenceConditionedOwner[] {
  const stackOwners = collectStackOwnerEvidence(targetOutput, sources);
  const stackRank = new Map(stackOwners.map((owner, index) => [owner, index + 1]));
  return conditionOwnersOnContrastiveV8Evidence(issue, sources, targetCoverage, controlCoverage)
    .map((candidate) => {
      const rank = stackRank.get(candidate.owner);
      return {
        ...candidate,
        score: Math.round((candidate.score + (rank ? 120 / rank : 0)) * 100) / 100,
        stack_observed: Boolean(rank),
        ...(rank ? { stack_rank: rank } : {}),
      };
    })
    .sort((a, b) => b.score - a.score || a.owner.localeCompare(b.owner));
}

if (process.argv[1] && process.argv[2] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const evidence = collectV8OwnerEvidence(JSON.parse(readFileSync(process.argv[2], "utf8")));
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
