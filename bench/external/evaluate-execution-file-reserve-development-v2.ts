/** Development-only replay over the revealed v1 transfer set.
 *
 * This script compares simple, bounded execution-to-static bridge policies.
 * It must not be cited as fresh evidence: every fixing diff in this set has
 * already been opened by the v1 evaluator.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { rankIssueAdaptiveCorrectionCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";
import type { VerifiedEvidenceReceipt } from "../../src/core/evidenceMap.js";

interface RevealedRow {
  id: string;
  pre_fix_sha: string;
  authenticated: boolean;
  baseline_top5: string[];
  verified_evidence_receipt: VerifiedEvidenceReceipt;
  ground_truth: { paths: string[]; symbols: string[] };
}

const resultPath = join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1.json");
const outputPath = resolve(process.env.HUNCH_EXECUTION_RESERVE_DEV_OUT
  ?? join(import.meta.dirname, "results", "2026-08-25-execution-file-reserve-development-v2.json"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const revealed = JSON.parse(readFileSync(resultPath, "utf8")) as { rows: RevealedRow[] };

function git(args: string[], maxBuffer = 64 * 1024 * 1024): string {
  return execFileSync("git", ["-C", zod, ...args], { encoding: "utf8", maxBuffer });
}

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  const paths = git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path));
  return paths.map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const ownerPath = (owner: string): string => owner.split("::")[0]!;

function evidenceFileScores(receipt: VerifiedEvidenceReceipt, policy: "target-only" | "strong-differential" | "positive-differential"): Map<string, number> {
  const scores = new Map<string, number>();
  for (const entry of receipt.execution) {
    const delta = entry.target_count - entry.control_count;
    const admitted = policy === "target-only"
      ? entry.target_count > 0 && entry.control_count === 0
      : policy === "strong-differential"
        ? delta > 0 && entry.target_count >= 2 * Math.max(1, entry.control_count)
        : delta > 0;
    if (!admitted) continue;
    const path = ownerPath(entry.owner);
    const support = policy === "target-only" ? entry.target_count : delta;
    scores.set(path, (scores.get(path) ?? 0) + support);
  }
  return scores;
}

function optimize(
  baseline: string[],
  ranked: string[],
  receipt: VerifiedEvidenceReceipt,
  policy: "target-only" | "strong-differential" | "positive-differential",
): { candidates: string[]; selected_file: string | null; promoted: string | null; support: number } {
  const scores = evidenceFileScores(receipt, policy);
  const baselineSet = new Set(baseline);
  const choices = ranked.flatMap((owner, index) => {
    const path = ownerPath(owner);
    const support = scores.get(path) ?? 0;
    return support > 0 && !baselineSet.has(owner) ? [{ owner, path, support, rank: index + 1 }] : [];
  }).sort((left, right) => right.support - left.support || left.rank - right.rank || left.owner.localeCompare(right.owner));
  const choice = choices[0];
  if (!choice) return { candidates: baseline, selected_file: null, promoted: null, support: 0 };
  return {
    candidates: [...baseline.slice(0, 4), choice.owner],
    selected_file: choice.path,
    promoted: choice.owner,
    support: choice.support,
  };
}

const policies = ["target-only", "strong-differential", "positive-differential"] as const;
const rows = revealed.rows.filter((row) => row.authenticated).map((row) => {
  const sources = sourcesAt(row.pre_fix_sha);
  const ranked = rankIssueAdaptiveCorrectionCandidates(row.verified_evidence_receipt.claim, sources).map((candidate) => candidate.owner);
  return {
    id: row.id,
    truth: row.ground_truth,
    baseline: row.baseline_top5,
    baseline_hit: row.baseline_top5.some((owner) => row.ground_truth.symbols.includes(owner)),
    variants: Object.fromEntries(policies.map((policy) => {
      const result = optimize(row.baseline_top5, ranked, row.verified_evidence_receipt, policy);
      return [policy, {
        ...result,
        hit: result.candidates.some((owner) => row.ground_truth.symbols.includes(owner)),
        file_hit: result.candidates.some((owner) => row.ground_truth.paths.includes(ownerPath(owner))),
      }];
    })),
  };
});

const summaries = Object.fromEntries(policies.map((policy) => {
  const scorable = rows.filter((row) => row.truth.symbols.length > 0);
  const variants = scorable.map((row) => row.variants[policy]);
  const baselineHits = scorable.filter((row) => row.baseline_hit).length;
  const optimizedHits = variants.filter((variant) => variant.hit).length;
  return [policy, {
    scorable: scorable.length,
    baseline_hits: baselineHits,
    optimized_hits: optimizedHits,
    rescues: scorable.filter((row) => !row.baseline_hit && row.variants[policy].hit).length,
    losses: scorable.filter((row) => row.baseline_hit && !row.variants[policy].hit).length,
    optimized_file_hits: variants.filter((variant) => variant.file_hit).length,
  }];
}));

const output = {
  benchmark: "execution-file-reserve-development-v2",
  evidence_status: "development-only-revealed-v1-transfer-cases",
  methodology: "One execution-selected file slot replaces baseline rank five; ranks one through four remain untouched. Static ranking selects the declaration within the evidence-supported file.",
  input_sha256: createHash("sha256").update(readFileSync(resultPath)).digest("hex"),
  summaries,
  rows,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summaries }, null, 2)}\n`);
