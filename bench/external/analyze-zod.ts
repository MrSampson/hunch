import { readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { clusterBootstrapDifference, exactMcNemar, mean, median, wilson, type TaskCluster } from "./statistics.js";

const argv = process.argv.slice(2);
const flag = (name: string, dflt = ""): string => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1]! : dflt;
};
const FILES = flag("files").split(",").filter(Boolean).map((path) => resolve(path));
if (!FILES.length) throw new Error("pass comma-separated result JSON files with --files");
const REPEAT_FILTER = Number(flag("repeat", "0"));
if (!Number.isSafeInteger(REPEAT_FILTER) || REPEAT_FILTER < 0) throw new Error("--repeat must be zero (all) or a positive integer");

interface Row {
  task: string; repeat: number; arm: "A" | "C"; armOrder: string;
  scoreNum: number; turns: number; hunchCalls: number; durationMs: number;
  sessionId: string | null; score: string; agentChangedFiles: string[];
  answer?: string; valid?: boolean; infrastructureFailure?: boolean;
  sourceAccuracyNum?: number; testsPass?: boolean; testUntouched?: boolean;
  hunchDelivered?: number; hunchHypotheses?: number; hunchSupplements?: number; hunchSupplementsDelivered?: number; hunchStaleOmitted?: number;
  hunchActionabilityOmitted?: number;
  hunchAbstentions?: number; hunchAbstainedRecords?: number;
  testInfrastructureFailure?: boolean; testOutput?: string; scoredSourceFiles?: string[];
}
interface Result {
  model: string; zodHead: string; hunchHead: string; memoryHead: string;
  memoryCutoff: string; memoryCodeHead: string; noRepro: boolean;
  forceHunch: boolean; repeats: number; rows: Row[];
  isolatedSnapshot?: boolean; networkPolicy?: string; webToolsDenied?: boolean;
  futureFreeHistory?: boolean; historyThroughPreFixOnly?: boolean;
  memoryProvenanceVerified?: boolean; memoryProvenanceCommits?: number;
  isolatedScoring?: boolean;
}
interface Task { id: string; pr: number; issueTitle: string }

const results = FILES.map((path) => JSON.parse(readFileSync(path, "utf8")) as Result);
const allRows = results.flatMap((result) => result.rows);
const rows = REPEAT_FILTER ? allRows.filter((row) => row.repeat === REPEAT_FILTER) : allRows;
const isValid = (row: Row): boolean => row.valid ?? !/^(?:API Error:|Not logged in\b|Authentication failed\b|You've hit your limit\b|Claude usage limit\b)/i.test((row.answer ?? "").trim());
const validRows = rows.filter(isValid);
const infrastructureRows = rows.filter((row) => !isValid(row));
const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "zod-tasks.json"), "utf8")) as { tasks: Task[] };
const tasks = new Map(manifest.tasks.map((task) => [task.id, task]));

for (const field of ["model", "zodHead", "hunchHead", "memoryHead", "memoryCutoff", "memoryCodeHead", "noRepro", "forceHunch", "isolatedSnapshot", "networkPolicy", "webToolsDenied", "futureFreeHistory", "historyThroughPreFixOnly", "memoryProvenanceVerified", "memoryProvenanceCommits", "isolatedScoring"] as const) {
  const values = new Set(results.map((result) => String(result[field]).trim()));
  if (values.size !== 1) throw new Error(`incompatible result metadata for ${field}: ${[...values].join(", ")}`);
}

const duplicateKeys = new Set<string>();
const byRun = new Map<string, Row>();
for (const row of validRows) {
  const key = `${row.task}:${row.repeat}:${row.arm}`;
  if (byRun.has(key)) duplicateKeys.add(key);
  byRun.set(key, row);
}
if (duplicateKeys.size) throw new Error(`duplicate rows: ${[...duplicateKeys].join(", ")}`);

const taskIds = [...new Set(validRows.map((row) => row.task))].sort();
const clusters: TaskCluster[] = [];
const protocolClusters: TaskCluster[] = [];
const pairs: Array<{ task: string; repeat: number; a: Row; c: Row }> = [];
const sourceScore = (row: Row): number => row.sourceAccuracyNum
  ?? (row.testsPass ?? (row.score === "PASS" || row.score.includes("tests=true")) ? 1 : 0);
