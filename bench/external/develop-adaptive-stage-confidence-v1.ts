/** Development-only check of the confidence policy on already-observed data. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyAdaptiveShortlistEvidence } from "./adaptive-stage-confidence.js";
import type { AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";

interface Row {
  id: string;
  repo: string;
  top: AdaptiveCorrectionCandidate[];
  scorable?: boolean;
  symbol_scorable?: boolean;
  top5: boolean;
  file: boolean;
}

const resultsDir = join(import.meta.dirname, "results");
const inputs = [
  "2026-08-25-adaptive-stage-development-v1.json",
  "2026-08-25-adaptive-stage-transfer-v1.json",
];
const rows = inputs.flatMap((name) => {
  const parsed = JSON.parse(readFileSync(join(resultsDir, name), "utf8")) as { rows: Row[] };
  return parsed.rows.map((row) => ({ ...row, source_artifact: name }));
}).filter((row) => row.scorable === true || row.symbol_scorable === true)
  .map((row) => ({ ...row, evidence: classifyAdaptiveShortlistEvidence(row.top) }));

const supported = rows.filter((row) => row.evidence.level === "supported");
const insufficient = rows.filter((row) => row.evidence.level === "insufficient");
const count = (values: typeof rows, key: "top5" | "file"): number => values.filter((row) => row[key]).length;
const summary = {
  scorable_tasks: rows.length,
  baseline_top5_hits: count(rows, "top5"),
  supported_tasks: supported.length,
  supported_top5_hits: count(supported, "top5"),
  supported_file_hits: count(supported, "file"),
  insufficient_tasks: insufficient.length,
};
const output = {
  benchmark: "adaptive-stage-confidence-development-v1",
  development_only: true,
  rule: "supported iff top path_overlap >= 2 and top-vs-runner-up score_gap >= 2; insufficient iff no path or symbol overlap",
  summary,
  rows: rows.map((row) => ({
    id: row.id,
    repo: row.repo,
    source_artifact: row.source_artifact,
    top5: row.top5,
    file: row.file,
    evidence: row.evidence,
  })),
};
const base = join(resultsDir, "2026-08-25-adaptive-stage-confidence-development-v1");
writeFileSync(`${base}.json`, `${JSON.stringify(output, null, 2)}\n`);
const pct = (hits: number, total: number): string => total ? `${(hits / total * 100).toFixed(1)}%` : "n/a";
writeFileSync(`${base}.md`, [
  "# Adaptive shortlist confidence development v1",
  "",
  "Development-only: this combines the already-observed Ajv/Valibot and ArkType/class-validator sets. It is not fresh evidence.",
  "",
  `- Baseline top-five accuracy: ${summary.baseline_top5_hits}/${summary.scorable_tasks} (${pct(summary.baseline_top5_hits, summary.scorable_tasks)})`,
  `- Supported coverage: ${summary.supported_tasks}/${summary.scorable_tasks} (${pct(summary.supported_tasks, summary.scorable_tasks)})`,
  `- Supported top-five accuracy: ${summary.supported_top5_hits}/${summary.supported_tasks} (${pct(summary.supported_top5_hits, summary.supported_tasks)})`,
  `- Supported likely-file accuracy: ${summary.supported_file_hits}/${summary.supported_tasks} (${pct(summary.supported_file_hits, summary.supported_tasks)})`,
  `- Insufficient/abstained: ${summary.insufficient_tasks}/${summary.scorable_tasks}`,
  "",
  "The rule is now frozen before selecting the next repositories or reading their fix diffs.",
  "",
].join("\n"));
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
