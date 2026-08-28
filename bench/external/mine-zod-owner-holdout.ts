/** Freeze the newest focused, issue-linked Zod fixes for owner-ranking holdout. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const CUTOFF = "2026-08-13T00:00:00Z";
const LIMIT = 20;
const OUT = join(import.meta.dirname, "zod-owner-holdout-v2-tasks.json");
const query = `query {
  repository(owner:"colinhacks", name:"zod") {
    pullRequests(states:MERGED, first:100, orderBy:{field:UPDATED_AT,direction:DESC}) {
      nodes {
        number mergedAt mergeCommit { oid }
        files(first:40) { nodes { path } }
        closingIssuesReferences(first:2) { nodes { number title body } }
      }
    }
  }
}`;
interface PullRequest {
  number: number;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
  files: { nodes: Array<{ path: string }> };
  closingIssuesReferences: { nodes: Array<{ number: number; title: string; body: string | null }> };
}
const response = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
})) as { data: { repository: { pullRequests: { nodes: PullRequest[] } } } };
const tasks = response.data.repository.pullRequests.nodes.flatMap((pr) => {
  const issue = pr.closingIssuesReferences.nodes[0];
  if (!issue || !pr.mergeCommit || pr.mergedAt < CUTOFF || pr.files.nodes.length > 12) return [];
  const paths = pr.files.nodes.map((file) => file.path);
  const testFiles = paths.filter((path) => path.startsWith("packages/zod/src/") && path.endsWith(".test.ts"));
  const srcFiles = paths.filter((path) => path.startsWith("packages/zod/src/") && path.endsWith(".ts") && !path.endsWith(".test.ts"));
  if (!testFiles.length || !srcFiles.length) return [];
  return [{
    id: `zod-${issue.number}`,
    pr: pr.number,
    fixSha: pr.mergeCommit.oid,
    mergedAt: pr.mergedAt,
    issueTitle: issue.title,
    issueBody: (issue.body ?? "").slice(0, 10_000),
    testFiles,
    srcFiles,
  }];
}).slice(0, LIMIT);
if (tasks.length !== LIMIT) throw new Error(`expected ${LIMIT} holdout tasks, found ${tasks.length}`);
writeFileSync(OUT, `${JSON.stringify({ cutoff: CUTOFF, limit: LIMIT, tasks }, null, 2)}\n`);
console.log(`froze ${tasks.length} tasks in ${OUT}`);
