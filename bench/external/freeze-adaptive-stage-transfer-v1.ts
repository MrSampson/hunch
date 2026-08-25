/** Freeze adaptive-router predictions before any holdout fix diff is read. */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankIssueAdaptiveCorrectionCandidates } from "./adaptive-stage-ranker.js";
import { inferIssueCorrectionStage } from "../../src/core/correctionStage.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface Pull { number: number; title: string; body: string | null; merged_at: string | null; draft: boolean; merge_commit_sha: string | null; html_url: string; base: { ref: string } }
interface Task { id: string; repo: string; number: number; url: string; title: string; body: string; merged_at: string; fix_sha: string; pre_fix_sha: string }
const BENCHMARK = "adaptive-stage-transfer-v1";
const base = join(import.meta.dirname, "results", "2026-08-25-adaptive-stage-transfer-v1");
const algorithmPath = join(import.meta.dirname, "adaptive-stage-ranker.ts");
const expectedAlgorithmHash = "40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f";
const repos = [{ repo: "arktypeio/arktype", branch: "main" }, { repo: "typestack/class-validator", branch: "develop" }];
const titleDefect = /\b(fix(?:e[sd]|ing)?|bug|incorrect|wrong|fail(?:s|ed|ure|ing)?|error|regression|missing|invalid|crash|broken)\b/i;
const behavior = /\b(currently|expected|actual|incorrect|wrong|fail(?:s|ed|ure|ing)?|broken|regression|does not|doesn't|cannot|can't|unable|throws?|crashes?|silently|instead of)\b/i;
const domain = /\b(schema|validat(?:e|es|ed|ing|ion|or)|pars(?:e|es|ed|ing)|error|message|json|serializ(?:e|es|ed|ing|ation)|coerc(?:e|es|ed|ing|ion)|transform|object|string|number|array|tuple|union|record|ref|required|optional|nullable|default|format|decorator|constraint)\b/i;
const excludedTitle = /^(?:docs?|chore|ci|build|tests?|style|refactor|deps?|dependency|release|version)(?:\([^)]*\))?\s*[:\-]/i;
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const hash = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
const gh = (args: string[]): unknown => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 30_000 }));

if (hash(readFileSync(algorithmPath)) !== expectedAlgorithmHash) throw new Error("adaptive ranker changed after preregistration");

function parent(repo: string, oid: string): string | null {
  const [owner, name] = repo.split("/");
  const query = `query($owner:String!,$name:String!,$oid:GitObjectID!){repository(owner:$owner,name:$name){object(oid:$oid){... on Commit{parents(first:1){nodes{oid}}}}}}`;
  const value = gh(["graphql", "-f", `query=${query}`, "-F", `owner=${owner}`, "-F", `name=${name}`, "-F", `oid=${oid}`]) as { data?: { repository?: { object?: { parents?: { nodes?: Array<{ oid?: string }> } } } } };
  return value.data?.repository?.object?.parents?.nodes?.[0]?.oid ?? null;
}

function tasksFor(repo: string, branch: string): Task[] {
  const pulls: Pull[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = gh([`repos/${repo}/pulls`, "--method", "GET", "-f", "state=closed", "-f", "sort=updated", "-f", "direction=desc", "-f", "per_page=100", "-f", `page=${page}`]) as Pull[];
    pulls.push(...batch); if (batch.length < 100) break;
  }
  const candidates = pulls.filter((pull) => pull.merged_at && !pull.draft && pull.base.ref === branch && pull.merge_commit_sha && pull.body?.trim())
    .filter((pull) => !excludedTitle.test(pull.title) && domain.test(`${pull.title}\n${pull.body}`) && (titleDefect.test(pull.title) || behavior.test(pull.body!)))
    .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!) || b.number - a.number);
  const selected: Task[] = [];
  for (const pull of candidates) {
    if (selected.length >= 6) break;
    const pre = parent(repo, pull.merge_commit_sha!); if (!pre) continue;
    selected.push({ id: `${repo.replace("/", "-")}-pr-${pull.number}`, repo, number: pull.number, url: pull.html_url, title: pull.title, body: pull.body!.slice(0, 100_000), merged_at: pull.merged_at!, fix_sha: pull.merge_commit_sha!, pre_fix_sha: pre });
  }
  if (selected.length !== 6) throw new Error(`${repo}: selected ${selected.length}/6 tasks`);
  return selected;
}

function walk(dir: string): string[] { return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; }); }
function sources(task: Task): ContractAxisOwnerSource[] {
  const archive = execFileSync("gh", ["api", `repos/${task.repo}/tarball/${task.pre_fix_sha}`], { encoding: "buffer", maxBuffer: 128 << 20, timeout: 60_000 });
  const dir = mkdtempSync(join(tmpdir(), "hunch-adaptive-freeze-"));
  try {
    const extraction = spawnSync("tar", ["-xzf", "-", "-C", dir], { input: archive }); if (extraction.status !== 0) throw new Error(`${task.id}: extraction failed`);
    const root = join(dir, readdirSync(dir)[0]!);
    return walk(root).filter((path) => /\.tsx?$/.test(path) && !excludedSource.test(path.slice(root.length + 1))).map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const tasks = repos.flatMap(({ repo, branch }) => tasksFor(repo, branch));
const taskHash = hash(JSON.stringify(tasks));
writeFileSync(`${base}.tasks.json`, `${JSON.stringify({ benchmark: BENCHMARK, algorithm_hash: expectedAlgorithmHash, task_hash: taskHash, tasks }, null, 2)}\n`);
const predictions = tasks.map((task, index) => {
  const issue = `${task.title}\n${task.body}`; const top = rankIssueAdaptiveCorrectionCandidates(issue, sources(task)).slice(0, 10);
  process.stderr.write(`[freeze ${index + 1}/${tasks.length}] ${task.id}: ${top[0]?.owner ?? "abstain"}\n`);
  return { id: task.id, repo: task.repo, input_hash: hash(JSON.stringify({ title: task.title, body: task.body })), pre_fix_sha: task.pre_fix_sha, fix_sha: task.fix_sha, stage: top[0]?.stage ?? inferIssueCorrectionStage(issue), top };
});
const predictionHash = hash(JSON.stringify(predictions));
writeFileSync(`${base}.predictions.json`, `${JSON.stringify({ benchmark: BENCHMARK, algorithm_hash: expectedAlgorithmHash, task_hash: taskHash, prediction_hash: predictionHash, predictions }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ tasks: tasks.length, task_hash: taskHash, prediction_hash: predictionHash, abstentions: predictions.filter((item) => !item.top.length).length }, null, 2)}\n`);
