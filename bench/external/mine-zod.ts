/**
 * Mine time-split benchmark tasks from zod: merged PRs after the cutoff whose
 * GitHub-tracked closingIssuesReferences is non-empty (the real "fixes #N"
 * linkage), whose merge commit touches BOTH test and source files under
 * packages/zod. Task = issue text; ground truth = the fix's own test files.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CUTOFF = "2026-01-08";
const OUT = join(import.meta.dirname, "zod-tasks.json");

const gh = (args: string[]): string => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

interface PR {
  number: number;
  title: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
  files: { nodes: Array<{ path: string }> };
  closingIssuesReferences: { nodes: Array<{ number: number; title: string; body: string }> };
}

const QUERY = `
query($cursor: String) {
  repository(owner: "colinhacks", name: "zod") {
    pullRequests(states: MERGED, first: 50, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title mergedAt
        mergeCommit { oid }
        files(first: 60) { nodes { path } }
        closingIssuesReferences(first: 3) { nodes { number title body } }
      }
    }
  }
}`;

const isTest = (p: string): boolean => /\.test\.ts$/.test(p);
const inZod = (p: string): boolean => p.startsWith("packages/zod/src/");

const tasks: unknown[] = [];
let cursor: string | null = null;
let scanned = 0;
for (let page = 0; page < 8 && tasks.length < 14; page++) {
  const args = ["api", "graphql", "-f", `query=${QUERY}`];
  if (cursor) args.push("-f", `cursor=${cursor}`);
  const resp = JSON.parse(gh(args)) as { data: { repository: { pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: PR[] } } } };
  const prs = resp.data.repository.pullRequests;
  for (const pr of prs.nodes) {
    scanned++;
    if (!pr.mergeCommit || pr.mergedAt < CUTOFF) continue;
    const issues = pr.closingIssuesReferences.nodes;
    if (!issues.length) continue;
    const paths = pr.files.nodes.map((f) => f.path);
    const testFiles = paths.filter((p) => inZod(p) && isTest(p));
    const srcFiles = paths.filter((p) => inZod(p) && !isTest(p) && p.endsWith(".ts"));
    if (!testFiles.length || !srcFiles.length) continue;
    if (paths.length > 12) continue; // huge PRs = refactors, not focused fixes
    const issue = issues[0]!;
    tasks.push({
      id: `zod-${issue.number}`,
      pr: pr.number,
      fixSha: pr.mergeCommit.oid,
      mergedAt: pr.mergedAt,
      issueTitle: issue.title,
      issueBody: (issue.body ?? "").slice(0, 4000),
      testFiles,
      srcFiles,
    });
  }
  if (!prs.pageInfo.hasNextPage) break;
  cursor = prs.pageInfo.endCursor;
}

mkdirSync(join(import.meta.dirname), { recursive: true });
writeFileSync(OUT, JSON.stringify({ cutoff: CUTOFF, tasks }, null, 2));
console.log(`scanned ${scanned} merged PRs → ${tasks.length} tasks with linked issue + test + src`);
for (const t of tasks as Array<{ id: string; issueTitle: string; fixSha: string }>) console.log(`  ${t.id}  ${t.fixSha.slice(0, 8)}  ${t.issueTitle.slice(0, 70)}`);
