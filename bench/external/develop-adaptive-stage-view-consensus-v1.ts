/** Development-only: test title/body/full-text agreement as confidence evidence. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankIssueAdaptiveCorrectionCandidates, type AdaptiveCorrectionCandidate } from "./adaptive-stage-ranker.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface Task { id: string; repo: string; title: string; body: string; pre_fix_sha: string }
interface ResultRow { id: string; symbol_scorable: boolean; top: AdaptiveCorrectionCandidate[]; top5: boolean; file: boolean }
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const resultDir = join(import.meta.dirname, "results");
const bases = ["2026-08-25-adaptive-stage-transfer-v1", "2026-08-25-adaptive-stage-confidence-transfer-v2"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
}
function sources(task: Task): ContractAxisOwnerSource[] {
  const archive = execFileSync("gh", ["api", `repos/${task.repo}/tarball/${task.pre_fix_sha}`], { encoding: "buffer", maxBuffer: 256 << 20, timeout: 90_000 });
  const dir = mkdtempSync(join(tmpdir(), "hunch-view-consensus-dev-"));
  try {
    const extraction = spawnSync("tar", ["-xzf", "-", "-C", dir], { input: archive }); if (extraction.status !== 0) throw new Error(`${task.id}: extraction failed`);
    const root = join(dir, readdirSync(dir)[0]!);
    return walk(root).filter((path) => /\.tsx?$/.test(path) && !excludedSource.test(path.slice(root.length + 1))).map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const file = (owner: string | undefined): string | null => owner?.split("::")[0] ?? null;
const topFiles = (candidates: AdaptiveCorrectionCandidate[]): string[] => [...new Set(candidates.slice(0, 5).map((item) => file(item.owner)!).filter(Boolean))];
const topOwners = (candidates: AdaptiveCorrectionCandidate[]): Set<string> => new Set(candidates.slice(0, 5).map((item) => item.owner));

const work = bases.flatMap((base) => {
  const tasks = (JSON.parse(readFileSync(join(resultDir, `${base}.tasks.json`), "utf8")) as { tasks: Task[] }).tasks;
  const rows = (JSON.parse(readFileSync(join(resultDir, `${base}.json`), "utf8")) as { rows: ResultRow[] }).rows;
  const rowById = new Map(rows.filter((row) => row.symbol_scorable).map((row) => [row.id, row]));
  return tasks.filter((task) => rowById.has(task.id)).map((task) => ({ task, truth: rowById.get(task.id)!, source_artifact: base }));
});
const rows = [] as Array<Record<string, unknown>>;
for (const [index, item] of work.entries()) {
  const source = sources(item.task);
  const titleTop = rankIssueAdaptiveCorrectionCandidates(item.task.title, source).slice(0, 5);
  const bodyTop = rankIssueAdaptiveCorrectionCandidates(item.task.body, source).slice(0, 5);
  const fullTop = item.truth.top.slice(0, 5); const fullFile = file(fullTop[0]?.owner);
  const titleFiles = topFiles(titleTop); const bodyFiles = topFiles(bodyTop);
  const titleOwners = topOwners(titleTop); const bodyOwners = topOwners(bodyTop);
  rows.push({
    id: item.task.id, repo: item.task.repo, source_artifact: item.source_artifact, top5_correct: item.truth.top5, file_correct: item.truth.file,
    full_file: fullFile, title_top_file: file(titleTop[0]?.owner), body_top_file: file(bodyTop[0]?.owner),
    full_file_in_title_top5: !!fullFile && titleFiles.includes(fullFile), full_file_in_body_top5: !!fullFile && bodyFiles.includes(fullFile),
    full_title_top_file_agree: !!fullFile && file(titleTop[0]?.owner) === fullFile,
    full_body_top_file_agree: !!fullFile && file(bodyTop[0]?.owner) === fullFile,
    common_owner_all_views: fullTop.some((candidate) => titleOwners.has(candidate.owner) && bodyOwners.has(candidate.owner)),
    common_owner_full_title: fullTop.some((candidate) => titleOwners.has(candidate.owner)),
    common_owner_full_body: fullTop.some((candidate) => bodyOwners.has(candidate.owner)),
  });
  process.stderr.write(`[develop ${index + 1}/${work.length}] ${item.task.id}\n`);
}
const bool = (row: Record<string, unknown>, key: string): boolean => row[key] === true;
const rules = {
  file_in_both_top5: (row: Record<string, unknown>) => bool(row, "full_file_in_title_top5") && bool(row, "full_file_in_body_top5"),
  top_file_agrees_both: (row: Record<string, unknown>) => bool(row, "full_title_top_file_agree") && bool(row, "full_body_top_file_agree"),
  common_owner_all_views: (row: Record<string, unknown>) => bool(row, "common_owner_all_views"),
  common_owner_each_slice: (row: Record<string, unknown>) => bool(row, "common_owner_full_title") && bool(row, "common_owner_full_body"),
};
const summary = Object.fromEntries(Object.entries(rules).map(([name, rule]) => {
  const selected = rows.filter(rule); const top5 = selected.filter((row) => bool(row, "top5_correct")).length; const fileHits = selected.filter((row) => bool(row, "file_correct")).length;
  return [name, { selected: selected.length, coverage: selected.length / rows.length, top5_hits: top5, top5_rate: selected.length ? top5 / selected.length : null, file_hits: fileHits, file_rate: selected.length ? fileHits / selected.length : null }];
}));
const output = { benchmark: "adaptive-stage-view-consensus-development-v1", development_only: true, scorable_tasks: rows.length, summary, rows };
writeFileSync(join(resultDir, "2026-08-25-adaptive-stage-view-consensus-development-v1.json"), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ scorable_tasks: rows.length, summary }, null, 2)}\n`);
