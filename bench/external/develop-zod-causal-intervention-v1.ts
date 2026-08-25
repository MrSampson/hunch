/** Development-only causal intervention tournament on already revealed Zod cases. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { rankIssueCorrectionStageCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import { rankIssueAdaptiveCorrectionCandidates } from "./adaptive-stage-ranker.js";
import { adjudicateCausalInterventions, applyCausalIntervention, enumerateCausalInterventions } from "./causal-intervention.js";

interface DevelopmentCase {
  id: string;
  fixSha: string;
  issue: string;
  target: string;
  control: string;
}

const CASES: DevelopmentCase[] = [
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
const selected = new Set((process.env.HUNCH_INTERVENTION_CASES ?? "").split(",").filter(Boolean));
const cases = selected.size ? CASES.filter((entry) => selected.has(entry.id)) : CASES;
const interventionsPerOwner = Math.max(1, Math.min(40, Number(process.env.HUNCH_INTERVENTIONS_PER_OWNER ?? 20)));
const tsxLoader = import.meta.resolve("tsx/esm");
const output = resolve(process.env.HUNCH_INTERVENTION_OUT ?? join(import.meta.dirname, "results", "2026-08-25-zod-causal-intervention-development-v1.json"));
const prior = JSON.parse(readFileSync(join(import.meta.dirname, "results", "2026-08-25-zod-causal-boundary-calibration-v1.json"), "utf8")) as {
  rows: Array<{ id: string; top: Array<{ owner: string; target_only_branch_lines?: number[]; target_only_lines?: number[] }>; ground_truth: { paths: string[]; symbols: string[] } }>;
};

function git(args: string[]): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

function extract(sha: string, id: string): string {
  const root = mkdtempSync(join(tmpdir(), `hunch-intervention-${id}-`));
  const archive = execFileSync("git", ["-C", zod, "archive", "--format=tar", sha, "package.json", "packages/zod/package.json", "packages/zod/src/v4"], { maxBuffer: 32 * 1024 * 1024 });
  const result = spawnSync("tar", ["-xf", "-", "-C", root], { input: archive });
  if (result.status !== 0) throw new Error(`failed to extract ${id}`);
  return root;
}

function probe(root: string, id: string, content: string): boolean | null {
  mkdirSync(join(root, ".hunch-probes"), { recursive: true });
  writeFileSync(join(root, ".hunch-probes", `${id}.ts`), content);
  const result = spawnSync("node", ["--conditions=@zod/source", "--import", tsxLoader, `.hunch-probes/${id}.ts`], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.status !== 0) return null;
  const value = result.stdout.trim().split(/\r?\n/).at(-1);
  return value === "true" ? true : value === "false" ? false : null;
}

function candidateOwners(issue: string, sources: ContractAxisOwnerSource[], runtime: (typeof prior.rows)[number]): Array<{ owner: string; rank: number; preferred: number[] }> {
  const runtimeByOwner = new Map(runtime.top.map((candidate) => [candidate.owner, candidate]));
  const ordered = [
    ...runtime.top.slice(0, 8).map((candidate) => candidate.owner),
    ...rankIssueAdaptiveCorrectionCandidates(issue, sources).slice(0, 8).map((candidate) => candidate.owner),
    ...rankIssueCorrectionStageCandidates(issue, sources).slice(0, 8).map((candidate) => candidate.owner),
  ];
  return [...new Set(ordered)].slice(0, 14).map((owner, rank) => {
    const candidate = runtimeByOwner.get(owner);
    return { owner, rank: rank + 1, preferred: candidate?.target_only_branch_lines?.length ? candidate.target_only_branch_lines : candidate?.target_only_lines ?? [] };
  });
}

const rows = [] as Array<Record<string, unknown>>;
for (const [caseIndex, entry] of cases.entries()) {
  const runtime = prior.rows.find((row) => row.id === entry.id);
  if (!runtime) throw new Error(`missing frozen runtime row for ${entry.id}`);
  const preFix = git(["rev-parse", `${entry.fixSha}^1`]).trim();
  const root = extract(preFix, entry.id);
  try {
    const sources = sourcesAt(root);
    const sourceByPath = new Map(sources.map((source) => [source.path, source.content]));
    const candidates = candidateOwners(entry.issue, sources, runtime);
    const receipts = [] as Array<Record<string, unknown>>;
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const path = candidate.owner.split("::")[0]!;
      const original = sourceByPath.get(path);
      if (!original) continue;
      const interventions = enumerateCausalInterventions(path, original, candidate.owner, candidate.preferred, interventionsPerOwner);
      let wins = 0;
      for (const intervention of interventions) {
        const targetPath = join(root, path);
        try {
          writeFileSync(targetPath, applyCausalIntervention(original, intervention));
          const target = probe(root, `${entry.id}-target`, entry.target);
          const control = target === true ? probe(root, `${entry.id}-control`, entry.control) : null;
          const admitted = target === true && control === true;
          if (admitted) wins++;
          receipts.push({ candidate_rank: candidate.rank, ...intervention, target, control, admitted });
        } finally {
          writeFileSync(targetPath, original);
        }
      }
      process.stderr.write(`[${caseIndex + 1}/${cases.length} ${entry.id}] ${candidateIndex + 1}/${candidates.length} ${candidate.owner}: ${wins}/${interventions.length}\n`);
    }
    const admitted = receipts.filter((receipt) => receipt.admitted === true);
    const adjudication = adjudicateCausalInterventions(receipts.map((receipt) => ({ owner: String(receipt.owner), admitted: receipt.admitted === true })));
    const predicted = adjudication.owner;
    rows.push({
      id: entry.id,
      case_hash: sha256(JSON.stringify(entry)),
      pre_fix_sha: preFix,
      candidate_owners: candidates.map((candidate) => candidate.owner),
      interventions_attempted: receipts.length,
      intervention_receipts: receipts,
      admitted_interventions: admitted,
      adjudication,
      predicted_owner: predicted,
      ground_truth: runtime.ground_truth,
      exact: Boolean(predicted && runtime.ground_truth.symbols.includes(predicted)),
      file: Boolean(predicted && runtime.ground_truth.paths.includes(predicted.split("::")[0]!)),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const predicted = rows.filter((row) => row.predicted_owner);
const summary = {
  cases: rows.length,
  predictions: predicted.length,
  abstentions: rows.length - predicted.length,
  exact: predicted.filter((row) => row.exact).length,
  file: predicted.filter((row) => row.file).length,
  exact_precision: predicted.length ? predicted.filter((row) => row.exact).length / predicted.length : null,
  coverage: rows.length ? predicted.length / rows.length : null,
  status: "development-only",
};
const result = {
  benchmark: "zod-causal-intervention-development-v1",
  calibration_only: true,
  methodology: "Already revealed cases. Deterministic single-site mutations are admitted only when the red target becomes green and the green control remains green.",
  mechanism_hash: sha256(readFileSync(new URL("./causal-intervention.ts", import.meta.url), "utf8")),
  cases_hash: sha256(JSON.stringify(cases)),
  summary,
  rows,
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output, summary }, null, 2)}\n`);

if (process.argv[1] && import.meta.url !== pathToFileURL(resolve(process.argv[1])).href) throw new Error("development benchmark is not importable");
