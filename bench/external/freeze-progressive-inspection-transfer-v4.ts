/** Freeze a cross-repository transfer cohort from GitHub metadata only.
 * No fixing diff or post-fix source is opened here. Cases without a linked
 * issue deliberately receive only the PR title, not its implementation body.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const selected = [
  { number: 1579, sha: "f067dbf1a666abbcbe053445c1c846651030a289" },
  { number: 1574, sha: "67580306ba93b756da95ec61689d594e0ffbcef1" },
  { number: 1553, sha: "b240f63c0ac3ee865eea9ca1d76ec5f865b01083" },
  { number: 1566, sha: "ed541c4fcc974000733a10507863ac7c31ef1b12" },
  { number: 1567, sha: "50ed0e1087be090b3b58c7f009718db0adaabd23" },
  { number: 1535, sha: "56a53bf8a5b6c7acdf305571f0a29e43977870fa" },
  { number: 1528, sha: "e5eb2efbca8889ba18d2806a5b6ee6c0d4a1d564" },
  { number: 1464, sha: "0acca5433ef05a362f20306e64200e2256866bad" },
  { number: 1423, sha: "3ed97b7406f0cd4915feef44b7954d3d879c563e" },
  { number: 1401, sha: "7e4613eec48f39bbecaf7eeeee9e1273b5c93a40" },
  { number: 1347, sha: "908d7ec4b9cfdbffd6ed6113d244634d0de436dc" },
  { number: 1339, sha: "a28a3d7c96883eab09e89325e7828b290585f38a" },
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
  const problem = issue
    ? `${issue.title}\n\n${issue.body ?? ""}`.trim()
    : pr.title.trim();
  return {
    id: `arktypeio-arktype-pr-${pr.number}`,
    pr: pr.number,
    fix_sha: pr.mergeCommit.oid,
    merged_at: pr.mergedAt,
    input_source: issue ? `closing-issue-${issue.number}` : "pull-request-title-only",
    issue: problem.slice(0, 100_000),
  };
});
const output = {
  benchmark: "progressive-inspection-cross-repository-transfer-v4",
  repository: "arktypeio/arktype",
  selection: "Twelve previously unused merged TypeScript changes chosen from public PR metadata before any fixing diff was opened. A linked closing issue supplies title/body; otherwise only the PR title is used. File metadata was used only to require a source-and-test change and is not included in model input.",
  excluded_prior_cases: [1586, 1602, 1619, 1628, 1631, 1632],
  cases,
};
const outputPath = join(import.meta.dirname, "results", "2026-08-25-progressive-inspection-transfer-v4.tasks.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`froze ${cases.length} untouched ArkType cases in ${outputPath}\n`);
