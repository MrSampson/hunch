/** Freeze a fresh ArkType cohort from PR/issue metadata only. No fixing diff
 * or post-fix source is opened by this program. */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const selected = [
  { number: 1564, sha: "5f9ddd77aa08dd8a839c03c69feac89bb546f30e" },
  { number: 1495, sha: "01b446a2654292c40effda36effd326acf8fce16" },
  { number: 1493, sha: "11d68b9755e1fa9a7a7a1cdb31b889313557046d" },
  { number: 1408, sha: "837748de2546f47c40b8e6d72fa0f701ccdfb219" },
  { number: 1398, sha: "1e1db46b8d0121717c8c2461e2b7b41c289a0803" },
  { number: 1397, sha: "d242106ab3f1da2642565c24ac3164fc1ae5c3bb" },
  { number: 1389, sha: "027dffb4daef04062dc57683f78ba2ffa1dc0b76" },
  { number: 1378, sha: "efb8a717c7f3eb4478e3fb4f042450c68a99c8bc" },
  { number: 1355, sha: "231982917c7be9b462d96a876d8d01a72db38bcf" },
  { number: 1342, sha: "5812c32396500cae42e69983b204f9695cb3356f" },
  { number: 1341, sha: "c4589a13faef837ae471fa4c91e97afde54843f8" },
  { number: 1333, sha: "affd6af66d10ab3e52ad7f24cffba7a6b151eed2" },
] as const;

const fields = selected.map((entry) => `
  pr${entry.number}: pullRequest(number:${entry.number}) {
    number title mergedAt mergeCommit { oid }
    closingIssuesReferences(first:1) { nodes { number title body } }
  }`).join("");
const query = `query { repository(owner:"arktypeio", name:"arktype") {${fields}\n} }`;
const response = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
})) as { data: { repository: Record<string, {
  number: number;
  title: string;
  mergedAt: string;
  mergeCommit: { oid: string } | null;
  closingIssuesReferences: { nodes: Array<{ number: number; title: string; body: string | null }> };
}> } };

const cases = selected.map((expected) => {
  const pr = response.data.repository[`pr${expected.number}`];
  if (!pr?.mergeCommit || pr.mergeCommit.oid !== expected.sha) {
    throw new Error(`PR ${expected.number} merge SHA mismatch`);
  }
  const issue = pr.closingIssuesReferences.nodes[0];
  return {
    id: `arktypeio-arktype-pr-${pr.number}`,
    pr: pr.number,
    fix_sha: pr.mergeCommit.oid,
    merged_at: pr.mergedAt,
    input_source: issue ? `closing-issue-${issue.number}` : "pull-request-title-only",
    issue: (issue ? `${issue.title}\n\n${issue.body ?? ""}` : pr.title).trim().slice(0, 100_000),
  };
});
const output = {
  benchmark: "additive-same-file-frontier-cross-repository-transfer-v5",
  repository: "arktypeio/arktype",
  selection: "Twelve previously unused merged TypeScript changes chosen from public PR metadata before any fixing diff was opened. A linked closing issue supplies title/body; otherwise only the PR title is used.",
  excluded_prior_cases: [1339, 1347, 1401, 1423, 1464, 1528, 1535, 1553, 1566, 1567, 1574, 1579, 1586, 1602, 1619, 1628, 1631, 1632],
  cases,
};
const outputPath = join(import.meta.dirname, "results", "2026-08-25-additive-frontier-transfer-v5.tasks.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`froze ${cases.length} untouched ArkType cases in ${outputPath}\n`);
