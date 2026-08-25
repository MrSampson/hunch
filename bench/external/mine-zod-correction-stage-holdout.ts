/** Freeze all still-untouched focused Zod fixes after the v2 and v3 development sets. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CUTOFF = "2026-08-13T00:00:00Z";
const EXPECTED = 11;
const v2 = JSON.parse(readFileSync(join(import.meta.dirname, "zod-owner-holdout-v2-tasks.json"), "utf8")) as {
  tasks: Array<{ id: string }>;
};
const used = new Set([...v2.tasks.map((task) => task.id), "zod-5968", "zod-6156", "zod-6176", "zod-6342", "zod-5980", "zod-6027", "zod-6296"]);
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
  const id = `zod-${issue.number}`;
  if (used.has(id)) return [];
  const paths = pr.files.nodes.map((file) => file.path);
  const testFiles = paths.filter((path) => path.startsWith("packages/zod/src/") && path.endsWith(".test.ts"));
  const srcFiles = paths.filter((path) => path.startsWith("packages/zod/src/") && path.endsWith(".ts") && !path.endsWith(".test.ts"));
  if (!testFiles.length || !srcFiles.length) return [];
  return [{
    id,
    pr: pr.number,
    fixSha: pr.mergeCommit.oid,
    mergedAt: pr.mergedAt,
    issueTitle: issue.title,
    issueBody: (issue.body ?? "").slice(0, 10_000),
  }];
});
if (tasks.length !== EXPECTED) throw new Error(`expected ${EXPECTED} untouched tasks, found ${tasks.length}`);
const out = join(import.meta.dirname, "zod-correction-stage-holdout-tasks.json");
writeFileSync(out, `${JSON.stringify({ cutoff: CUTOFF, excluded: [...used].sort(), tasks }, null, 2)}\n`);
process.stdout.write(`froze ${tasks.length} untouched tasks in ${out}\n`);
