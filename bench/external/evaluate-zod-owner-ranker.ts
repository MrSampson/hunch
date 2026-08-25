/**
 * Blind transfer benchmark for the deterministic contract-owner ranker.
 *
 * Prediction inputs are limited to the issue title/body and the repository at
 * the first parent of the fixing commit. Labels are derived only after
 * prediction from the fixing commit's source diff. Use --manifest to freeze
 * the task split and issue-input hashes without running the ranker.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import {
  inferContractAxisRiskHint,
  rankContractAxisRiskOwners,
  type ContractAxis,
  type ContractAxisOwnerSource,
  type ContractAxisProbeClosure,
  type ExecutableProbe,
  type ExecutionObligationCategory,
} from "../../src/core/pipeline.js";

export const OWNER_BENCHMARK_VERSION = "zod-owner-transfer-v1";
export const DEVELOPMENT_TASKS = new Set(["zod-5625", "zod-5775", "zod-5868", "zod-5917", "zod-5937"]);

interface ZodTask {
  id: string;
  fixSha: string;
  issueTitle: string;
  issueBody: string;
}

interface OwnerSpan {
  owner: string;
  startLine: number;
  endLine: number;
}

interface GroundTruth {
  paths: string[];
  symbols: string[];
}

interface BenchmarkRow {
  id: string;
  input_hash: string;
  pre_fix_sha: string;
  fix_sha: string;
  category: ExecutionObligationCategory;
  inference: ReturnType<typeof inferContractAxisRiskHint>;
  top_candidates: Array<{ owner: string; anchor: string; score: number }>;
  ground_truth: GroundTruth;
  ground_symbol_scorable: boolean;
  symbol_correct: boolean;
  file_correct: boolean;
  top5_symbol_hit: boolean;
  owner_disclosed_in_issue: boolean;
  discovery_case: boolean;
}

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export function issueInput(task: ZodTask): string {
  return JSON.stringify({ id: task.id, issueTitle: task.issueTitle, issueBody: task.issueBody });
}

/** Fixed, issue-only classifier. Order is intentional and preregistered. */
export function deriveProbeCategory(title: string, body: string): ExecutionObligationCategory {
  const text = `${title}\n${body}`.toLowerCase();
  if (/json[ -]?schema|tojsonschema|fromjsonschema|openapi/.test(text)) return "serialization";
  if (/typescript|compile[- ]?time|compiler error|type definition|types? (?:resolve|inference|says|definition)/.test(text)) return "types";
  if (/\bclassic\b.*\bmini\b|\bmini\b.*\bclassic\b|\bv3\b.*\bv4\b|\bv4\b.*\bv3\b/.test(text)) return "compatibility";
  return "behavior";
}

export function issueProbe(task: ZodTask): { closure: ContractAxisProbeClosure; category: ExecutionObligationCategory } {
  const category = deriveProbeCategory(task.issueTitle, task.issueBody);
  const axis = category as ContractAxis;
  const probe: ExecutableProbe = {
    id: `${task.id}:blind-issue-owner`,
    origin: "episode",
    category,
    claim: task.issueTitle.slice(0, 500),
    falsifier: `Reject a change that does not resolve the reported ${category} contract.`,
    command: "node .hunch-probes/blind-issue-owner.mjs",
    artifact: {
      path: ".hunch-probes/blind-issue-owner.txt",
      content: `${task.issueTitle}\n${task.issueBody}`.slice(0, 100_000),
    },
    command_alternatives: [["node", ".hunch-probes/blind-issue-owner.mjs"]],
    expected_before: { success: false },
    expected_after: { success: true },
  };
  return {
    category,
    closure: { required: [axis], covered: [], missing: [axis], probes: [probe] },
  };
}

