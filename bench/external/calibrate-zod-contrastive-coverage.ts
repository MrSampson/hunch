/** Calibration-only target/control coverage on two already-opened Zod tasks. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { collectStackOwnerEvidence, collectV8OwnerEvidence, conditionOwnersOnRuntimeEvidence } from "./v8-owner-evidence.js";

const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const cases = [
  {
    id: "zod-5917",
    fixSha: "02c2baf7d0d615872fa4528a8020603b71211702",
    issue: "The results vary depending on the position of optional in a schema with preprocess. z.object({ optionalNumber: z.preprocess(v => v, z.number().optional()) }).safeParse({}) should succeed.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";console.log(z.object({x:z.preprocess(v=>v,z.number().optional())}).safeParse({}).success);',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";const outer=z.object({x:z.preprocess(v=>v,z.number()).optional()}).safeParse({}).success;const generic=z.object({x:z.pipe(z.transform(v=>v),z.number().optional())}).safeParse({}).success;console.log(outer,!generic);',
    truth: ["packages/zod/src/v4/classic/schemas.ts::preprocess", "packages/zod/src/v4/core/schemas.ts::$ZodPreprocess"],
  },
  {
    id: "zod-5868",
    fixSha: "fffe99bdd7445cc072b5ed2d74b2a6204bdbc86c",
    issue: "z.union([]) and z.xor([]) throw an internal error on parse; their types resolve to never.",
    target: 'import * as z from "../packages/zod/src/v4/index.ts";for(const make of [()=>z.union([]),()=>z.xor([])]){try{make().safeParse("x")}catch(error){console.error(error instanceof Error?error.stack:String(error))}}',
    control: 'import * as z from "../packages/zod/src/v4/index.ts";for(const schema of [z.union([z.string(),z.number()]),z.xor([z.string(),z.number()])]){schema.safeParse("x");schema.safeParse(1);schema.safeParse(false);}',
    truth: ["packages/zod/src/v4/core/schemas.ts::$ZodUnion", "packages/zod/src/v4/core/schemas.ts::$ZodXor"],
  },
] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
function runCoverage(worktree: string, name: string, content: string): { coverage: unknown[]; output: string } {
  const artifactDir = join(worktree, ".hunch-probes");
  mkdirSync(artifactDir, { recursive: true });
  const artifact = join(artifactDir, `${name}.ts`);
  writeFileSync(artifact, content);
  const coverageDir = mkdtempSync(join(tmpdir(), `hunch-${name}-coverage-`));
  try {
    const run = spawnSync("node", ["--enable-source-maps", "--conditions=@zod/source", "--import", "tsx/esm", `.hunch-probes/${name}.ts`], {
      cwd: worktree,
      encoding: "utf8",
      env: { ...process.env, NODE_V8_COVERAGE: coverageDir },
      timeout: 60_000,
    });
    if (run.status !== 0) throw new Error(`${name} failed: ${run.stderr}`);
    const coverage = readdirSync(coverageDir).filter((file) => file.endsWith(".json")).flatMap((file) => {
      const value = JSON.parse(readFileSync(join(coverageDir, file), "utf8")) as { result?: Array<{ url?: string }> };
      return value.result?.some((script) => script.url?.endsWith(`/.hunch-probes/${name}.ts`)) ? [value] : [];
    });
    return { coverage, output: `${run.stderr ?? ""}${run.stdout ?? ""}` };
  } finally {
    rmSync(coverageDir, { recursive: true, force: true });
  }
}

const results = cases.map((entry) => {
  const preFix = execFileSync("git", ["-C", zod, "rev-parse", `${entry.fixSha}^1`], { encoding: "utf8" }).trim();
  const worktree = mkdtempSync(join(tmpdir(), `hunch-${entry.id}-contrast-`));
  try {
    execFileSync("git", ["-C", zod, "worktree", "add", "--detach", worktree, preFix], { stdio: "ignore" });
    execFileSync("corepack", ["pnpm", "install", "--frozen-lockfile", "--prefer-offline"], { cwd: worktree, stdio: "ignore", timeout: 5 * 60_000 });
    const target = runCoverage(worktree, `${entry.id}-target`, entry.target);
    const control = runCoverage(worktree, `${entry.id}-control`, entry.control);
    const sources = walk(join(worktree, "packages/zod/src/v4"))
      .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
      .map((path) => ({ path: path.slice(worktree.length + 1), content: readFileSync(path, "utf8") }));
    const ranking = conditionOwnersOnRuntimeEvidence(entry.issue, sources, target.coverage, control.coverage, target.output);
    return {
      id: entry.id,
      target_files: target.coverage.length,
      control_files: control.coverage.length,
      stack_output: target.output,
      stack_owners: collectStackOwnerEvidence(target.output, sources),
      target_observed: target.coverage.flatMap(collectV8OwnerEvidence)
        .filter((item) => /union|xor|preprocess|pipe/i.test(item.owner))
        .map(({ owner, function_name, count, original_line }) => ({ owner, function_name, count, original_line })),
      top: ranking.slice(0, 10),
      correct: Boolean(ranking[0] && entry.truth.includes(ranking[0].owner as never)),
      truth: entry.truth,
    };
  } finally {
    spawnSync("git", ["-C", zod, "worktree", "remove", "--force", worktree]);
    rmSync(worktree, { recursive: true, force: true });
  }
});
process.stdout.write(`${JSON.stringify({ calibration_only: true, results }, null, 2)}\n`);