for (const task of taskIds) {
  const taskRows = validRows.filter((row) => row.task === task);
  const repeats = [...new Set(taskRows.map((row) => row.repeat))].sort((a, b) => a - b);
  const a: number[] = [];
  const c: number[] = [];
  const protocolA: number[] = [];
  const protocolC: number[] = [];
  for (const repeat of repeats) {
    const armA = byRun.get(`${task}:${repeat}:A`);
    const armC = byRun.get(`${task}:${repeat}:C`);
    if (!armA || !armC) throw new Error(`incomplete pair: ${task} repeat ${repeat}`);
    pairs.push({ task, repeat, a: armA, c: armC });
    a.push(sourceScore(armA));
    c.push(sourceScore(armC));
    protocolA.push(armA.scoreNum);
    protocolC.push(armC.scoreNum);
  }
  clusters.push({ task, a, c });
  protocolClusters.push({ task, a: protocolA, c: protocolC });
}

const armRows = (arm: "A" | "C"): Row[] => validRows.filter((row) => row.arm === arm);
const summarizeArm = (arm: "A" | "C", score: (row: Row) => number) => {
  const selected = armRows(arm);
  const passes = selected.reduce((sum, row) => sum + score(row), 0);
  return {
    arm, runs: selected.length, passes, rate: passes / selected.length,
    wilson95: wilson(passes, selected.length),
    medianTurns: median(selected.map((row) => row.turns)),
    medianDurationMs: median(selected.map((row) => row.durationMs)),
  };
};
const aSummary = summarizeArm("A", sourceScore);
const cSummary = summarizeArm("C", sourceScore);
const protocolASummary = summarizeArm("A", (row) => row.scoreNum);
const protocolCSummary = summarizeArm("C", (row) => row.scoreNum);
const aWinTasks = pairs.filter((pair) => sourceScore(pair.a) > sourceScore(pair.c)).map((pair) => pair.task);
const cWinTasks = pairs.filter((pair) => sourceScore(pair.c) > sourceScore(pair.a)).map((pair) => pair.task);
const aWins = aWinTasks.length;
const cWins = cWinTasks.length;
const tiePass = pairs.filter((pair) => sourceScore(pair.a) === 1 && sourceScore(pair.c) === 1).length;
const tieFail = pairs.filter((pair) => sourceScore(pair.a) === 0 && sourceScore(pair.c) === 0).length;
const protocolAWins = pairs.filter((pair) => pair.a.scoreNum > pair.c.scoreNum).length;
const protocolCWins = pairs.filter((pair) => pair.c.scoreNum > pair.a.scoreNum).length;
const protocolTiePass = pairs.filter((pair) => pair.a.scoreNum === 1 && pair.c.scoreNum === 1).length;
const protocolTieFail = pairs.filter((pair) => pair.a.scoreNum === 0 && pair.c.scoreNum === 0).length;
const taskWins = clusters.filter((cluster) => mean(cluster.c) > mean(cluster.a)).length;
const taskLosses = clusters.filter((cluster) => mean(cluster.c) < mean(cluster.a)).length;
const taskTies = clusters.length - taskWins - taskLosses;
const effect = cSummary.rate - aSummary.rate;
const effectClusterBootstrap95 = clusterBootstrapDifference(clusters);
const protocolEffect = protocolCSummary.rate - protocolASummary.rate;
const protocolEffectClusterBootstrap95 = clusterBootstrapDifference(protocolClusters);
const cRows = armRows("C");
const uptakeRuns = cRows.filter((row) => row.hunchCalls > 0).length;
const deliveryRuns = cRows.filter((row) => (row.hunchDelivered ?? 0) > 0).length;
const abstentionRuns = cRows.filter((row) => (row.hunchAbstentions ?? 0) > 0).length;
const sealed = results.every((result) => result.futureFreeHistory === true
  && result.historyThroughPreFixOnly === true
  && result.memoryProvenanceVerified === true
  && result.isolatedScoring === true
  && result.networkPolicy === "deny-all"
  && result.webToolsDenied === true);