export function changedLineNumbers(diff: string): { before: Set<number>; after: Set<number> } {
  const before = new Set<number>();
  const after = new Set<number>();
  for (const line of diff.split("\n")) {
    const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!match) continue;
    const beforeStart = Number(match[1]);
    const beforeCount = match[2] === undefined ? 1 : Number(match[2]);
    const afterStart = Number(match[3]);
    const afterCount = match[4] === undefined ? 1 : Number(match[4]);
    for (let i = 0; i < beforeCount; i++) before.add(beforeStart + i);
    for (let i = 0; i < afterCount; i++) after.add(afterStart + i);
  }
  return { before, after };
}

function lineOf(source: ts.SourceFile, offset: number): number {
  return source.getLineAndCharacterOfPosition(offset).line + 1;
}

/** Top-level declarations are the steering surface the ranker can emit. */
export function declarationOwners(path: string, content: string): OwnerSpan[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const spans: OwnerSpan[] = [];
  const add = (name: string | undefined, node: ts.Node): void => {
    if (!name) return;
    spans.push({ owner: `${path}::${name}`, startLine: lineOf(source, node.getStart(source)), endLine: lineOf(source, node.getEnd()) });
  };
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      add(statement.name?.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) add(declaration.name.text, statement);
      }
    }
  }
  return spans;
}

function ownersAtLines(path: string, content: string | null, lines: Set<number>): string[] {
  if (!content || lines.size === 0) return [];
  return declarationOwners(path, content)
    .filter((span) => [...lines].some((line) => line >= span.startLine && line <= span.endLine))
    .map((span) => span.owner);
}

function git(zod: string, args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });
}

function gitFile(zod: string, sha: string, path: string): string | null {
  try {
    return git(zod, ["show", `${sha}:${path}`]);
  } catch {
    return null;
  }
}

function walk(dir: string): string[] {
  const paths: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) paths.push(...walk(path));
    else paths.push(path);
  }
  return paths;
}

