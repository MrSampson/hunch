/** Preregistered fresh transfer test for the production evidence-guided shortlist. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  diagnoseIssueCorrectionStage,
  EVIDENCE_GUIDED_SHORTLIST_RULE,
  rankIssueCorrectionStageCandidates,
} from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import type { EvidenceOutcome, VerifiedEvidenceReceipt } from "../../src/core/evidenceMap.js";
import { rankIssueAdaptiveCorrectionCandidates } from "./adaptive-stage-ranker.js";
import { applyCausalIntervention, enumerateCausalInterventions } from "./causal-intervention.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { collectV8RangeEvidence, rankCausalBoundaryCandidates } from "./v8-owner-evidence.js";

interface TransferCase { id: string; fixSha: string; issue: string; target: string; control: string }
interface TaskFile { benchmark: string; cases: TransferCase[] }
interface ProbeRun { value: boolean | null; coverage: unknown[]; stdout: string; stderr: string }

const EXPECTED = {
  tasks: "dfb13178b0d2a0152e85bceb8d9f73ca0f8e41ce00cda8948a09c7c8635e1f86",
  production: "1250b92093c2444a0b91097734eaea6816e95c70b023e4eadcb83d2613f039ae",
  intervention: "e25ed0f4171c65bdab27a92b9c77debbc43af4ff23b0aba21c2d510341495cf4",
  adaptive: "40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f",
  runtime: "1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4",
} as const;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const taskPath = join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1.tasks.json");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;
const outputBase = resolve(process.env.HUNCH_EVIDENCE_OPTIMIZATION_OUT ?? join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const tsxLoader = import.meta.resolve("tsx/esm");

function assertHash(path: string, expected: string): void {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
}
assertHash(taskPath, EXPECTED.tasks);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.production);
assertHash(join(import.meta.dirname, "causal-intervention.ts"), EXPECTED.intervention);
assertHash(join(import.meta.dirname, "adaptive-stage-ranker.ts"), EXPECTED.adaptive);
assertHash(join(import.meta.dirname, "v8-owner-evidence.ts"), EXPECTED.runtime);

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
  const root = mkdtempSync(join(tmpdir(), `hunch-evidence-opt-${id}-${side}-`));
  const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "package.json", "packages/zod/package.json", "packages/zod/src/v4"], { maxBuffer: 32 * 1024 * 1024 });
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
    return { value: result.status === 0 ? booleanOutput(result.stdout) : null, coverage, stdout: result.stdout, stderr: result.stderr };
  } finally {
    if (coverageDir) rmSync(coverageDir, { recursive: true, force: true });
  }
}

function candidateOwners(
  issue: string,
  sources: ContractAxisOwnerSource[],
  runtime: ReturnType<typeof rankCausalBoundaryCandidates>,
): Array<{ owner: string; rank: number; preferred: number[] }> {
  const runtimeByOwner = new Map(runtime.map((candidate) => [candidate.owner, candidate]));
  const ordered = [
    ...runtime.slice(0, 6).map((candidate) => candidate.owner),
    ...rankIssueAdaptiveCorrectionCandidates(issue, sources).slice(0, 6).map((candidate) => candidate.owner),
    ...rankIssueCorrectionStageCandidates(issue, sources).slice(0, 6).map((candidate) => candidate.owner),
  ];
  return [...new Set(ordered)].slice(0, 10).map((owner, rank) => {
    const candidate = runtimeByOwner.get(owner);
    return {
      owner,
      rank: rank + 1,
      preferred: candidate?.target_only_branch_lines.length ? candidate.target_only_branch_lines : candidate?.target_only_lines ?? [],
    };
  });
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
    .sort((a, b) => a.owner.localeCompare(b.owner))
    .slice(0, 500);
}

const predictions = [] as Array<Record<string, unknown>>;
for (const [caseIndex, entry] of tasks.cases.entries()) {
  const preFix = git(["rev-parse", `${entry.fixSha}^1`]).trim();
  const pre = extract(preFix, entry.id, "pre");
  const post = extract(entry.fixSha, entry.id, "post");
  try {
    const target = probe(pre, `${entry.id}-target`, entry.target, true);
    const control = probe(pre, `${entry.id}-control`, entry.control, true);
    const postTarget = probe(post, `${entry.id}-target`, entry.target, false);
    const postControl = probe(post, `${entry.id}-control`, entry.control, false);
    const authenticated = target.value === false && control.value === true && postTarget.value === true && postControl.value === true;
    const sources = sourcesAt(pre);
    const runtime = authenticated
      ? rankCausalBoundaryCandidates(entry.issue, sources, target.coverage, control.coverage, `${target.stderr}${target.stdout}`)
      : [];
    const candidates = authenticated ? candidateOwners(entry.issue, sources, runtime) : [];
    const sourceByPath = new Map(sources.map((source) => [source.path, source.content]));
    const interventions = [] as Array<{
      candidate_rank: number;
      owner: string;
      mutation_id: string;
      operator: string;
      line: number;
      target: boolean | null;
      control: boolean | null;
    }>;
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const path = candidate.owner.split("::")[0]!;
      const original = sourceByPath.get(path);
      if (!original) continue;
      const mutations = enumerateCausalInterventions(path, original, candidate.owner, candidate.preferred, 8);
      let admitted = 0;
      for (const mutation of mutations) {
        const targetPath = join(pre, path);
        try {
          writeFileSync(targetPath, applyCausalIntervention(original, mutation));
          const mutatedTarget = probe(pre, `${entry.id}-mutated-target`, entry.target, false).value;
          const mutatedControl = mutatedTarget === true ? probe(pre, `${entry.id}-mutated-control`, entry.control, false).value : null;
          if (mutatedTarget === true && mutatedControl === true) admitted++;
          interventions.push({
            candidate_rank: candidate.rank,
            owner: mutation.owner,
            mutation_id: mutation.id,
            operator: mutation.operator,
            line: mutation.line,
            target: mutatedTarget,
            control: mutatedControl,
          });
        } finally {
          writeFileSync(targetPath, original);
        }
      }
      process.stderr.write(`[${caseIndex + 1}/${tasks.cases.length} ${entry.id}] ${candidateIndex + 1}/${candidates.length} ${candidate.owner}: ${admitted}/${mutations.length}\n`);
    }

    const evidence: VerifiedEvidenceReceipt = {
      version: 1,
      claim: entry.issue,
      probe: {
        target_before: outcome(target.value),
        control_before: outcome(control.value),
        target_after: outcome(postTarget.value),
        control_after: outcome(postControl.value),
      },
      execution: executionReceipt(target.coverage, control.coverage),
      interventions: interventions.map((receipt) => ({
        owner: receipt.owner,
        mutation_id: receipt.mutation_id,
        target_after: outcome(receipt.target),
        control_after: receipt.control === null ? "not-run" : outcome(receipt.control),
      })),
    };
    const baseline = diagnoseIssueCorrectionStage(entry.issue, sources, 5);
    const optimized = diagnoseIssueCorrectionStage(entry.issue, sources, 5, evidence);
    if (!optimized.optimization) throw new Error(`missing optimization receipt for ${entry.id}`);
    predictions.push({
      id: entry.id,
      fix_sha: entry.fixSha,
      pre_fix_sha: preFix,
      case_hash: sha256(JSON.stringify(entry)),
      observed: {
        pre_target: target.value,
        pre_control: control.value,
        post_target: postTarget.value,
        post_control: postControl.value,
      },
      authenticated,
      candidate_owners: candidates.map((candidate) => candidate.owner),
      interventions_attempted: interventions.length,
      intervention_receipts: interventions,
      verified_evidence_receipt: evidence,
      baseline_top5: baseline.candidates.map((candidate) => candidate.owner),
      optimized_top5: optimized.candidates.map((candidate) => candidate.owner),
      optimization_receipt: optimized.optimization,
    });
  } finally {
    rmSync(pre, { recursive: true, force: true });
    rmSync(post, { recursive: true, force: true });
  }
}

// The prediction and receipt freeze is written before any fixing diff is opened.
const predictionHash = sha256(JSON.stringify(predictions));
const optimizationReceiptHash = sha256(JSON.stringify(predictions.map((row) => row.optimization_receipt)));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({
  benchmark: tasks.benchmark,
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
const rows = predictions.map((prediction) => {
  const truth = truthFor(String(prediction.pre_fix_sha), String(prediction.fix_sha));
  const baseline = prediction.baseline_top5 as string[];
  const optimized = prediction.optimized_top5 as string[];
  const baselineHit = baseline.some((owner) => truth.symbols.includes(owner));
  const optimizedHit = optimized.some((owner) => truth.symbols.includes(owner));
  const baselineFile = baseline.some((owner) => truth.paths.includes(ownerPath(owner)));
  const optimizedFile = optimized.some((owner) => truth.paths.includes(ownerPath(owner)));
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
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
const receiptsComplete = scorable.every((row) => typeof (row.optimization_receipt as { receipt_id?: unknown }).receipt_id === "string");
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
  decision: promoted ? "promote-evidence-guided-shortlist-v1" : "reject-evidence-guided-shortlist-v1",
  exact_owner_policy: "disabled",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "Predictions, interventions, and optimization receipts were frozen from issue text and pre-fix source before fixing diffs were opened. Only authenticated, declaration-scorable cases are scored.",
  hashes: { ...EXPECTED, predictions: predictionHash, optimization_receipts: optimizationReceiptHash },
  rule: EVIDENCE_GUIDED_SHORTLIST_RULE,
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  "# Evidence-guided shortlist optimization transfer v1",
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Authenticated: ${summary.authenticated_tasks}/${summary.tasks}`,
  `- Scorable: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Baseline top five: ${summary.baseline_top5_hits}/${summary.scorable_tasks} (${pct(summary.baseline_top5_rate)})`,
  `- Optimized top five: ${summary.optimized_top5_hits}/${summary.scorable_tasks} (${pct(summary.optimized_top5_rate)})`,
  `- Improvement: ${pct(summary.top5_improvement_points)} points`,
  `- Baseline correct file: ${summary.baseline_file_hits}/${summary.scorable_tasks}`,
  `- Optimized correct file: ${summary.optimized_file_hits}/${summary.scorable_tasks} (${pct(summary.file_improvement_points)} points)`,
  `- Rescues/losses: ${summary.rescues}/${summary.losses}`,
  `- Optimization receipts complete: ${summary.optimization_receipts_complete ? "yes" : "no"}`,
  `- Exact-owner output: ${summary.exact_owner_policy}`,
  "",
  "| case | baseline | optimized | rescue | file | optimization | receipt | truth |",
  "|---|:---:|:---:|:---:|:---:|---|---|---|",
  ...rows.map((row) => {
    const receipt = row.optimization_receipt as { applied: boolean; reason: string; receipt_id: string };
    return `| ${row.id} | ${row.baseline_hit ? "hit" : "miss"} | ${row.optimized_hit ? "hit" : "miss"} | ${row.rescue ? "yes" : "no"} | ${row.optimized_file ? "yes" : "no"} | ${receipt.applied ? "applied" : receipt.reason} | \`${receipt.receipt_id}\` | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`;
  }),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  `Optimization-receipt SHA-256: \`${optimizationReceiptHash}\`.`,
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary }, null, 2)}\n`);

if (process.argv[1] && import.meta.url !== pathToFileURL(resolve(process.argv[1])).href) throw new Error(`unexpected import of ${basename(import.meta.url)}`);