const summary = {
  generatedAt: new Date().toISOString(), files: FILES,
  repeatFilter: REPEAT_FILTER || null,
  treatmentMode: results[0]!.forceHunch ? "forced-retrieval" : "natural-use",
  model: results[0]!.model,
  zodHead: results[0]!.zodHead.trim(),
  hunchHead: results[0]!.hunchHead.trim(),
  memoryHead: results[0]!.memoryHead.trim(),
  memoryCutoff: results[0]!.memoryCutoff,
  memoryCodeHead: results[0]!.memoryCodeHead.trim(),
  validity: sealed ? "sealed" : "unsealed-harness-audit",
  safeguards: {
    isolatedSnapshot: results[0]!.isolatedSnapshot ?? false,
    futureFreeHistory: results[0]!.futureFreeHistory ?? false,
    historyThroughPreFixOnly: results[0]!.historyThroughPreFixOnly ?? false,
    memoryProvenanceVerified: results[0]!.memoryProvenanceVerified ?? false,
    memoryProvenanceCommits: results[0]!.memoryProvenanceCommits ?? 0,
    isolatedScoring: results[0]!.isolatedScoring ?? false,
    networkPolicy: results[0]!.networkPolicy ?? "unrecorded",
    webToolsDenied: results[0]!.webToolsDenied ?? false,
  },
  tasks: clusters.length, pairedRuns: pairs.length,
  infrastructureRowsExcluded: infrastructureRows.length,
  arms: { A: aSummary, C: cSummary },
  effect, effectClusterBootstrap95,
  paired: { cWins, aWins, cWinTasks, aWinTasks, tiePass, tieFail, exactMcNemarP: exactMcNemar(aWins, cWins) },
  taskLevel: { cWins: taskWins, aWins: taskLosses, ties: taskTies },
  protocol: {
    arms: { A: protocolASummary, C: protocolCSummary },
    effect: protocolEffect,
    effectClusterBootstrap95: protocolEffectClusterBootstrap95,
    paired: {
      cWins: protocolCWins, aWins: protocolAWins,
      tiePass: protocolTiePass, tieFail: protocolTieFail,
      exactMcNemarP: exactMcNemar(protocolAWins, protocolCWins),
    },
  },
  uptake: {
    runsWithHunchCalls: uptakeRuns, totalCRuns: cRows.length, rate: uptakeRuns / cRows.length,
    calls: cRows.reduce((sum, row) => sum + row.hunchCalls, 0),
    runsWithDeliveredDecisions: deliveryRuns,
    deliveredDecisions: cRows.reduce((sum, row) => sum + (row.hunchDelivered ?? 0), 0),
    deliveredHypotheses: cRows.reduce((sum, row) => sum + (row.hunchHypotheses ?? 0), 0),
    actionabilityOmitted: cRows.reduce((sum, row) => sum + (row.hunchActionabilityOmitted ?? 0), 0),
    supplementsAttempted: cRows.reduce((sum, row) => sum + (row.hunchSupplements ?? 0), 0),
    supplementsDelivered: cRows.reduce((sum, row) => sum + (row.hunchSupplementsDelivered ?? row.hunchSupplements ?? 0), 0),
    staleOmitted: cRows.reduce((sum, row) => sum + (row.hunchStaleOmitted ?? 0), 0),
    runsWithAbstention: abstentionRuns,
    abstentionResponses: cRows.reduce((sum, row) => sum + (row.hunchAbstentions ?? 0), 0),
    abstainedRecords: cRows.reduce((sum, row) => sum + (row.hunchAbstainedRecords ?? 0), 0),
  },
  perTask: clusters.map((cluster) => ({
    task: cluster.task,
    title: tasks.get(cluster.task)?.issueTitle ?? "",
    pr: tasks.get(cluster.task)?.pr ?? null,
    aPasses: cluster.a.reduce((sum, value) => sum + value, 0),
    cPasses: cluster.c.reduce((sum, value) => sum + value, 0),
    aProtocolPasses: protocolClusters.find((item) => item.task === cluster.task)!.a.reduce((sum, value) => sum + value, 0),
    cProtocolPasses: protocolClusters.find((item) => item.task === cluster.task)!.c.reduce((sum, value) => sum + value, 0),
    repeats: cluster.a.length,
    effect: mean(cluster.c) - mean(cluster.a),
    hunchCalls: validRows.filter((row) => row.task === cluster.task && row.arm === "C").reduce((sum, row) => sum + row.hunchCalls, 0),
    hunchAbstentions: validRows.filter((row) => row.task === cluster.task && row.arm === "C").reduce((sum, row) => sum + (row.hunchAbstentions ?? 0), 0),
  })),
};

const pct = (value: number): string => `${(100 * value).toFixed(1)}%`;
const pp = (value: number): string => `${(100 * value).toFixed(1)}`;
const linkLabel = (value: string): string => value
  .replaceAll("|", "\\|")
  .replaceAll("[", "\\[")
  .replaceAll("]", "\\]");