function preFixSources(zod: string, sha: string): ContractAxisOwnerSource[] {
  const dir = mkdtempSync(join(tmpdir(), "hunch-zod-owner-"));
  try {
    const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "packages/zod/src/v4"], {
      maxBuffer: 256 * 1024 * 1024,
    });
    const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive, maxBuffer: 16 * 1024 * 1024 });
    if (extraction.status !== 0) throw new Error(`tar extraction failed: ${String(extraction.stderr)}`);
    return walk(join(dir, "packages/zod/src/v4"))
      .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
      .map((path) => ({ path: path.slice(dir.length + 1), content: readFileSync(path, "utf8") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function groundTruth(zod: string, preFix: string, fixSha: string): GroundTruth {
  const paths = git(zod, ["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha, "--", "packages/zod/src"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path));
  const symbols = new Set<string>();
  for (const path of paths) {
    const diff = git(zod, ["diff", "--unified=0", "--no-ext-diff", preFix, fixSha, "--", path]);
    const lines = changedLineNumbers(diff);
    for (const owner of ownersAtLines(path, gitFile(zod, fixSha, path), lines.after)) symbols.add(owner);
    for (const owner of ownersAtLines(path, gitFile(zod, preFix, path), lines.before)) symbols.add(owner);
  }
  return { paths: [...new Set(paths)].sort(), symbols: [...symbols].sort() };
}

function disclosed(task: ZodTask, truth: GroundTruth): boolean {
  const text = `${task.issueTitle}\n${task.issueBody}`.toLowerCase();
  const symbols = truth.symbols.map((owner) => owner.split("::")[1]!).filter((symbol) => symbol.length >= 4);
  if (symbols.some((symbol) => new RegExp(`(^|[^a-z0-9_$])${symbol.replace(/[$]/g, "\\$")}([^a-z0-9_$]|$)`, "i").test(text))) return true;
  return truth.paths.some((path) => {
    const suffix = path.replace(/^packages\/zod\//, "").toLowerCase();
    return text.includes(path.toLowerCase()) || text.includes(suffix) || text.includes(basename(path).toLowerCase());
  });
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function wilson(successes: number, total: number): [number, number] | null {
  if (!total) return null;
  const z = 1.959963984540054;
  const p = successes / total;
  const d = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / d;
  const margin = (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) / d;
  return [center - margin, center + margin];
}

function summarize(rows: BenchmarkRow[]) {
  const scorable = rows.filter((row) => row.ground_symbol_scorable);
  const symbol = rows.filter((row) => row.inference?.level === "symbol");
  const correctSymbol = symbol.filter((row) => row.symbol_correct);
  const outputs = rows.filter((row) => row.inference);
  const correctFile = outputs.filter((row) => row.file_correct);
  const discovery = rows.filter((row) => row.discovery_case);
  const discoverySymbol = discovery.filter((row) => row.inference?.level === "symbol");
  const correctDiscoverySymbol = discoverySymbol.filter((row) => row.symbol_correct);
  const top5Hits = rows.filter((row) => row.top5_symbol_hit);
  const metrics = {
    tasks: rows.length,
    symbol_scorable_tasks: scorable.length,
    symbol_outputs: symbol.length,
    exact_symbol_correct: correctSymbol.length,
    exact_symbol_precision: ratio(correctSymbol.length, symbol.length),
    exact_symbol_precision_wilson_95: wilson(correctSymbol.length, symbol.length),
    exact_symbol_coverage: ratio(symbol.length, scorable.length),
    exact_symbol_recall: ratio(correctSymbol.length, scorable.length),
    top5_symbol_recall: ratio(top5Hits.length, scorable.length),
    any_outputs: outputs.length,
    file_correct: correctFile.length,
    file_accuracy_when_emitted: ratio(correctFile.length, outputs.length),
    abstentions: rows.filter((row) => !row.inference).length,
    abstention_rate: ratio(rows.filter((row) => !row.inference).length, rows.length),
    discovery_tasks: discovery.length,
    discovery_symbol_outputs: discoverySymbol.length,
    discovery_symbol_correct: correctDiscoverySymbol.length,
    discovery_symbol_precision: ratio(correctDiscoverySymbol.length, discoverySymbol.length),
    discovery_symbol_coverage: ratio(discoverySymbol.length, discovery.filter((row) => row.ground_symbol_scorable).length),
  };
  const promote = symbol.length >= 10
    && (metrics.exact_symbol_precision ?? 0) >= 0.9
    && (metrics.exact_symbol_coverage ?? 0) >= 0.5
    && discoverySymbol.length >= 8
    && (metrics.discovery_symbol_precision ?? 0) >= 0.85;
  return { metrics, decision: promote ? "promote-symbol-hints" : "keep-diagnostic-only" };
}

function markdown(result: { benchmark: string; generated_at: string; evaluator_hash: string; rows: BenchmarkRow[]; summary: ReturnType<typeof summarize> }): string {
  const m = result.summary.metrics;
  const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const lines = [
    `# Zod blind owner-ranking transfer result`,
    ``,
    `Evaluator: \`${result.benchmark}\` (SHA-256 \`${result.evaluator_hash}\`).`,
    `Prediction used issue text plus the pre-fix tree only; labels came from the future fix diff after prediction.`,
    ``,
    `## Decision`,
    ``,
    `**${result.summary.decision}**`,
    ``,
    `- Exact-symbol precision: ${m.exact_symbol_correct}/${m.symbol_outputs} (${pct(m.exact_symbol_precision)})`,
    `- Exact-symbol coverage: ${m.symbol_outputs}/${m.symbol_scorable_tasks} (${pct(m.exact_symbol_coverage)})`,
    `- True-discovery symbol precision: ${m.discovery_symbol_correct}/${m.discovery_symbol_outputs} (${pct(m.discovery_symbol_precision)})`,
    `- File accuracy when any inference was emitted: ${m.file_correct}/${m.any_outputs} (${pct(m.file_accuracy_when_emitted)})`,
    `- Abstentions: ${m.abstentions}/${m.tasks} (${pct(m.abstention_rate)})`,
    ``,
    `## Rows`,
    ``,
    `| task | category | inference | exact symbol | file | disclosed | ground-truth symbols |`,
    `|---|---|---|:---:|:---:|:---:|---|`,
  ];
  for (const row of result.rows) {
    lines.push(`| ${row.id} | ${row.category} | ${row.inference ? `${row.inference.level}: \`${row.inference.hint.owner}\`` : "abstain"} | ${row.symbol_correct ? "yes" : "no"} | ${row.file_correct ? "yes" : "no"} | ${row.owner_disclosed_in_issue ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`);
  }
  lines.push("", "## Locked promotion rule", "", "Promote automatic symbol hints only with at least 10 symbol outputs, at least 90% exact-symbol precision, at least 50% exact-symbol coverage, at least 8 true-discovery symbol outputs, and at least 85% true-discovery precision. File-level output is diagnostic regardless of score.", "");
  return lines.join("\n");
}

function parseFlag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1]! : fallback;
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, "../..");
  const zod = resolve(parseFlag("zod", process.env.HUNCH_ZOD_BENCH_REPO ?? join(root, "../zod-bench")));
  const tasksPath = resolve(parseFlag("tasks", join(import.meta.dirname, "zod-tasks.json")));
  const tasks = (JSON.parse(readFileSync(tasksPath, "utf8")) as { tasks: ZodTask[] }).tasks
    .filter((task) => !DEVELOPMENT_TASKS.has(task.id));
  const evaluatorHash = sha256(readFileSync(new URL(import.meta.url), "utf8"));
  const manifest = {
    benchmark: OWNER_BENCHMARK_VERSION,
    evaluator_hash: evaluatorHash,
    excluded_development_tasks: [...DEVELOPMENT_TASKS].sort(),
    tasks: tasks.map((task) => ({ id: task.id, input_hash: sha256(issueInput(task)) })),
  };
  if (process.argv.includes("--manifest")) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }

  const rows: BenchmarkRow[] = [];
  for (const [index, task] of tasks.entries()) {
    const preFix = git(zod, ["rev-parse", `${task.fixSha}^1`]).trim();
    const { closure, category } = issueProbe(task);
    const sources = preFixSources(zod, preFix);
    const ranking = rankContractAxisRiskOwners(closure, sources);
    const inference = inferContractAxisRiskHint(closure, sources);
    // The future diff is deliberately opened only after the prediction above.
    const truth = groundTruth(zod, preFix, task.fixSha);
    const predictedPath = inference?.hint.owner.split("::")[0] ?? null;
    const ownerDisclosed = disclosed(task, truth);
    const row: BenchmarkRow = {
      id: task.id,
      input_hash: sha256(issueInput(task)),
      pre_fix_sha: preFix,
      fix_sha: task.fixSha,
      category,
      inference,
      top_candidates: ranking?.candidates.slice(0, 5) ?? [],
      ground_truth: truth,
      ground_symbol_scorable: truth.symbols.length > 0,
      symbol_correct: Boolean(inference?.level === "symbol" && truth.symbols.includes(inference.hint.owner)),
      file_correct: Boolean(predictedPath && truth.paths.includes(predictedPath)),
      top5_symbol_hit: Boolean(ranking?.candidates.slice(0, 5).some((candidate) => truth.symbols.includes(candidate.owner))),
      owner_disclosed_in_issue: ownerDisclosed,
      discovery_case: !ownerDisclosed,
    };
    rows.push(row);
    process.stderr.write(`[${index + 1}/${tasks.length}] ${task.id}: ${inference?.hint.owner ?? "abstain"}\n`);
  }
  const generatedAt = new Date().toISOString();
  const result = { ...manifest, generated_at: generatedAt, rows, summary: summarize(rows) };
  const defaultBase = join(import.meta.dirname, "results", `${generatedAt.replace(/[:.]/g, "-")}-zod-owner-transfer-v1`);
  const outputBase = resolve(parseFlag("out", defaultBase));
  writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(`${outputBase}.md`, markdown(result));
  process.stdout.write(`${JSON.stringify({ outputBase, summary: result.summary }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
