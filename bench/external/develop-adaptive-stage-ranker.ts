/** Development-only calibration on Ajv + Valibot. These tasks are never a holdout. */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rankIssueAdaptiveCorrectionCandidates } from "./adaptive-stage-ranker.js";
import { changedLineNumbers, declarationOwners } from "./evaluate-zod-owner-ranker.js";
import type { ContractAxisOwnerSource } from "../../src/core/pipeline.js";

interface Pull { number: number; title: string; body: string | null; merged_at: string | null; draft: boolean; merge_commit_sha: string | null; html_url: string; base: { ref: string } }
interface Task { id: string; repo: string; number: number; url: string; title: string; body: string; fix: string; pre: string }
const repos = [{ repo: "ajv-validator/ajv", branch: "master" }, { repo: "fabian-hiller/valibot", branch: "main" }];
const defect = /\b(fix(?:e[sd]|ing)?|bug|incorrect|wrong|fail(?:s|ed|ure|ing)?|error|regression|missing|invalid|crash|broken|issue)\b/i;
const domain = /\b(schema|validat(?:e|es|ed|ing|ion|or)|pars(?:e|es|ed|ing)|error|message|json|serializ(?:e|es|ed|ing|ation)|coerc(?:e|es|ed|ing|ion)|transform|object|string|number|array|tuple|union|record|ref|required|optional|nullable|default|format)\b/i;
const excludedTitle = /^(?:docs?|chore|ci|build|tests?|style|refactor|deps?|dependency|release|version)(?:\([^)]*\))?\s*[:\-]/i;
const excludedSource = /(?:^|\/)(?:tests?|__tests__|test-data|fixtures?|examples?|benchmarks?|generated|docs?)(?:\/|$)|\.(?:test|spec)\.tsx?$|\.d\.ts$/i;
const gh = (args: string[]): unknown => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 30_000 }));

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
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const candidates = pulls.filter((pull) => pull.merged_at && !pull.draft && pull.base.ref === branch && pull.merge_commit_sha && pull.body?.trim())
    .filter((pull) => !excludedTitle.test(pull.title) && defect.test(`${pull.title}\n${pull.body}`) && domain.test(`${pull.title}\n${pull.body}`))
    .sort((a, b) => b.merged_at!.localeCompare(a.merged_at!) || b.number - a.number);
  const tasks: Task[] = [];
  for (const pull of candidates) {
    if (tasks.length >= 8) break;
    const pre = parent(repo, pull.merge_commit_sha!);
    if (pre) tasks.push({ id: `${repo.replace("/", "-")}-pr-${pull.number}`, repo, number: pull.number, url: pull.html_url, title: pull.title, body: pull.body!.slice(0, 100_000), fix: pull.merge_commit_sha!, pre });
  }
  if (tasks.length !== 8) throw new Error(`${repo}: ${tasks.length}/8 development tasks`);
  return tasks;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
}

function sources(task: Task): ContractAxisOwnerSource[] {
  const archive = execFileSync("gh", ["api", `repos/${task.repo}/tarball/${task.pre}`], { encoding: "buffer", maxBuffer: 128 << 20, timeout: 60_000 });
  const dir = mkdtempSync(join(tmpdir(), "hunch-adaptive-dev-"));
  try {
    const extraction = spawnSync("tar", ["-xzf", "-", "-C", dir], { input: archive });
    if (extraction.status !== 0) throw new Error(`${task.id}: extraction failed`);
    const root = join(dir, readdirSync(dir)[0]!);
    return walk(root).filter((path) => /\.tsx?$/.test(path) && !excludedSource.test(path.slice(root.length + 1)))
      .map((path) => ({ path: path.slice(root.length + 1), content: readFileSync(path, "utf8") }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function sections(diff: string): Array<{ before: string; after: string; text: string }> {
  const matches = [...diff.matchAll(/^diff --git a\/(.+) b\/(.+)$/gm)];
  return matches.map((match, index) => ({ before: match[1]!, after: match[2]!, text: diff.slice(match.index!, matches[index + 1]?.index ?? diff.length) }));
}
const encoded = (path: string): string => path.split("/").map(encodeURIComponent).join("/");
async function raw(repo: string, sha: string, path: string): Promise<string | null> {
  const response = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${encoded(path)}`);
  return response.status === 404 ? null : response.ok ? response.text() : Promise.reject(new Error(`raw HTTP ${response.status}`));
}
async function truth(task: Task): Promise<{ paths: string[]; symbols: string[] }> {
  const response = await fetch(`https://github.com/${task.repo}/pull/${task.number}.diff`);
  if (!response.ok) throw new Error(`${task.id}: diff HTTP ${response.status}`);
  const paths = new Set<string>(); const symbols = new Set<string>();
  for (const section of sections(await response.text())) {
    const beforeMissing = /^--- \/dev\/null$/m.test(section.text); const afterMissing = /^\+\+\+ \/dev\/null$/m.test(section.text);
    const path = afterMissing ? section.before : section.after;
    if (!/\.tsx?$/.test(path) || excludedSource.test(path)) continue;
    paths.add(path); const changed = changedLineNumbers(section.text);
    const [before, after] = await Promise.all([beforeMissing ? null : raw(task.repo, task.pre, section.before), afterMissing ? null : raw(task.repo, task.fix, section.after)]);
    for (const [ownerPath, content, lines] of [[section.before, before, changed.before], [section.after, after, changed.after]] as const) {
      if (!content) continue;
      for (const span of declarationOwners(ownerPath, content)) if ([...lines].some((line) => line >= span.startLine && line <= span.endLine)) symbols.add(span.owner);
    }
  }
  return { paths: [...paths].sort(), symbols: [...symbols].sort() };
}

const tasks = repos.flatMap(({ repo, branch }) => tasksFor(repo, branch));
const rows = [] as Array<Record<string, unknown>>;
for (const [index, task] of tasks.entries()) {
  const top = rankIssueAdaptiveCorrectionCandidates(`${task.title}\n${task.body}`, sources(task)).slice(0, 10);
  const ground = await truth(task); const predicted = top[0]?.owner; const path = predicted?.split("::")[0];
  rows.push({ id: task.id, repo: task.repo, url: task.url, top, ground_truth: ground, scorable: ground.symbols.length > 0, exact: !!predicted && ground.symbols.includes(predicted), top5: top.slice(0, 5).some((item) => ground.symbols.includes(item.owner)), file: !!path && ground.paths.includes(path) });
  process.stderr.write(`[develop ${index + 1}/${tasks.length}] ${task.id}: ${top[0]?.owner ?? "abstain"}\n`);
}
const scorable = rows.filter((row) => row.scorable); const count = (key: "exact" | "top5" | "file") => scorable.filter((row) => row[key]).length;
const summary = { tasks: rows.length, scorable: scorable.length, exact: count("exact"), top5: count("top5"), file: count("file"), abstentions: rows.filter((row) => !(row.top as unknown[]).length).length };
writeFileSync(join(import.meta.dirname, "results", "2026-08-25-adaptive-stage-development-v1.json"), `${JSON.stringify({ benchmark: "adaptive-stage-development-v1", development_only: true, summary, rows }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