const report = [
  `# Zod large time-split accuracy benchmark`,
  ``,
  `Generated ${summary.generatedAt}. This report contains **${summary.tasks} distinct held-out tasks**, `
    + `**${summary.pairedRuns} paired runs**, and **${validRows.length} valid agent sessions** `
    + `(${infrastructureRows.length} infrastructure rows excluded).`,
  ``,
  `## Treatment mode`,
  ``,
  results[0]!.forceHunch
    ? `This is a **forced-retrieval efficacy test**: every Hunch arm had to call Hunch before diagnosis. It measures whether available memory improves accuracy when consulted, not whether agents naturally choose to use the product.`
    : `This is a **natural-use product test**: Hunch was available but not explicitly required. Retrieval uptake is therefore part of the measured product effect.`,
  ``,
  ...(sealed ? [
    `## Validity safeguards`,
    ``,
    `Every attempt ran in a Git repository whose authentic ancestry ended at the pre-fix commit, with no remote or future objects. `
      + `All ${summary.safeguards.memoryProvenanceCommits} memory provenance commits were reachable. Outbound network access and Claude web tools were denied, and a separate clean checkout graded the source patch against hidden future tests.`,
    ``,
  ] : [
    `## Validity warning`,
    ``,
    `**HARNESS AUDIT ONLY — do not use these numbers as an unseen-future accuracy claim.** `
      + `These source files do not record a history-free checkout and deny-all network policy, so later Git objects or GitHub may have been reachable.`,
    ``,
  ]),
  `## Source-accuracy headline`,
  ``,
  `| arm | passes | accuracy | run-level Wilson 95% CI | median turns | median time |`,
  `|---|---:|---:|---:|---:|---:|`,
  `| A — no Hunch | ${aSummary.passes}/${aSummary.runs} | ${pct(aSummary.rate)} | ${pct(aSummary.wilson95.low)}–${pct(aSummary.wilson95.high)} | ${aSummary.medianTurns} | ${(aSummary.medianDurationMs / 1000).toFixed(0)}s |`,
  `| C — Hunch | ${cSummary.passes}/${cSummary.runs} | ${pct(cSummary.rate)} | ${pct(cSummary.wilson95.low)}–${pct(cSummary.wilson95.high)} | ${cSummary.medianTurns} | ${(cSummary.medianDurationMs / 1000).toFixed(0)}s |`,
  ``,
  `Observed accuracy difference: **${effect >= 0 ? "+" : ""}${pp(effect)} percentage points**. `
    + `Task-cluster bootstrap 95% CI: **${pct(effectClusterBootstrap95.low)} to ${pct(effectClusterBootstrap95.high)}**.`,
  ``,
  `Paired runs: ${cWins} Hunch wins, ${aWins} Hunch losses, ${tiePass} tie-passes, ${tieFail} tie-fails; `
    + `two-sided exact McNemar p=${summary.paired.exactMcNemarP.toFixed(4)}.`,
  `Task-level direction across repeats: ${taskWins} Hunch wins, ${taskLosses} Hunch losses, ${taskTies} ties.`,
  `Treatment uptake: ${uptakeRuns}/${cRows.length} Hunch runs made at least one Hunch call (${pct(summary.uptake.rate)}), ${summary.uptake.calls} calls total.`,
  `Memory delivery: ${deliveryRuns}/${cRows.length} Hunch runs received at least one decision, `
    + `${summary.uptake.deliveredDecisions} records produced ${summary.uptake.deliveredHypotheses} bounded hypotheses, `
    + `${summary.uptake.actionabilityOmitted} lower-ranked hypotheses were withheld, and ${summary.uptake.supplementsDelivered}/${summary.uptake.supplementsAttempted} attempted supplements were delivered; `
    + `${summary.uptake.staleOmitted} records were omitted for stale provenance.`,
  `Retrieval abstention: ${summary.uptake.runsWithAbstention}/${cRows.length} Hunch runs abstained at least once; `
    + `${summary.uptake.abstentionResponses} abstention responses withheld ${summary.uptake.abstainedRecords} weak prescriptive records.`,
  ``,
  `## Interpretation`,
  ``,
  summary.paired.exactMcNemarP < 0.05 && effect > 0
    ? `This run provides statistically significant evidence of an accuracy improvement under ${summary.treatmentMode}.`
    : summary.paired.exactMcNemarP < 0.05 && effect < 0
      ? `This run provides statistically significant evidence of an accuracy regression under ${summary.treatmentMode}.`
      : `This run does **not** demonstrate an accuracy improvement under ${summary.treatmentMode}. The point estimate is ${effect >= 0 ? "+" : ""}${pp(effect)} percentage points, but the paired result is not statistically significant (p=${summary.paired.exactMcNemarP.toFixed(4)}). It also does not establish that Hunch is harmful; a larger repeated sample is needed to distinguish a small effect from model variance.`,
  `Source-accuracy discordances: Hunch-only wins: ${cWinTasks.length ? cWinTasks.join(", ") : "none"}; control-only wins: ${aWinTasks.length ? aWinTasks.join(", ") : "none"}.`,
  ``,
  `## Protocol-compliance score`,
  ``,
  `This stricter secondary metric also requires the agent not to edit any existing upstream test file.`,
  ``,
  `| arm | passes | rate | observed difference | task-cluster bootstrap 95% CI |`,
  `|---|---:|---:|---:|---:|`,
  `| A — no Hunch | ${protocolASummary.passes}/${protocolASummary.runs} | ${pct(protocolASummary.rate)} |  |  |`,
  `| C — Hunch | ${protocolCSummary.passes}/${protocolCSummary.runs} | ${pct(protocolCSummary.rate)} | ${protocolEffect >= 0 ? "+" : ""}${pct(protocolEffect)} | ${pct(protocolEffectClusterBootstrap95.low)} to ${pct(protocolEffectClusterBootstrap95.high)} |`,
  ``,
  `Protocol paired runs: ${protocolCWins} Hunch wins, ${protocolAWins} Hunch losses, `
    + `${protocolTiePass} tie-passes, ${protocolTieFail} tie-fails; `
    + `two-sided exact McNemar p=${summary.protocol.paired.exactMcNemarP.toFixed(4)}.`,
  ``,
  `## Per-task results`,
  ``,
  `| task | issue | source A | source C | protocol A | protocol C | source effect | Hunch calls | abstentions |`,
  `|---|---|---:|---:|---:|---:|---:|---:|---:|`,
  ...summary.perTask.map((task) => `| ${task.task} | [${linkLabel(task.title)}](https://github.com/colinhacks/zod/issues/${task.task.slice(4)}) | ${task.aPasses}/${task.repeats} | ${task.cPasses}/${task.repeats} | ${task.aProtocolPasses}/${task.repeats} | ${task.cProtocolPasses}/${task.repeats} | ${task.effect > 0 ? "+" : ""}${task.effect.toFixed(1)} | ${task.hunchCalls} | ${task.hunchAbstentions} |`),
  ``,
  `## Provenance`,
  ``,
  `- Model: \`${summary.model}\``,
  `- Zod mining checkout: \`${summary.zodHead}\``,
  `- Frozen Hunch executable: \`${summary.hunchHead}\``,
  `- Memory cutoff: ${summary.memoryCutoff}; last eligible Zod code commit: \`${summary.memoryCodeHead}\``,
  `- Frozen memory commit: \`${summary.memoryHead}\``,
  `- Diagnosis mode: future regression tests hidden until scoring`,
  `- Treatment mode: ${summary.treatmentMode}`,
  `- Validity status: ${summary.validity}`,
  `- Agent checkout: ${sealed ? "authentic history through pre-fix only; no remote or future Git objects" : "unsealed or unrecorded"}`,
  `- Memory provenance: ${summary.safeguards.memoryProvenanceVerified ? `${summary.safeguards.memoryProvenanceCommits} commits verified reachable` : "not verified"}`,
  `- Scoring: ${summary.safeguards.isolatedScoring ? "separate clean checkout" : "live agent workspace or unrecorded"}`,
  `- Network policy: ${summary.safeguards.networkPolicy}; Claude web tools denied: ${summary.safeguards.webToolsDenied}`,
  `- Arm order alternated; test-file integrity checked before hidden tests were installed`,
  ``,
  `## Raw result files`,
  ``,
  ...FILES.map((path) => `- \`${basename(path)}\``),
  ``,
].join("\n");

const outBase = resolve(flag("out", join(import.meta.dirname, "results", new Date().toISOString().replace(/[:.]/g, "-") + "-zod-large")));
writeFileSync(`${outBase}.json`, JSON.stringify(summary, null, 2));
writeFileSync(`${outBase}.md`, report);
console.log(report);
console.log(`\nsummary: ${outBase}.json`);
console.log(`report:  ${outBase}.md`);
