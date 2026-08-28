/** Development-only replay over all revealed evidence-bridge transfer cases. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { diagnoseIssueCorrectionStage, rankIssueAdaptiveCorrectionCandidates } from "../../src/core/correctionStage.js";
import { buildFileFirstDeclarationClusters } from "../../src/core/declarationClusters.js";
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

const resultPaths = [
  join(import.meta.dirname, "results", "2026-08-25-evidence-guided-optimization-transfer-v1.json"),
  join(import.meta.dirname, "results", "2026-08-25-evidence-file-reserve-transfer-v2.json"),
  join(import.meta.dirname, "results", "2026-08-25-guarded-evidence-bridge-transfer-v3.json"),
];
const outputPath = resolve(join(import.meta.dirname, "results", "2026-08-25-file-first-declaration-clusters-development-v1.json"));
const zod = resolve(process.env.HUNCH_ZOD_BENCH_REPO ?? "../zod-bench");
const rows = resultPaths.flatMap((path) => (JSON.parse(readFileSync(path, "utf8")) as { rows: RevealedRow[] }).rows);
const git = (args: string[]): string => execFileSync("git", ["-C", zod, ...args], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const ownerPath = (owner: string): string => owner.split("::")[0]!;
const configurations = [
  { files: 3, clusters: 2, members: 3 },
  { files: 3, clusters: 3, members: 3 },
  { files: 4, clusters: 2, members: 3 },
  { files: 4, clusters: 3, members: 3 },
  { files: 4, clusters: 3, members: 5 },
  { files: 4, clusters: 3, members: 8 },
  { files: 4, clusters: 3, members: 12 },
] as const;

function sourcesAt(sha: string): ContractAxisOwnerSource[] {
  return git(["ls-tree", "-r", "--name-only", sha, "--", "packages/zod/src/v4"])
    .split("\n")
    .filter((path) => /\.tsx?$/.test(path) && !/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|\.test\.tsx?$/.test(path))
    .map((path) => ({ path, content: git(["show", `${sha}:${path}`]) }));
}

const evaluated = rows.filter((row) => row.authenticated && row.ground_truth.symbols.length > 0).map((row) => {
  const sources = sourcesAt(row.pre_fix_sha);
  const diagnostic = diagnoseIssueCorrectionStage(row.verified_evidence_receipt.claim, sources, 5);
  const ranked = rankIssueAdaptiveCorrectionCandidates(row.verified_evidence_receipt.claim, sources);
  const selectedFiles = diagnostic.file_first_declaration_clusters.files.map((file) => file.path);
  const clusterOwners = diagnostic.file_first_declaration_clusters.files.flatMap((file) =>
    file.declaration_clusters.flatMap((cluster) => cluster.members.map((member) => member.owner)));
  const clusterFamilies = diagnostic.file_first_declaration_clusters.files.reduce((sum, file) =>
    sum + file.declaration_clusters.length, 0);
  const baselineHit = row.baseline_top5.some((owner) => row.ground_truth.symbols.includes(owner));
  const clusterHit = clusterOwners.some((owner) => row.ground_truth.symbols.includes(owner));
  const baselineFileHit = row.baseline_top5.some((owner) => row.ground_truth.paths.includes(ownerPath(owner)));
  const clusterFileHit = selectedFiles.some((path) => row.ground_truth.paths.includes(path));
  const sweep = configurations.map((configuration) => {
    const clustered = buildFileFirstDeclarationClusters(
      ranked,
      configuration.files,
      configuration.clusters,
      configuration.members,
    );
    const owners = clustered.files.flatMap((file) => file.declaration_clusters.flatMap((cluster) =>
      cluster.members.map((member) => member.owner)));
    return {
      configuration,
      hit: owners.some((owner) => row.ground_truth.symbols.includes(owner)),
      file_hit: clustered.files.some((file) => row.ground_truth.paths.includes(file.path)),
      inspected_declarations: new Set(owners).size,
    };
  });
  return {
    id: row.id,
    baseline_hit: baselineHit,
    cluster_hit: clusterHit,
    cluster_rescue: !baselineHit && clusterHit,
    baseline_file_hit: baselineFileHit,
    cluster_file_hit: clusterFileHit,
    selected_files: selectedFiles,
    cluster_families: clusterFamilies,
    inspected_declarations: new Set(clusterOwners).size,
    receipt: diagnostic.file_first_declaration_clusters.receipt,
    sweep,
    truth: row.ground_truth,
  };
});

const summary = {
  cases: evaluated.length,
  baseline_top5_hits: evaluated.filter((row) => row.baseline_hit).length,
  cluster_hits: evaluated.filter((row) => row.cluster_hit).length,
  cluster_rescues: evaluated.filter((row) => row.cluster_rescue).length,
  baseline_file_hits: evaluated.filter((row) => row.baseline_file_hit).length,
  cluster_file_hits: evaluated.filter((row) => row.cluster_file_hit).length,
  cluster_losses: evaluated.filter((row) => row.baseline_hit && !row.cluster_hit).length,
  receipts_complete: evaluated.every((row) => /^[a-f0-9]{24}$/.test(row.receipt.receipt_id)),
  flat_shortlist_preserved: evaluated.every((row) => row.receipt.flat_shortlist_preserved),
  exact_owner_policy: "disabled",
};
const configurationSweep = configurations.map((configuration, index) => ({
  configuration,
  hits: evaluated.filter((row) => row.sweep[index]!.hit).length,
  file_hits: evaluated.filter((row) => row.sweep[index]!.file_hit).length,
  average_inspected_declarations: evaluated.reduce((sum, row) =>
    sum + row.sweep[index]!.inspected_declarations, 0) / evaluated.length,
  max_inspected_declarations: Math.max(...evaluated.map((row) => row.sweep[index]!.inspected_declarations)),
}));
const output = {
  benchmark: "file-first-declaration-clusters-development-v1",
  evidence_status: "development-only-revealed-v1-v2-v3-transfer-cases",
  methodology: "The original top-five shortlist is unchanged. Cluster coverage asks whether one of four selected files and one of three bounded semantic declaration families contains a changed pre-existing declaration.",
  input_sha256: resultPaths.map((path) => createHash("sha256").update(readFileSync(path)).digest("hex")),
  summary,
  configuration_sweep: configurationSweep,
  rows: evaluated,
};
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, summary }, null, 2)}\n`);
