/** Freeze cross-repository correction-stage predictions before any fix diff is read. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inferIssueCorrectionStage, rankIssueCorrectionStageCandidates } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface PullMetadata {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  draft: boolean;
  merge_commit_sha: string | null;
  html_url: string;
  base: { ref: string };
}

interface Task {
  id: string;
  repo: string;
  number: number;
  url: string;
  title: string;
  body: string;
  merged_at: string;
  fix_sha: string;
  pre_fix_sha: string;
}

const BENCHMARK = "cross-repo-correction-stage-transfer-v2";
const outputBase = join(import.meta.dirname, "results", "2026-08-25-cross-repo-correction-stage-transfer-v2");
const repositories = [
  { repo: "jquense/yup", branch: "master", count: 8 },
  { repo: "sinclairzx81/typebox", branch: "main", count: 8 },
] as const;
const defect = /\b(fix(?:e[sd]|ing)?|bug|incorrect|wrong|fail(?:s|ed|ure|ing)?|error|regression|missing|invalid|crash|broken|issue)\b/i;
const domain = /\b(schema|validat(?:e|es|ed|ing|ion|or)|pars(?:e|es|ed|ing)|error|message|json|serializ(?:e|es|ed|ing|ation)|coerc(?:e|es|ed|ing|ion)|transform|object|string|number|array|tuple|union|record|ref|required|optional|nullable|default|format)\b/i;
const excludedTitle = /^(?:docs?|chore|ci|build|tests?|style|refactor|deps?|dependency|release|version)(?:\([^)]*\))?\s*[:\-]/i;
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

function ghJson(args: string[]): unknown {
  return JSON.parse(execFileSync("gh", ["api", ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
  }));
}

function parentOf(repo: string, sha: string): string | null {
  const [owner, name] = repo.split("/");
  const query = `query($owner:String!,$name:String!,$oid:GitObjectID!){repository(owner:$owner,name:$name){object(oid:$oid){... on Commit{parents(first:2){nodes{oid}}}}}}`;
  const response = ghJson([
    "graphql",
    "-f", `query=${query}`,
    "-F", `owner=${owner}`,
    "-F", `name=${name}`,
    "-F", `oid=${sha}`,
  ]) as { data?: { repository?: { object?: { parents?: { nodes?: Array<{ oid?: string }> } } } } };
  return response.data?.repository?.object?.parents?.nodes?.[0]?.oid ?? null;
}

function selectedTasks(repo: string, branch: string, wanted: number): Task[] {
  const pulls: PullMetadata[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = ghJson([
      `repos/${repo}/pulls`,
      "--method", "GET",
      "-f", "state=closed",
      "-f", "sort=updated",
      "-f", "direction=desc",
      "-f", "per_page=100",
      "-f", `page=${page}`,
    ]) as PullMetadata[];
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const candidates = pulls
    .filter((pull) => pull.merged_at && !pull.draft && pull.base.ref === branch && pull.merge_commit_sha)
    .filter((pull) => !!pull.body?.trim() && !excludedTitle.test(pull.title))
    .filter((pull) => {
      const evidence = `${pull.title}\n${pull.body ?? ""}`;
      return defect.test(evidence) && domain.test(evidence);
    })
    .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!) || b.number - a.number);

  const selected: Task[] = [];
  for (const pull of candidates) {
    if (selected.length >= wanted) break;
    const preFix = parentOf(repo, pull.merge_commit_sha!);
    if (!preFix) continue;
    selected.push({
      id: `${repo.replace("/", "-")}-pr-${pull.number}`,
      repo,
      number: pull.number,
      url: pull.html_url,
      title: pull.title.trim(),
      body: pull.body!.trim().slice(0, 100_000),
      merged_at: pull.merged_at!,
      fix_sha: pull.merge_commit_sha!,
      pre_fix_sha: preFix,
    });
  }
  if (selected.length !== wanted) throw new Error(`${repo}: selected ${selected.length}/${wanted} qualifying tasks`);
  return selected;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function sourcesAt(task: Task): ContractAxisOwnerSource[] {
  const archive = execFileSync("gh", ["api", `repos/${task.repo}/tarball/${task.pre_fix_sha}`], {
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 60_000,
  });
  const dir = mkdtempSync(join(tmpdir(), "hunch-cross-stage-"));
  try {
    const extraction = spawnSync("tar", ["-xzf", "-", "-C", dir], { input: archive, maxBuffer: 4 * 1024 * 1024 });
    if (extraction.status !== 0) throw new Error(`${task.id}: archive extraction failed: ${String(extraction.stderr)}`);
    const roots = readdirSync(dir).map((name) => join(dir, name)).filter((path) => statSync(path).isDirectory());
    if (roots.length !== 1) throw new Error(`${task.id}: expected one archive root, found ${roots.length}`);
    const root = roots[0]!;
    return walk(root)
      .filter((path) => /\.tsx?$/.test(path) && !excludedSource.test(path.slice(root.length + 1)))
      .map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const tasks = repositories.flatMap(({ repo, branch, count }) => selectedTasks(repo, branch, count));
const taskHash = sha256(JSON.stringify(tasks));
writeFileSync(`${outputBase}.tasks.json`, `${JSON.stringify({
  benchmark: BENCHMARK,
  preregistration: "2026-08-25-cross-repo-correction-stage-transfer-v2-preregistration.md",
  task_hash: taskHash,
  tasks,
}, null, 2)}\n`);

const predictions = tasks.map((task, index) => {
  const issue = `${task.title}\n${task.body}`;
  const sources = sourcesAt(task);
  const top = rankIssueCorrectionStageCandidates(issue, sources).slice(0, 10);
  process.stderr.write(`[freeze ${index + 1}/${tasks.length}] ${task.id}: ${top[0]?.owner ?? "abstain"}\n`);
  return {
    id: task.id,
    repo: task.repo,
    input_hash: sha256(JSON.stringify({ title: task.title, body: task.body })),
    pre_fix_sha: task.pre_fix_sha,
    fix_sha: task.fix_sha,
    stage: top[0]?.stage ?? inferIssueCorrectionStage(issue),
    top,
  };
});
const predictionHash = sha256(JSON.stringify(predictions));
writeFileSync(`${outputBase}.predictions.json`, `${JSON.stringify({
  benchmark: BENCHMARK,
  task_hash: taskHash,
  prediction_hash: predictionHash,
  predictions,
}, null, 2)}\n`);
process.stdout.write(JSON.stringify({
  benchmark: BENCHMARK,
  tasks: tasks.length,
  task_hash: taskHash,
  prediction_hash: predictionHash,
  abstentions: predictions.filter((prediction) => prediction.top.length === 0).length,
}, null, 2) + "\n");
