/** Preregistered fresh transfer runner for evidence bridge v2/v3.
 * Predictions and optimization receipts are frozen before post-fix code or a
 * fixing diff is opened. The evaluator performs no causal interventions; it
 * isolates the new execution-to-static file bridge added in v2.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  diagnoseIssueCorrectionStage,
  EVIDENCE_GUIDED_SHORTLIST_RULE,
} from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import type { EvidenceOutcome, VerifiedEvidenceReceipt } from "../../src/core/evidenceMap.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { collectV8RangeEvidence } from "./v8-owner-evidence.js";

interface TransferCase { id: string; fixSha: string; issue: string; target: string; control: string }
interface TaskFile { benchmark: string; cases: TransferCase[] }
interface ProbeRun { value: boolean | null; coverage: unknown[]; stdout: string; stderr: string }
interface FrozenPrediction {
  id: string;
  fix_sha: string;
  pre_fix_sha: string;
  case_hash: string;
  pre_observed: { target: boolean | null; control: boolean | null };
  pre_authenticated: boolean;
  verified_evidence_receipt: VerifiedEvidenceReceipt;
  baseline_top5: string[];
  optimized_top5: string[];
  optimization_receipt: NonNullable<ReturnType<typeof diagnoseIssueCorrectionStage>["optimization"]>;
}

const transferVersion = process.env.HUNCH_EVIDENCE_BRIDGE_TRANSFER_VERSION === "v3" ? "v3" : "v2";
const config = transferVersion === "v3" ? {
  taskFile: "2026-08-25-guarded-evidence-bridge-transfer-v3.tasks.json",
  outputName: "2026-08-25-guarded-evidence-bridge-transfer-v3",
  decisionName: "guarded-evidence-bridge-v3",
  title: "Guarded evidence bridge transfer v3",
  expected: {
    tasks: "5445b1664b8fdace370a5502902df7fb6a2c48e41eb2545cdc646a6656477a6b",
    production: "b0f714cff0c3fe6a444c583040a53740061528f45a4ddfdf4c6f996ee72ded14",
    evidence: "5101295624b14efd26965c09aea57dcda0a8bcac1914498b43ed2aa1fe891df9",
    static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
    runtime: "1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4",
    truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
  },
} as const : {
  taskFile: "2026-08-25-evidence-file-reserve-transfer-v2.tasks.json",
  outputName: "2026-08-25-evidence-file-reserve-transfer-v2",
  decisionName: "evidence-file-reserve-v2",
  title: "Evidence file reserve transfer v2",
  expected: {
    tasks: "5a80b0cfab6e9fbb7c9544e665f4930ad013936473f9f6bc0576cf14ea0c35bc",
    production: "bbf79c810ca78f41ff677b32e1aecd9f407d9f062825403032153f87af7ed3b1",
    evidence: "dfe7b3f4a7ce3fa8649debe490fe1b04712550bdaefb6768988d48ff4b8494b0",
    static_ranker: "15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c",
    runtime: "1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4",
    truth_mapper: "42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52",
  },
} as const;
const EXPECTED = config.expected;

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const taskPath = join(import.meta.dirname, "results", config.taskFile);
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;
const outputBase = resolve(process.env.HUNCH_EVIDENCE_BRIDGE_OUT
  ?? join(import.meta.dirname, "results", config.outputName));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const tsxLoader = import.meta.resolve("tsx/esm");

function assertHash(path: string, expected: string): void {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
}
assertHash(taskPath, EXPECTED.tasks);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.production);
assertHash(resolve(import.meta.dirname, "../../src/core/evidenceMap.ts"), EXPECTED.evidence);
assertHash(resolve(import.meta.dirname, "../../src/core/pipeline.ts"), EXPECTED.static_ranker);
assertHash(join(import.meta.dirname, "v8-owner-evidence.ts"), EXPECTED.runtime);
assertHash(join(import.meta.dirname, "evaluate-zod-owner-ranker.ts"), EXPECTED.truth_mapper);

function git(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function sourcesAt(root: string): ContractAxisOwnerSource[] {
  return walk(join(root, "packages/zod/src/v4"))
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
}

function extract(sha: string, id: string, side: string): string {
  const root = mkdtempSync(join(tmpdir(), `hunch-evidence-v2-${id}-${side}-`));
  const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha,
    "package.json", "packages/zod/package.json", "packages/zod/src/v4"], { maxBuffer: 32 * 1024 * 1024 });
  const result = spawnSync("tar", ["-xf", "-", "-C", root], { input: archive });
  if (result.status !== 0) throw new Error(`failed to extract ${id} ${side}`);
  return root;
}

function booleanOutput(output: string): boolean | null {
  const value = output.trim().split(/\r?\n/).at(-1);
  return value === "true" ? true : value === "false" ? false : null;
}

function probe(root: string, id: string, content: string, coverageEnabled: boolean): ProbeRun {
  mkdirSync(join(root, ".hunch-probes"), { recursive: true });
  writeFileSync(join(root, ".hunch-probes", `${id}.ts`), content);
  const coverageDir = coverageEnabled ? mkdtempSync(join(tmpdir(), `hunch-${id}-coverage-`)) : null;
  try {
    const result = spawnSync("node", ["--enable-source-maps", "--conditions=@zod/source", "--import", tsxLoader, `.hunch-probes/${id}.ts`], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, ...(coverageDir ? { NODE_V8_COVERAGE: coverageDir } : {}) },
      timeout: 30_000,
    });
    const coverage = coverageDir && result.status === 0
      ? readdirSync(coverageDir).filter((file) => file.endsWith(".json")).flatMap((file) => {
        const value = JSON.parse(readFileSync(join(coverageDir, file), "utf8")) as { result?: Array<{ url?: string }> };
        return value.result?.some((script) => script.url?.endsWith(`/.hunch-probes/${id}.ts`)) ? [value] : [];
      })
      : [];
    return {
      value: result.status === 0 ? booleanOutput(result.stdout) : null,
      coverage,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } finally {
    if (coverageDir) rmSync(coverageDir, { recursive: true, force: true });
  }
}

function outcome(value: boolean | null): EvidenceOutcome {
  return value === true ? "green" : value === false ? "red" : "error";
}

function executionReceipt(targetCoverage: unknown[], controlCoverage: unknown[]): VerifiedEvidenceReceipt["execution"] {
  const counts = new Map<string, { target: number; control: number }>();
  for (const [side, coverage] of [["target", targetCoverage], ["control", controlCoverage]] as const) {
    for (const entry of coverage.flatMap(collectV8RangeEvidence)) {
      const current = counts.get(entry.owner) ?? { target: 0, control: 0 };
      current[side] += entry.count;
      counts.set(entry.owner, current);
    }
  }
  return [...counts].map(([owner, count]) => ({ owner, target_count: count.target, control_count: count.control }))
    .sort((left, right) => left.owner.localeCompare(right.owner))
    .slice(0, 500);
}

// Phase 1: pre-fix evidence only. No post-fix source or fixing diff is opened.
const predictions: FrozenPrediction[] = [];
for (const [index, entry] of tasks.cases.entries()) {
  const preFix = git(["rev-parse", `${entry.fixSha}^1`]).trim();
  const pre = extract(preFix, entry.id, "pre");
  try {
    const target = probe(pre, `${entry.id}-target`, entry.target, true);
    const control = probe(pre, `${entry.id}-control`, entry.control, true);
    const evidence: VerifiedEvidenceReceipt = {
      version: 1,
      claim: entry.issue,
      probe: { target_before: outcome(target.value), control_before: outcome(control.value) },
      execution: executionReceipt(target.coverage, control.coverage),
      interventions: [],
    };
    const sources = sourcesAt(pre);
    const baseline = diagnoseIssueCorrectionStage(entry.issue, sources, 5);
    const optimized = diagnoseIssueCorrectionStage(entry.issue, sources, 5, evidence);
    if (!optimized.optimization) throw new Error(`missing optimization receipt for ${entry.id}`);
    predictions.push({
      id: entry.id,
      fix_sha: entry.fixSha,
      pre_fix_sha: preFix,
      case_hash: sha256(JSON.stringify(entry)),
      pre_observed: { target: target.value, control: control.value },
      pre_authenticated: target.value === false && control.value === true,
      verified_evidence_receipt: evidence,
      baseline_top5: baseline.candidates.map((candidate) => candidate.owner),
      optimized_top5: optimized.candidates.map((candidate) => candidate.owner),
      optimization_receipt: optimized.optimization,
    });
    process.stderr.write(`[freeze ${index + 1}/${tasks.cases.length}] ${entry.id}: target=${target.value} control=${control.value} strategy=${optimized.optimization.evidence_strategy ?? "none"}\n`);
  } finally {
    rmSync(pre, { recursive: true, force: true });
  }
}

const predictionHash = sha256(JSON.stringify(predictions));
const optimizationReceiptHash = sha256(JSON.stringify(predictions.map((row) => row.optimization_receipt)));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({
  benchmark: tasks.benchmark,
  freeze_boundary: "written-before-post-fix-source-or-fixing-diff-was-opened",
  hashes: { ...EXPECTED, predictions: predictionHash, optimization_receipts: optimizationReceiptHash },
  predictions,
}, null, 2)}\n`);

function gitFile(sha: string, path: string): string | null {
  const result = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

function truthFor(preFix: string, fixSha: string): { paths: string[]; symbols: string[] } {
  const paths = git(["diff", "--name-only", "--diff-filter=ACMRT", preFix, fixSha, "--", "packages/zod/src"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path));
  const symbols = new Set<string>();
  for (const path of paths) {
    const changed = changedLineNumbers(git(["diff", "--unified=0", "--no-ext-diff", preFix, fixSha, "--", path]));
    for (const [sha, lines] of [[preFix, changed.before], [fixSha, changed.after]] as const) {
      const content = gitFile(sha, path);
      if (!content) continue;
      for (const span of declarationOwners(path, content)) {
        if ([...lines].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
      }
    }
  }
  return { paths: [...new Set(paths)].sort(), symbols: [...symbols].sort() };
}

const ownerPath = (owner: string): string => owner.split("::")[0]!;

// Phase 2 starts only after the prediction file exists.
const rows = predictions.map((prediction, index) => {
  const entry = tasks.cases.find((candidate) => candidate.id === prediction.id)!;
  const post = extract(entry.fixSha, entry.id, "post");
  let postTarget: ProbeRun;
  let postControl: ProbeRun;
  try {
    postTarget = probe(post, `${entry.id}-target`, entry.target, false);
    postControl = probe(post, `${entry.id}-control`, entry.control, false);
  } finally {
    rmSync(post, { recursive: true, force: true });
  }
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const authenticated = prediction.pre_authenticated && postTarget.value === true && postControl.value === true;
  const symbolScorable = truth.symbols.length > 0;
  const baselineHit = prediction.baseline_top5.some((owner) => truth.symbols.includes(owner));
  const optimizedHit = prediction.optimized_top5.some((owner) => truth.symbols.includes(owner));
  const baselineFile = prediction.baseline_top5.some((owner) => truth.paths.includes(ownerPath(owner)));
  const optimizedFile = prediction.optimized_top5.some((owner) => truth.paths.includes(ownerPath(owner)));
  process.stderr.write(`[score ${index + 1}/${predictions.length}] ${entry.id}: post=${postTarget.value}/${postControl.value} baseline=${baselineHit} optimized=${optimizedHit}\n`);
  return {
    ...prediction,
    post_observed: { target: postTarget.value, control: postControl.value },
    authenticated,
    ground_truth: truth,
    symbol_scorable: symbolScorable,
    baseline_hit: baselineHit,
    optimized_hit: optimizedHit,
    baseline_file: baselineFile,
    optimized_file: optimizedFile,
    rescue: !baselineHit && optimizedHit,
    loss: baselineHit && !optimizedHit,
    file_rescue: !baselineFile && optimizedFile,
    file_loss: baselineFile && !optimizedFile,
  };
});

const scorable = rows.filter((row) => row.authenticated && row.symbol_scorable);
const baselineHits = scorable.filter((row) => row.baseline_hit).length;
const optimizedHits = scorable.filter((row) => row.optimized_hit).length;
const baselineFiles = scorable.filter((row) => row.baseline_file).length;
const optimizedFiles = scorable.filter((row) => row.optimized_file).length;
const losses = scorable.filter((row) => row.loss).length;
const receiptsComplete = scorable.every((row) => /^[a-f0-9]{24}$/.test(row.optimization_receipt.receipt_id));
const promoted = scorable.length >= 4
  && optimizedHits > baselineHits
  && losses === 0
  && optimizedFiles >= baselineFiles
  && receiptsComplete;
const summary = {
  tasks: rows.length,
  authenticated_tasks: rows.filter((row) => row.authenticated).length,
  scorable_tasks: scorable.length,
  baseline_top5_hits: baselineHits,
  optimized_top5_hits: optimizedHits,
  baseline_top5_rate: scorable.length ? baselineHits / scorable.length : null,
  optimized_top5_rate: scorable.length ? optimizedHits / scorable.length : null,
  top5_improvement_points: scorable.length ? (optimizedHits - baselineHits) / scorable.length : null,
  baseline_file_hits: baselineFiles,
  optimized_file_hits: optimizedFiles,
  file_improvement_points: scorable.length ? (optimizedFiles - baselineFiles) / scorable.length : null,
  rescues: scorable.filter((row) => row.rescue).length,
  losses,
  file_rescues: scorable.filter((row) => row.file_rescue).length,
  file_losses: scorable.filter((row) => row.file_loss).length,
  optimization_receipts_complete: receiptsComplete,
  decision: `${promoted ? "promote" : "reject"}-${config.decisionName}`,
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "Predictions and optimization receipts were frozen from issue text, pre-fix source, and authenticated target/control execution before post-fix source or fixing diffs were opened.",
  hashes: { ...EXPECTED, predictions: predictionHash, optimization_receipts: optimizationReceiptHash },
  rule: EVIDENCE_GUIDED_SHORTLIST_RULE,
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);

const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  `# ${config.title}`,
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Authenticated/scorable: ${summary.authenticated_tasks}/${summary.scorable_tasks} of ${summary.tasks}`,
  `- Baseline top five: ${summary.baseline_top5_hits}/${summary.scorable_tasks} (${pct(summary.baseline_top5_rate)})`,
  `- Optimized top five: ${summary.optimized_top5_hits}/${summary.scorable_tasks} (${pct(summary.optimized_top5_rate)})`,
  `- Improvement: ${pct(summary.top5_improvement_points)} points`,
  `- Baseline/optimized correct file: ${summary.baseline_file_hits}/${summary.optimized_file_hits}`,
  `- File improvement: ${pct(summary.file_improvement_points)} points`,
  `- Rescues/losses: ${summary.rescues}/${summary.losses}`,
  `- Receipts complete: ${summary.optimization_receipts_complete ? "yes" : "no"}`,
  `- Exact-owner output: ${summary.exact_owner_policy}`,
  "",
  "| case | baseline | optimized | rescue | file | strategy | receipt | truth |",
  "|---|:---:|:---:|:---:|:---:|---|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.baseline_hit ? "hit" : "miss"} | ${row.optimized_hit ? "hit" : "miss"} | ${row.rescue ? "yes" : "no"} | ${row.optimized_file ? "yes" : "no"} | ${row.optimization_receipt.evidence_strategy ?? row.optimization_receipt.reason} | \`${row.optimization_receipt.receipt_id}\` | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  `Optimization-receipt SHA-256: \`${optimizationReceiptHash}\`.`,
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary }, null, 2)}\n`);
