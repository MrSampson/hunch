/** Preregistered fresh transfer test for deterministic causal interventions. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { rankIssueCorrectionStageCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { rankIssueAdaptiveCorrectionCandidates } from "./adaptive-stage-ranker.js";
import { adjudicateCausalInterventions, applyCausalIntervention, enumerateCausalInterventions } from "./causal-intervention.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { rankCausalBoundaryCandidates } from "./v8-owner-evidence.js";

interface TransferCase { id: string; fixSha: string; issue: string; target: string; control: string }
interface TaskFile { benchmark: string; cases: TransferCase[] }
interface ProbeRun { value: boolean | null; coverage: unknown[]; stdout: string; stderr: string }

const EXPECTED = {
  tasks: "eec7e8ac50c7759892ba442685d0cf3e355385806ec4a8ef957536bae84173cc",
  intervention: "e25ed0f4171c65bdab27a92b9c77debbc43af4ff23b0aba21c2d510341495cf4",
  adaptive: "40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f",
  runtime: "1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4",
  stage: "a86cf735f240b9440d4332b74b21f665163316eed31590bf15c0efa10346fb25",
} as const;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const taskPath = join(import.meta.dirname, "results", "2026-08-25-zod-causal-intervention-transfer-v1.tasks.json");
const tasks = JSON.parse(readFileSync(taskPath, "utf8")) as TaskFile;
const outputBase = resolve(process.env.HUNCH_INTERVENTION_TRANSFER_OUT ?? join(import.meta.dirname, "results", "2026-08-25-zod-causal-intervention-transfer-v1"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const tsxLoader = import.meta.resolve("tsx/esm");

function assertHash(path: string, expected: string): void {
  const actual = sha256(readFileSync(path));
  if (actual !== expected) throw new Error(`frozen hash mismatch for ${path}: ${actual}`);
}
assertHash(taskPath, EXPECTED.tasks);
assertHash(join(import.meta.dirname, "causal-intervention.ts"), EXPECTED.intervention);
assertHash(join(import.meta.dirname, "adaptive-stage-ranker.ts"), EXPECTED.adaptive);
assertHash(join(import.meta.dirname, "v8-owner-evidence.ts"), EXPECTED.runtime);
assertHash(resolve(import.meta.dirname, "../../src/core/correctionStage.ts"), EXPECTED.stage);

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
  const root = mkdtempSync(join(tmpdir(), `hunch-intervention-${id}-${side}-`));
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
    ...runtime.slice(0, 8).map((candidate) => candidate.owner),
    ...rankIssueAdaptiveCorrectionCandidates(issue, sources).slice(0, 8).map((candidate) => candidate.owner),
    ...rankIssueCorrectionStageCandidates(issue, sources).slice(0, 8).map((candidate) => candidate.owner),
  ];
  return [...new Set(ordered)].slice(0, 14).map((owner, rank) => {
    const candidate = runtimeByOwner.get(owner);
    return {
      owner,
      rank: rank + 1,
      preferred: candidate?.target_only_branch_lines.length ? candidate.target_only_branch_lines : candidate?.target_only_lines ?? [],
    };
  });
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
    const authenticated = target.value === false && control.value === true && postTarget.value === true;
    const sources = sourcesAt(pre);
    const runtime = authenticated
      ? rankCausalBoundaryCandidates(entry.issue, sources, target.coverage, control.coverage, `${target.stderr}${target.stdout}`)
      : [];
    const candidates = authenticated ? candidateOwners(entry.issue, sources, runtime) : [];
    const adaptiveTop = rankIssueAdaptiveCorrectionCandidates(entry.issue, sources).slice(0, 5).map((candidate) => candidate.owner);
    const sourceByPath = new Map(sources.map((source) => [source.path, source.content]));
    const receipts = [] as Array<Record<string, unknown>>;
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const path = candidate.owner.split("::")[0]!;
      const original = sourceByPath.get(path);
      if (!original) continue;
      const interventions = enumerateCausalInterventions(path, original, candidate.owner, candidate.preferred, 20);
      let wins = 0;
      for (const intervention of interventions) {
        const targetPath = join(pre, path);
        try {
          writeFileSync(targetPath, applyCausalIntervention(original, intervention));
          const mutatedTarget = probe(pre, `${entry.id}-mutated-target`, entry.target, false).value;
          const mutatedControl = mutatedTarget === true ? probe(pre, `${entry.id}-mutated-control`, entry.control, false).value : null;
          const admitted = mutatedTarget === true && mutatedControl === true;
          if (admitted) wins++;
          receipts.push({ candidate_rank: candidate.rank, ...intervention, target: mutatedTarget, control: mutatedControl, admitted });
        } finally {
          writeFileSync(targetPath, original);
        }
      }
      process.stderr.write(`[${caseIndex + 1}/${tasks.cases.length} ${entry.id}] ${candidateIndex + 1}/${candidates.length} ${candidate.owner}: ${wins}/${interventions.length}\n`);
    }
    const adjudication = adjudicateCausalInterventions(receipts.map((receipt) => ({ owner: String(receipt.owner), admitted: receipt.admitted === true })));
    predictions.push({
      id: entry.id,
      fix_sha: entry.fixSha,
      pre_fix_sha: preFix,
      case_hash: sha256(JSON.stringify(entry)),
      observed: { pre_target: target.value, pre_control: control.value, post_target: postTarget.value },
      authenticated,
      adaptive_top5: adaptiveTop,
      candidate_owners: candidates.map((candidate) => candidate.owner),
      interventions_attempted: receipts.length,
      intervention_receipts: receipts,
      adjudication,
      predicted_owner: adjudication.owner,
    });
  } finally {
    rmSync(pre, { recursive: true, force: true });
    rmSync(post, { recursive: true, force: true });
  }
}

// Prediction freeze occurs before the first fixing diff is opened.
const predictionHash = sha256(JSON.stringify(predictions));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({ benchmark: tasks.benchmark, task_hash: EXPECTED.tasks, prediction_hash: predictionHash, predictions }, null, 2)}\n`);

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

const rows = predictions.map((prediction) => {
  const truth = truthFor(String(prediction.pre_fix_sha), String(prediction.fix_sha));
  const owner = typeof prediction.predicted_owner === "string" ? prediction.predicted_owner : null;
  const path = owner?.split("::")[0] ?? null;
  const adaptive = prediction.adaptive_top5 as string[];
  return {
    ...prediction,
    ground_truth: truth,
    symbol_scorable: truth.symbols.length > 0,
    exact: Boolean(owner && truth.symbols.includes(owner)),
    file: Boolean(path && truth.paths.includes(path)),
    adaptive_top5_hit: adaptive.some((candidate) => truth.symbols.includes(candidate)),
    adaptive_file_hit: adaptive.some((candidate) => truth.paths.includes(candidate.split("::")[0]!)),
  };
});
const scorable = rows.filter((row) => row.authenticated && row.symbol_scorable);
const predicted = scorable.filter((row) => row.predicted_owner);
const exact = predicted.filter((row) => row.exact).length;
const files = predicted.filter((row) => row.file).length;
const coverage = scorable.length ? predicted.length / scorable.length : null;
const precision = predicted.length ? exact / predicted.length : null;
const promoted = scorable.length >= 7 && predicted.length >= 2 && (coverage ?? 0) >= 0.25 && (precision ?? 0) >= 0.9 && files === predicted.length;
const summary = {
  tasks: rows.length,
  authenticated_tasks: rows.filter((row) => row.authenticated).length,
  scorable_tasks: scorable.length,
  predictions: predicted.length,
  abstentions: scorable.length - predicted.length,
  coverage,
  exact,
  exact_precision: precision,
  file_correct: files,
  incorrect_files: predicted.length - files,
  adaptive_top5_hits: scorable.filter((row) => row.adaptive_top5_hit).length,
  adaptive_file_hits: scorable.filter((row) => row.adaptive_file_hit).length,
  decision: promoted ? "eligible-for-cross-repository-safety-test" : "reject-causal-intervention-owner",
};
const result = {
  benchmark: tasks.benchmark,
  generated_at: new Date().toISOString(),
  methodology: "All intervention predictions were frozen before fixing diffs were read. Only red-before, green-control, green-after cases are scored.",
  hashes: { ...EXPECTED, predictions: predictionHash },
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
const report = [
  "# Zod causal-intervention transfer v1",
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Authenticated: ${summary.authenticated_tasks}/${summary.tasks}`,
  `- Scorable: ${summary.scorable_tasks}/${summary.tasks}`,
  `- Owner predictions: ${summary.predictions}/${summary.scorable_tasks} (${pct(summary.coverage)})`,
  `- Exact symbol precision: ${summary.exact}/${summary.predictions} (${pct(summary.exact_precision)})`,
  `- Correct predicted files: ${summary.file_correct}/${summary.predictions}`,
  `- Static adaptive top-five: ${summary.adaptive_top5_hits}/${summary.scorable_tasks}`,
  "",
  "| task | authenticated | intervention owner | exact | file | adjudication | truth |",
  "|---|:---:|---|:---:|:---:|---|---|",
  ...rows.map((row) => `| ${row.id} | ${row.authenticated ? "yes" : "no"} | ${row.predicted_owner ? `\`${row.predicted_owner}\`` : "abstain"} | ${row.exact ? "yes" : "no"} | ${row.file ? "yes" : "no"} | ${row.adjudication.reason} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  "",
];
writeFileSync(`${outputBase}.md`, report.join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary }, null, 2)}\n`);

if (process.argv[1] && import.meta.url !== pathToFileURL(resolve(process.argv[1])).href) throw new Error(`unexpected import of ${basename(import.meta.url)}`);
