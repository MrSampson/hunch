/** Retrospective development replay for the evidence-guided shortlist rule. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { EVIDENCE_GUIDED_SHORTLIST_RULE, reserveEvidenceGuidedOwners } from "../../src/core/correctionStage.js";
import { compileVerifiedEvidenceMap, type EvidenceOutcome } from "../../src/core/evidenceMap.js";

interface Task { id: string; issue: string }
interface PriorRow {
  id: string;
  authenticated: boolean;
  observed: { pre_target: boolean | null; pre_control: boolean | null; post_target: boolean | null };
  adaptive_top5: string[];
  candidate_owners: string[];
  intervention_receipts: Array<{ owner: string; target: boolean | null; control: boolean | null }>;
  ground_truth: { paths: string[]; symbols: string[] };
  symbol_scorable: boolean;
}

const resultDir = join(import.meta.dirname, "results");
const taskArtifact = JSON.parse(readFileSync(join(resultDir, "2026-08-25-zod-causal-intervention-transfer-v1.tasks.json"), "utf8")) as { cases: Task[] };
const prior = JSON.parse(readFileSync(join(resultDir, "2026-08-25-zod-causal-intervention-transfer-v1.json"), "utf8")) as { rows: PriorRow[] };
const outputBase = join(resultDir, "2026-08-25-evidence-guided-shortlist-development-v1");
const issueById = new Map(taskArtifact.cases.map((task) => [task.id, task.issue]));
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");
const outcome = (value: boolean | null): EvidenceOutcome => value === true ? "green" : value === false ? "red" : "error";
const ownerPath = (owner: string): string => owner.split("::")[0]!;

const rows = prior.rows.map((row) => {
  const claim = issueById.get(row.id);
  if (!claim) throw new Error(`missing frozen issue text for ${row.id}`);
  const evidenceReceipt = {
    version: 1 as const,
    claim,
    probe: {
      target_before: outcome(row.observed.pre_target),
      control_before: outcome(row.observed.pre_control),
      target_after: outcome(row.observed.post_target),
      control_after: row.observed.pre_control === true ? "green" as const : outcome(row.observed.pre_control),
    },
    execution: [],
    interventions: row.intervention_receipts.map((receipt) => ({
      owner: receipt.owner,
      target_after: outcome(receipt.target),
      control_after: outcome(receipt.control),
    })),
  };
  const evidenceMap = compileVerifiedEvidenceMap(evidenceReceipt);
  const baseline = row.adaptive_top5;
  const ranked = [...new Set([...row.candidate_owners, ...baseline])];
  const optimized = reserveEvidenceGuidedOwners(baseline, ranked, evidenceMap, 5);
  const baselineHit = baseline.some((owner) => row.ground_truth.symbols.includes(owner));
  const optimizedHit = optimized.some((owner) => row.ground_truth.symbols.includes(owner));
  const baselineFile = baseline.some((owner) => row.ground_truth.paths.includes(ownerPath(owner)));
  const optimizedFile = optimized.some((owner) => row.ground_truth.paths.includes(ownerPath(owner)));
  const receipt = {
    version: 1,
    rule: EVIDENCE_GUIDED_SHORTLIST_RULE,
    case_id: row.id,
    probe_authenticated: evidenceMap.verification.authenticated,
    evidence_level: evidenceMap.level,
    baseline,
    optimized,
    promoted: optimized.filter((owner) => !baseline.includes(owner)),
    displaced: baseline.filter((owner) => !optimized.includes(owner)),
    behavior_sensitive_files: evidenceMap.intervention_slice.behavior_sensitive_files,
    exact_owner_enabled: false,
  };
  return {
    id: row.id,
    authenticated: row.authenticated,
    symbol_scorable: row.symbol_scorable,
    baseline,
    optimized,
    baseline_hit: baselineHit,
    optimized_hit: optimizedHit,
    baseline_file: baselineFile,
    optimized_file: optimizedFile,
    rescue: !baselineHit && optimizedHit,
    loss: baselineHit && !optimizedHit,
    file_rescue: !baselineFile && optimizedFile,
    file_loss: baselineFile && !optimizedFile,
    ground_truth: row.ground_truth,
    optimization_receipt: { ...receipt, receipt_id: sha256(JSON.stringify(receipt)).slice(0, 24) },
  };
});

const scorable = rows.filter((row) => row.authenticated && row.symbol_scorable);
const baselineHits = scorable.filter((row) => row.baseline_hit).length;
const optimizedHits = scorable.filter((row) => row.optimized_hit).length;
const baselineFiles = scorable.filter((row) => row.baseline_file).length;
const optimizedFiles = scorable.filter((row) => row.optimized_file).length;
const summary = {
  cases: rows.length,
  scorable_cases: scorable.length,
  baseline_top5_hits: baselineHits,
  optimized_top5_hits: optimizedHits,
  top5_improvement_points: scorable.length ? (optimizedHits - baselineHits) / scorable.length : null,
  baseline_file_hits: baselineFiles,
  optimized_file_hits: optimizedFiles,
  file_improvement_points: scorable.length ? (optimizedFiles - baselineFiles) / scorable.length : null,
  rescues: scorable.filter((row) => row.rescue).length,
  losses: scorable.filter((row) => row.loss).length,
  file_rescues: scorable.filter((row) => row.file_rescue).length,
  file_losses: scorable.filter((row) => row.file_loss).length,
  status: "development-only",
};
const result = {
  benchmark: "evidence-guided-shortlist-development-v1",
  generated_at: new Date().toISOString(),
  methodology: "Retrospective replay on the already revealed causal-intervention transfer cases. It is development evidence, not a fresh generalization claim.",
  rule: EVIDENCE_GUIDED_SHORTLIST_RULE,
  summary,
  rows,
};
writeFileSync(`${outputBase}.json`, `${JSON.stringify(result, null, 2)}\n`);
const pct = (value: number | null): string => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
writeFileSync(`${outputBase}.md`, [
  "# Evidence-guided shortlist development replay v1",
  "",
  result.methodology,
  "",
  `- Baseline top-five: ${baselineHits}/${scorable.length}`,
  `- Optimized top-five: ${optimizedHits}/${scorable.length} (${pct(summary.top5_improvement_points)} points)`,
  `- Baseline correct file: ${baselineFiles}/${scorable.length}`,
  `- Optimized correct file: ${optimizedFiles}/${scorable.length} (${pct(summary.file_improvement_points)} points)`,
  `- Rescues/losses: ${summary.rescues}/${summary.losses}`,
  `- File rescues/losses: ${summary.file_rescues}/${summary.file_losses}`,
  "- Exact-owner output: disabled",
  "",
  "| case | baseline | optimized | rescue | file rescue | receipt |",
  "|---|:---:|:---:|:---:|:---:|---|",
  ...scorable.map((row) => `| ${row.id} | ${row.baseline_hit ? "hit" : "miss"} | ${row.optimized_hit ? "hit" : "miss"} | ${row.rescue ? "yes" : "no"} | ${row.file_rescue ? "yes" : "no"} | \`${row.optimization_receipt.receipt_id}\` |`),
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify({ outputBase, summary }, null, 2)}\n`);

if (process.argv[1] && import.meta.url !== pathToFileURL(process.argv[1]).href) throw new Error("development replay is not importable");
