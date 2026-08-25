/** Development-only replay over revealed v1 and v2 transfer cases. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import type { VerifiedEvidenceReceipt } from "../../src/core/evidenceMap.js";

interface RevealedRow {
  id: string; pre_fix_sha: string; authenticated: boolean; baseline_top5: string[];
  verified_evidence_receipt: VerifiedEvidenceReceipt;
  ground_truth: { paths: string[]; symbols: string[] };
}
const resultPaths = [
  join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1.json"),
  join(import.meta.dirname, "results", "2026-08-25-evidence-file-reserve-transfer-v2.json"),
];
const outputPath = resolve(join(import.meta.dirname, "results", "2026-08-25-guarded-execution-bridge-development-v3.json"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const rows = resultPaths.flatMap((path) => (JSON.parse(readFileSync(path, "utf8")) as { rows: RevealedRow[] }).rows);
const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const ownerPath = (owner: string): string => owner.split("::")[0]!;

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const evaluated = rows.filter((row) => row.authenticated).map((row) => {
  const optimized = diagnoseIssueCorrectionStage(
    row.verified_evidence_receipt.claim,
    sourcesAt(row.pre_fix_sha),
    5,
    row.verified_evidence_receipt,
  );
  const candidates = optimized.candidates.map((candidate) => candidate.owner);
  const baselineHit = row.baseline_top5.some((owner) => row.ground_truth.symbols.includes(owner));
  const hit = candidates.some((owner) => row.ground_truth.symbols.includes(owner));
  return {
    id: row.id, baseline_hit: baselineHit, optimized_hit: hit,
    rescue: !baselineHit && hit, loss: baselineHit && !hit,
    file_hit: candidates.some((owner) => row.ground_truth.paths.includes(ownerPath(owner))),
    candidates,
    receipt: optimized.optimization,
    truth: row.ground_truth,
  };
});
const summary = {
  cases: evaluated.length,
  baseline_hits: evaluated.filter((row) => row.baseline_hit).length,
  optimized_hits: evaluated.filter((row) => row.optimized_hit).length,
  rescues: evaluated.filter((row) => row.rescue).length,
  losses: evaluated.filter((row) => row.loss).length,
  file_hits: evaluated.filter((row) => row.file_hit).length,
};
const output = {
  benchmark: "guarded-execution-bridge-development-v3",
  evidence_status: "development-only-revealed-v1-and-v2-transfer-cases",
  input_sha256: resultPaths.map((path) => createHash("sha256").update(readFileSync(path)).digest("hex")),
  summary,
  rows: evaluated,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary }, null, 2)}\n`);
