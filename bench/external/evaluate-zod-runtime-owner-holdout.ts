/**
 * Fresh runtime-evidence owner holdout.
 *
 * The cases and probes are frozen from issue reports. Every prediction is made
 * from the first parent before any fixing diff is opened. A case is scorable
 * only when its target is red before the fix, green at the fix, and its
 * pre-fix control is green.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import { collectStackOwnerEvidence, collectV8OwnerEvidence, conditionOwnersOnRuntimeEvidence, rankCausalBoundaryCandidates, rankIssueCorrectionStageCandidates } from "./v8-owner-evidence.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface HoldoutCase {
  id: string;
  fixSha: string;
  issue: string;
  target: string;
  control: string;
}

const cases: HoldoutCase[] = [
  {
    id: "zod-5968",
    fixSha: "78b523f0e81c0f19939cd8ffeb945ebca76d1d2f",
    issue: "Object property with preprocess is incorrectly omitted from required by toJSONSchema({ io: 'input' }). A plain string and a preprocessed string should both be required.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const schema=z.object({plain:z.string(),withPreprocess:z.preprocess(v=>v,z.string())});const json=z.toJSONSchema(schema,{io:"input"}) as any;console.log(json.required?.includes("withPreprocess")===true);',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const json=z.toJSONSchema(z.object({required:z.string(),optional:z.string().optional()}),{io:"input"}) as any;console.log(json.required?.includes("required")===true&&!json.required?.includes("optional"));',
  },
  {
    id: "zod-6156",
    fixSha: "4cc4053d28fe6879fa360e2780ab52226202904e",
    issue: "looseRecord with a closed enum key schema reports extra keys as fatal. z.looseRecord(z.enum(['foo','bar']), z.any()) should accept a baz key like the regex-key version does.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";console.log(z.looseRecord(z.enum(["foo","bar"]),z.any()).safeParse({foo:123,bar:{},baz:null}).success);',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";console.log(z.looseRecord(z.string().regex(/^foo|bar$/),z.any()).safeParse({foo:123,bar:{},baz:null}).success);',
  },
  {
    id: "zod-6176",
    fixSha: "b53e53ccb3941bd3c8c651b4b1dcf1b5484726b0",
    issue: "String .length() and collection .size() error messages ignore the exact flag. A fixed-length validation should say exactly rather than use minimum/maximum range wording.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const result=z.string().length(4).safeParse("abc");console.log(!result.success&&result.error.issues[0]?.message.toLowerCase().includes("exactly"));',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const result=z.string().min(4).safeParse("abc");console.log(!result.success&&!result.error.issues[0]?.message.toLowerCase().includes("exactly"));',
  },
  {
    id: "zod-6342",
    fixSha: "4c27fe87976731e2347b0b9daa8f8d5fc8a19ac8",
    issue: "z.xor() accepts the intended input with strict objects but rejects it with regular objects. The more specific extended object should win when the base object strips the extra key.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const base=z.object({name:z.enum(["windows","osx","linux"])});const version=base.extend({version:z.string().nonempty()});console.log(z.xor([base,version]).safeParse({name:"windows",version:"^10\\\\."}).success);',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const base=z.strictObject({name:z.enum(["windows","osx","linux"])});const version=base.extend({version:z.string().nonempty()});console.log(z.xor([base,version]).safeParse({name:"windows",version:"^10\\\\."}).success);',
  },
  {
    id: "zod-5980",
    fixSha: "a1904fc238d8bcf1a45806bd73b0b0a8006cf77a",
    issue: "Passing a numeric timestamp to ZodDate min() or max() makes the resulting issue origin 'number'. The validated value is still a date, so the origin should be 'date'.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const result=z.date().min(new Date(2020,6,10).getTime()).safeParse(new Date(2020,6,5));console.log(!result.success&&result.error.issues[0]?.origin==="date");',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const result=z.date().min(new Date(2020,6,10)).safeParse(new Date(2020,6,5));console.log(!result.success&&result.error.issues[0]?.origin==="date");',
  },
  {
    id: "zod-6027",
    fixSha: "bd18314c6d0e29a7890ecea73e206f8bbca54ec9",
    issue: "toJSONSchema builds an invalid JSON Pointer when a metadata id contains slash or tilde. The $ref token must escape ~ as ~0 and / as ~1 while the $defs key stays unchanged.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const User=z.object({name:z.string()}).meta({id:"Shared/User~"});const json=z.toJSONSchema(z.object({User})) as any;console.log(json.properties?.User?.$ref==="#/$defs/Shared~1User~0");',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const User=z.object({name:z.string()}).meta({id:"User"});const json=z.toJSONSchema(z.object({User})) as any;console.log(json.properties?.User?.$ref==="#/$defs/User");',
  },
  {
    id: "zod-6296",
    fixSha: "9a7ecc358b5b9bf9e2a682cf797ae4c14413e5a6",
    issue: "fromJSONSchema({ type: 'string', format: 'date-time' }) rejects valid RFC 3339 timestamps with numeric UTC offsets. It should accept Z and numeric offsets but reject local timestamps without an offset.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";const schema=z.fromJSONSchema({type:"string",format:"date-time"});console.log(schema.safeParse("2026-07-29T16:30:00+02:00").success);',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const schema=z.fromJSONSchema({type:"string",format:"date-time"});console.log(schema.safeParse("2026-07-29T14:30:00Z").success&&!schema.safeParse("2026-07-29T14:30:00").success);',
  },
];

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const causalBoundaryCalibration = process.env.HUNCH_CAUSAL_BOUNDARY_CALIBRATION === "1";
const correctionStageCalibration = process.env.HUNCH_CORRECTION_STAGE_CALIBRATION === "1";
const developmentCalibration = causalBoundaryCalibration || correctionStageCalibration;
const benchmarkName = correctionStageCalibration
  ? "zod-correction-stage-calibration-v1"
  : causalBoundaryCalibration ? "zod-causal-boundary-calibration-v1" : "zod-runtime-owner-holdout-v3";
const tsxLoader = import.meta.resolve("tsx/esm");
const outputBase = resolve(process.env.HUNCH_RUNTIME_HOLDOUT_OUT ?? join(
  import.meta.dirname,
  "results",
  correctionStageCalibration
    ? "2026-08-25-zod-correction-stage-calibration-v1"
    : causalBoundaryCalibration ? "2026-08-25-zod-causal-boundary-calibration-v1" : "2026-08-25-zod-runtime-owner-holdout-v3",
));
const priorPostTarget = developmentCalibration
  ? new Map((JSON.parse(readFileSync(join(import.meta.dirname, "results", "2026-08-25-zod-runtime-owner-holdout-v3.json"), "utf8")) as {
    rows: Array<{ id: string; observed: { post_target: boolean | null } }>;
  }).rows.map((row) => [row.id, row.observed.post_target]))
  : new Map<string, boolean | null>();

function git(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function sourcesAt(worktree: string): ContractAxisOwnerSource[] {
  return walk(join(worktree, "packages/zod/src/v4"))
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path: path.slice(worktree.length + 1), content: readFileSync(path, "utf8") }));
}

interface ProbeRun { coverage: unknown[]; stdout: string; stderr: string }
function runProbe(worktree: string, name: string, content: string, collectCoverage: boolean): ProbeRun {
  const artifactDir = join(worktree, ".hunch-probes");
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, `${name}.ts`), content);
  const coverageDir = collectCoverage ? mkdtempSync(join(tmpdir(), `hunch-${name}-coverage-`)) : null;
  try {
    const run = spawnSync("node", ["--enable-source-maps", "--conditions=@zod/source", "--import", tsxLoader, `.hunch-probes/${name}.ts`], {
      cwd: worktree,
      encoding: "utf8",
      env: { ...process.env, ...(coverageDir ? { NODE_V8_COVERAGE: coverageDir } : {}) },
      timeout: 60_000,
    });
    if (run.status !== 0) throw new Error(`${name} exited ${run.status}: ${run.stderr}`);
    const coverage = coverageDir ? readdirSync(coverageDir).filter((file) => file.endsWith(".json")).flatMap((file) => {
      const value = JSON.parse(readFileSync(join(coverageDir, file), "utf8")) as { result?: Array<{ url?: string }> };
      return value.result?.some((script) => script.url?.endsWith(`/.hunch-probes/${name}.ts`)) ? [value] : [];
    }) : [];
    return { coverage, stdout: run.stdout, stderr: run.stderr };
  } finally {
    if (coverageDir) rmSync(coverageDir, { recursive: true, force: true });
  }
}

function booleanOutput(output: string): boolean | null {
  const last = output.trim().split(/\r?\n/).at(-1);
  return last === "true" ? true : last === "false" ? false : null;
}

function addWorktree(sha: string, prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "package.json", "packages/zod/package.json", "packages/zod/src/v4"], { maxBuffer: 32 * 1024 * 1024 });
  const extraction = spawnSync("tar", ["-xf", "-", "-C", dir], { input: archive });
  if (extraction.status !== 0) throw new Error(`failed to extract ${sha}: ${String(extraction.stderr)}`);
  return dir;
}

function removeWorktree(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function gitFile(sha: string, path: string): string | null {
  const shown = spawnSync("git", ["-C", zod, "show", `${sha}:${path}`], { encoding: "utf8" });
  return shown.status === 0 ? shown.stdout : null;
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

const predictions = [] as Array<{
  id: string;
  fix_sha: string;
  pre_fix_sha: string;
  case_hash: string;
  authenticated: boolean;
  observed: { pre_target: boolean | null; pre_control: boolean | null; post_target: boolean | null };
  stack_owners: string[];
  top: ReturnType<typeof conditionOwnersOnRuntimeEvidence> | ReturnType<typeof rankCausalBoundaryCandidates> | ReturnType<typeof rankIssueCorrectionStageCandidates>;
}>;

for (const [index, entry] of cases.entries()) {
  const preFix = git(["rev-parse", `${entry.fixSha}^1`]).trim();
  const preDir = addWorktree(preFix, `hunch-${entry.id}-pre-`);
  const postDir = developmentCalibration ? null : addWorktree(entry.fixSha, `hunch-${entry.id}-post-`);
  try {
    const target = runProbe(preDir, `${entry.id}-target`, entry.target, !correctionStageCalibration);
    const control = runProbe(preDir, `${entry.id}-control`, entry.control, !correctionStageCalibration);
    const postTarget = postDir
      ? booleanOutput(runProbe(postDir, `${entry.id}-target`, entry.target, false).stdout)
      : priorPostTarget.get(entry.id) ?? null;
    const sources = sourcesAt(preDir);
    const targetOutput = `${target.stderr}${target.stdout}`;
    const top = (correctionStageCalibration
      ? rankIssueCorrectionStageCandidates(entry.issue, sources)
      : causalBoundaryCalibration
        ? rankCausalBoundaryCandidates(entry.issue, sources, target.coverage, control.coverage, targetOutput)
        : conditionOwnersOnRuntimeEvidence(entry.issue, sources, target.coverage, control.coverage, targetOutput)).slice(0, 10);
    const observed = {
      pre_target: booleanOutput(target.stdout),
      pre_control: booleanOutput(control.stdout),
      post_target: postTarget,
    };
    predictions.push({
      id: entry.id,
      fix_sha: entry.fixSha,
      pre_fix_sha: preFix,
      case_hash: sha256(JSON.stringify(entry)),
      authenticated: observed.pre_target === false && observed.pre_control === true && observed.post_target === true,
      observed,
      stack_owners: collectStackOwnerEvidence(targetOutput, sources),
      top,
    });
    process.stderr.write(`[predict ${index + 1}/${cases.length}] ${entry.id}: ${top[0]?.owner ?? "abstain"}; auth=${JSON.stringify(observed)}\n`);
  } finally {
    removeWorktree(preDir);
    if (postDir) removeWorktree(postDir);
  }
}

// Freeze all predictions before revealing any future source diff.
const predictionHash = sha256(JSON.stringify(predictions));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({ benchmark: benchmarkName, prediction_hash: predictionHash, predictions }, null, 2)}\n`);

const rows = predictions.map((prediction) => {
  const truth = truthFor(prediction.pre_fix_sha, prediction.fix_sha);
  const predicted = prediction.top[0]?.owner ?? null;
  const predictedPath = predicted?.split("::")[0] ?? null;
  return {
    ...prediction,
    ground_truth: truth,
    exact_symbol_correct: Boolean(prediction.authenticated && predicted && truth.symbols.includes(predicted)),
    top5_symbol_hit: Boolean(prediction.authenticated && prediction.top.slice(0, 5).some((candidate) => truth.symbols.includes(candidate.owner))),
    file_correct: Boolean(prediction.authenticated && predictedPath && truth.paths.includes(predictedPath)),
    owner_disclosed_in_issue: truth.symbols.some((owner) => entryText(prediction.id).toLowerCase().includes((owner.split("::")[1] ?? "").toLowerCase())),
  };
});

function entryText(id: string): string {
  return cases.find((entry) => entry.id === id)?.issue ?? "";
}

const scorable = rows.filter((row) => row.authenticated && row.ground_truth.symbols.length > 0);
const summary = {
  tasks: rows.length,
  authenticated_tasks: rows.filter((row) => row.authenticated).length,
  scorable_tasks: scorable.length,
  exact_symbol_correct: scorable.filter((row) => row.exact_symbol_correct).length,
  top5_symbol_hits: scorable.filter((row) => row.top5_symbol_hit).length,
  file_correct: scorable.filter((row) => row.file_correct).length,
  decision: scorable.length >= 10 && scorable.filter((row) => row.exact_symbol_correct).length / scorable.length >= 0.9
    ? "eligible-for-larger-transfer-test"
    : "keep-experimental",
};
const result = {
  benchmark: benchmarkName,
  calibration_only: developmentCalibration,
  generated_at: new Date().toISOString(),
  cases_hash: sha256(JSON.stringify(cases)),
  prediction_hash: predictionHash,
  methodology: correctionStageCalibration
    ? "Correction-stage routing was frozen before rerunning already-revealed development cases. This is not transfer evidence."
    : causalBoundaryCalibration
      ? "Branch-level causal-boundary ranking was frozen before rerunning already-revealed development cases. This is not transfer evidence."
    : "All predictions were written before future source diffs were read. Only red-before, green-after, passing-control probes are scored.",
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);

const lines = [
  correctionStageCalibration
    ? "# Zod correction-stage calibration v1"
    : causalBoundaryCalibration ? "# Zod causal-boundary calibration v1" : "# Zod runtime-evidence owner holdout v3",
  "",
  result.methodology,
  "",
  "## Verdict",
  "",
  `**${summary.decision}**`,
  "",
  `- Authenticated probes: ${summary.authenticated_tasks}/${summary.tasks}`,
  `- Exact symbol: ${summary.exact_symbol_correct}/${summary.scorable_tasks}`,
  `- Top five: ${summary.top5_symbol_hits}/${summary.scorable_tasks}`,
  `- Correct file: ${summary.file_correct}/${summary.scorable_tasks}`,
  "",
  "| task | authenticated | top prediction | exact | top 5 | ground-truth symbols |",
  "|---|:---:|---|:---:|:---:|---|",
  ...rows.map((row) => `| ${row.id} | ${row.authenticated ? "yes" : "no"} | ${row.top[0] ? `\`${row.top[0].owner}\`` : "abstain"} | ${row.exact_symbol_correct ? "yes" : "no"} | ${row.top5_symbol_hit ? "yes" : "no"} | ${row.ground_truth.symbols.map((owner) => `\`${owner}\``).join("<br>") || "unscorable"} |`),
  "",
  `Prediction SHA-256: \`${predictionHash}\`.`,
  "",
  ...(developmentCalibration ? [] : [
  "## Interpretation",
  "",
  "The 2/2 calibration result did not transfer. Runtime coverage reliably identifies code involved in producing the symptom, but that code is often not where the correction belongs. The misses crossed representation boundaries: parsing to JSON Schema conversion, validation checks to locale rendering, and parsed formats to schema construction.",
  "",
  "Do not emit automatic correction-owner hints from this mechanism. Stack frames remain useful for direct throws; coverage candidates are an execution slice only.",
  "",
  "## Next experiment",
  "",
  "Replace owner guessing with a causal intervention tournament:",
  "",
  "1. Keep separate candidates for the symptom site, transformation boundary, and output/policy boundary.",
  "2. Perturb one candidate at a time and rerun the authenticated red probe plus its green control.",
  "3. Name a correction owner only when the intervention flips the target without breaking the control; otherwise report the evidence slice and abstain.",
  "",
  "Freeze that mechanism before using the remaining untouched tasks.",
  "",
  ]),
];
writeFileSync(`${outputBase}.md`, lines.join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary }, null, 2)}\n`);

if (process.argv[1] && import.meta.url !== pathToFileURL(resolve(process.argv[1])).href) {
  throw new Error(`unexpected import of executable benchmark ${basename(import.meta.url)}`);
}
