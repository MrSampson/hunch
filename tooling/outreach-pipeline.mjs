#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const LEAD_SCHEMA = "hunch.outreach-lead/1";
export const STATUSES = [
  "discovered", "qualified", "approved", "contacted", "replied", "pilot", "activated",
  "not_fit", "do_not_contact",
];
export const CONTACT_PERMISSIONS = [
  "warm_intro", "opt_in", "published_project_contact", "community_permission",
];
export const PROOFS = Object.freeze({
  "v1.19-retrieval": {
    short: "In a preregistered 12-problem test, Hunch found the changed declaration in 6 cases instead of 3 and reduced inspection by 41.9% for the same five successful finds.",
    caveat: "This was a small controlled test, not a promise of the same lift in every repository.",
    url: "https://github.com/davesheffer/hunch/tree/main/bench/external/results",
  },
  "delivery-gap": {
    short: "In a 20-session test, coding agents opened an installed instruction skill zero times; guaranteed delivery made the discriminating hard-bug cases pass.",
    caveat: "This measures delivery of project knowledge, not general model quality.",
    url: "https://hunch-pi.vercel.app/blog/post?slug=skills-are-never-read",
  },
});

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_STORE = resolve(TOOL_ROOT, ".outreach", "leads.jsonl");
const ACTIONABLE_STATUSES = new Set(["qualified", "approved", "contacted", "replied", "pilot", "activated"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function day(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function plusDays(date, count) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return day(next);
}

function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : 0;
}

function variantFor(lead) {
  if (lead.variant === "story" || lead.variant === "proof") return lead.variant;
  return Number.parseInt(createHash("sha256").update(lead.id).digest("hex").slice(0, 2), 16) % 2
    ? "story"
    : "proof";
}

export function validateLead(lead) {
  const errors = [];
  if (!lead || typeof lead !== "object" || Array.isArray(lead)) return ["lead must be an object"];
  if (lead.schema !== LEAD_SCHEMA) errors.push(`schema must be ${LEAD_SCHEMA}`);
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(text(lead.id))) errors.push("id must be a stable lowercase slug");
  if (!/^[^/\s]+\/[^/\s]+$/.test(text(lead.project))) errors.push("project must be an owner/repository pair");
  if (!validHttpsUrl(text(lead.repository_url))) errors.push("repository_url must be a credential-free HTTPS URL");
  if (!validHttpsUrl(text(lead.source_url))) errors.push("source_url must cite the public signal used for personalization");
  if (!STATUSES.includes(lead.status)) errors.push(`status must be one of ${STATUSES.join(", ")}`);
  if (!text(lead.discovered_at).match(/^\d{4}-\d{2}-\d{2}$/)) errors.push("discovered_at must be YYYY-MM-DD");
  if (lead.follow_ups !== undefined && (!Number.isInteger(lead.follow_ups) || lead.follow_ups < 0 || lead.follow_ups > 1)) {
    errors.push("follow_ups must be 0 or 1; the pipeline permits only one follow-up");
  }
  if (lead.status === "do_not_contact" && lead.follow_up_at) errors.push("do_not_contact leads cannot have a follow_up_at");

  if (ACTIONABLE_STATUSES.has(lead.status)) {
    if (text(lead.observed_signal).length < 20) errors.push("actionable leads require a concrete observed_signal");
    if (text(lead.problem_hypothesis).length < 20) errors.push("actionable leads require a project-specific problem_hypothesis");
    if (!PROOFS[lead.proof_id]) errors.push(`proof_id must be one of ${Object.keys(PROOFS).join(", ")}`);
    if (text(lead.segment).length < 3) errors.push("actionable leads require a segment");
    if (!lead.contact || typeof lead.contact !== "object") {
      errors.push("actionable leads require contact details");
    } else {
      const permission = text(lead.contact.permission);
      const destination = text(lead.contact.destination);
      if (!CONTACT_PERMISSIONS.includes(permission)) {
        errors.push(`contact.permission must be one of ${CONTACT_PERMISSIONS.join(", ")}`);
      }
      if (!destination) errors.push("contact.destination is required");
      if (!text(lead.contact.channel)) errors.push("contact.channel is required");
      if (permission === "community_permission" && !validHttpsUrl(destination)) {
        errors.push("community_permission must point to an HTTPS community destination");
      }
      if (destination.includes("@") && !["warm_intro", "opt_in", "published_project_contact"].includes(permission)) {
        errors.push("email is allowed only for a warm intro, opt-in, or published project contact");
      }
    }
  }
  if (["qualified", "approved", "contacted", "replied", "pilot", "activated"].includes(lead.status)
    && !text(lead.qualified_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("qualified and later stages require qualified_at");
  }
  if (["approved", "contacted", "replied", "pilot", "activated"].includes(lead.status)
    && !text(lead.approved_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("approved and later stages require approved_at");
  }
  if (["contacted", "replied", "pilot", "activated"].includes(lead.status)
    && !text(lead.contacted_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("contacted and later stages require contacted_at");
  }
  if (["replied", "pilot", "activated"].includes(lead.status)
    && !text(lead.replied_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("replied and later stages require replied_at");
  }
  if (["pilot", "activated"].includes(lead.status)
    && !text(lead.pilot_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("pilot and later stages require pilot_at");
  }
  if (lead.status === "activated" && !text(lead.activated_at).match(/^\d{4}-\d{2}-\d{2}$/)) {
    errors.push("activated status requires activated_at");
  }
  return errors;
}

export function parseLeads(source) {
  const leads = [];
  const ids = new Set();
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let lead;
    try {
      lead = JSON.parse(line);
    } catch (error) {
      throw new Error(`line ${index + 1}: invalid JSON (${error.message})`);
    }
    const errors = validateLead(lead);
    if (errors.length) throw new Error(`line ${index + 1} (${lead?.id ?? "unknown"}): ${errors.join("; ")}`);
    if (ids.has(lead.id)) throw new Error(`line ${index + 1}: duplicate lead id ${lead.id}`);
    ids.add(lead.id);
    leads.push(lead);
  }
  return leads;
}

export function serializeLeads(leads) {
  const ordered = [...leads].sort((a, b) => a.id.localeCompare(b.id));
  return ordered.map((lead) => JSON.stringify(lead)).join("\n") + (ordered.length ? "\n" : "");
}

export function candidatesFromGitHubSearch(payload, discoveredAt = day()) {
  if (!payload || !Array.isArray(payload.items)) throw new Error("GitHub code search returned an invalid payload");
  const byProject = new Map();
  for (const item of payload.items) {
    if (item?.repository?.fork === true || item?.repository?.archived === true || item?.repository?.disabled === true) continue;
    const project = text(item?.repository?.full_name);
    const repositoryUrl = text(item?.repository?.html_url);
    const sourceUrl = text(item?.html_url);
    const path = text(item?.path);
    if (!project || !validHttpsUrl(repositoryUrl) || !validHttpsUrl(sourceUrl) || !path) continue;
    const id = project.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
    if (byProject.has(id)) continue;
    byProject.set(id, {
      schema: LEAD_SCHEMA,
      id,
      project,
      repository_url: repositoryUrl,
      source_url: sourceUrl,
      observed_signal: `${project} publishes ${path}, a public instruction file for coding agents.`,
      problem_hypothesis: "The project may tell assistants what to do without preserving the decision or incident behind each rule.",
      segment: "open_source_maintainer",
      proof_id: "v1.19-retrieval",
      status: "discovered",
      follow_ups: 0,
      discovered_at: discoveredAt,
      fit_score: path === "AGENTS.md" || path === "CLAUDE.md" ? 1 : 0,
    });
  }
  return [...byProject.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function hydrateGitHubCandidate(lead, repository, today = day()) {
  if (repository?.fork || repository?.archived || repository?.disabled) return null;
  const stars = Number.isInteger(repository?.stargazers_count) ? repository.stargazers_count : 0;
  const pushedAt = text(repository?.pushed_at);
  const description = text(repository?.description);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 120);
  const active = pushedAt && new Date(pushedAt).getTime() >= cutoff.getTime();
  let score = lead.fit_score ?? 0;
  if (active) score += 2;
  if (stars >= 25 && stars <= 5_000) score += 2;
  else if ((stars >= 5 && stars < 25) || (stars > 5_000 && stars <= 20_000)) score += 1;
  if (/\b(?:ai|agent|developer|devtool|platform|framework|architecture|infrastructure)\b/i.test(description)) score += 1;
  return {
    ...lead,
    fit_score: score,
    public_metrics: {
      stars,
      forks: Number.isInteger(repository?.forks_count) ? repository.forks_count : 0,
      open_issues: Number.isInteger(repository?.open_issues_count) ? repository.open_issues_count : 0,
      pushed_at: pushedAt || null,
    },
    repository_description: description || undefined,
  };
}

export function buildQueue(leads, today = day()) {
  const queue = { research: [], approval: [], first_touch: [], follow_up: [], active: [] };
  for (const lead of leads) {
    if (lead.status === "discovered") queue.research.push(lead);
    else if (lead.status === "qualified") queue.approval.push(lead);
    else if (lead.status === "approved") queue.first_touch.push(lead);
    else if (lead.status === "contacted" && (lead.follow_ups ?? 0) < 1 && lead.follow_up_at && lead.follow_up_at <= today) {
      queue.follow_up.push(lead);
    } else if (["replied", "pilot"].includes(lead.status)) queue.active.push(lead);
  }
  queue.research.sort((a, b) => (b.fit_score ?? 0) - (a.fit_score ?? 0) || a.id.localeCompare(b.id));
  return queue;
}

export function researchReview(leads, limit = 10) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("review limit must be between 1 and 100");
  return buildQueue(leads).research.slice(0, limit).map((lead) => ({
    id: lead.id,
    project: lead.project,
    fit_score: lead.fit_score ?? 0,
    stars: lead.public_metrics?.stars ?? null,
    pushed_at: lead.public_metrics?.pushed_at ?? null,
    description: lead.repository_description ?? null,
    observed_signal: lead.observed_signal,
    source_url: lead.source_url,
  }));
}

export function qualifyLead(lead, input, today = day()) {
  if (lead.status !== "discovered" && lead.status !== "qualified") {
    throw new Error("only discovered or qualified leads can be qualified");
  }
  const qualified = {
    ...lead,
    observed_signal: text(input.observed_signal),
    problem_hypothesis: text(input.problem_hypothesis),
    segment: text(input.segment),
    proof_id: text(input.proof_id) || "v1.19-retrieval",
    contact: {
      name: text(input.contact_name),
      channel: text(input.contact_channel),
      destination: text(input.contact_destination),
      permission: text(input.contact_permission),
    },
    status: "qualified",
    qualified_at: today,
  };
  const errors = validateLead(qualified);
  if (errors.length) throw new Error(errors.join("; "));
  return qualified;
}

export function approveLead(lead, today = day()) {
  if (lead.status !== "qualified") throw new Error("only a qualified lead can be approved");
  const approved = { ...lead, status: "approved", approved_at: today };
  const errors = validateLead(approved);
  if (errors.length) throw new Error(errors.join("; "));
  return approved;
}

export function recordLeadStage(lead, status, { date = day(), note = "" } = {}) {
  const transitions = {
    approved: ["contacted"],
    contacted: ["replied"],
    replied: ["pilot"],
    pilot: ["activated"],
  };
  if (["not_fit", "do_not_contact"].includes(status)) {
    const stopped = { ...lead, status, follow_up_at: undefined, note: text(note) || lead.note };
    const errors = validateLead(stopped);
    if (errors.length) throw new Error(errors.join("; "));
    return stopped;
  }
  if (!(transitions[lead.status] ?? []).includes(status)) {
    throw new Error(`invalid outreach transition: ${lead.status} -> ${status}`);
  }
  const next = { ...lead, status, note: text(note) || lead.note };
  if (status === "contacted") {
    next.contacted_at = date;
    next.follow_up_at = plusDays(date, 7);
  } else if (status === "replied") {
    next.replied_at = date;
    next.follow_up_at = undefined;
  } else if (status === "pilot") next.pilot_at = date;
  else if (status === "activated") next.activated_at = date;
  const errors = validateLead(next);
  if (errors.length) throw new Error(errors.join("; "));
  return next;
}

export function recordFollowUp(lead, date = day()) {
  if (lead.status !== "contacted" || (lead.follow_ups ?? 0) >= 1) {
    throw new Error("a follow-up requires contacted status and no prior follow-up");
  }
  if (!lead.follow_up_at || lead.follow_up_at > date) throw new Error("the follow-up is not due yet");
  const next = { ...lead, follow_ups: 1, last_contacted_at: date, follow_up_at: undefined };
  const errors = validateLead(next);
  if (errors.length) throw new Error(errors.join("; "));
  return next;
}

export function draftForLead(lead, { followUp = false, today = day() } = {}) {
  const errors = validateLead(lead);
  if (errors.length) throw new Error(errors.join("; "));
  if (followUp) {
    if (lead.status !== "contacted" || (lead.follow_ups ?? 0) >= 1) {
      throw new Error("a follow-up requires contacted status and no prior follow-up");
    }
    if (!lead.follow_up_at || lead.follow_up_at > today) throw new Error("the follow-up is not due yet");
  } else if (lead.status !== "approved") {
    throw new Error("a first-touch draft requires explicit approved status");
  }
  const name = text(lead.contact?.name) || `${lead.project} maintainer`;
  const proof = PROOFS[lead.proof_id];
  if (followUp) {
    return [
      `Hi ${name},`,
      "",
      `One quick follow-up on Hunch and ${lead.project}. The concrete question I thought it could test is: ${lead.problem_hypothesis}`,
      "",
      "If that is useful, I can run a free 30-minute memory audit against the public repository history and send you the receipt. If not, no reply is needed and I will not follow up again.",
      "",
      "— Dave",
    ].join("\n");
  }
  const observation = `I noticed ${lead.observed_signal} (${lead.source_url})`;
  const story = "I built Hunch because coding assistants can read the current code but usually lose why a team chose a design, rejected an alternative, or kept a strange-looking bug fix. Hunch keeps that engineering history with the project and gives the relevant reason back before an edit.";
  const measured = `${proof.short} ${proof.caveat} (${proof.url})`;
  const paragraphs = variantFor(lead) === "proof" ? [observation, measured, story] : [observation, story, measured];
  return [
    `Hi ${name},`,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `Would you be open to a free 30-minute memory audit on ${lead.project}? I would use only its public history, send you the receipt, and stop there if it is not useful.`,
    "",
    "— Dave",
  ].join("\n");
}

export function outreachReport(leads) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, leads.filter((lead) => lead.status === status).length]));
  const contacted = leads.filter((lead) => text(lead.contacted_at)).length;
  const replied = leads.filter((lead) => text(lead.replied_at) || ["replied", "pilot", "activated"].includes(lead.status)).length;
  const pilots = leads.filter((lead) => text(lead.pilot_at) || ["pilot", "activated"].includes(lead.status)).length;
  const activated = leads.filter((lead) => text(lead.activated_at) || lead.status === "activated").length;
  return {
    contract: "hunch.outreach-report/1",
    leads: leads.length,
    counts,
    funnel: {
      contacted,
      replied,
      pilots,
      activated,
      reply_rate: rate(replied, contacted),
      pilot_rate_from_contact: rate(pilots, contacted),
      activation_rate_from_pilot: rate(activated, pilots),
    },
  };
}

function readStore(path) {
  return existsSync(path) ? parseLeads(readFileSync(path, "utf8")) : [];
}

function writeStore(path, leads) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, serializeLeads(leads), { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function storeFrom(args) {
  return resolve(option(args, "--file", DEFAULT_STORE));
}

function printQueue(queue) {
  for (const [name, leads] of Object.entries(queue)) {
    process.stdout.write(`\n${name} (${leads.length})\n`);
    for (const lead of leads) process.stdout.write(`- ${lead.id}: ${lead.project}\n`);
  }
}

function replaceLead(leads, id, transform) {
  const index = leads.findIndex((lead) => lead.id === id);
  if (index < 0) throw new Error(`unknown lead: ${id}`);
  const next = [...leads];
  next[index] = transform(next[index]);
  return next;
}

function usage() {
  return [
    "Hunch outreach pipeline (research and drafting only; never sends messages)",
    "",
    "Usage:",
    "  npm run outreach -- init [--file PATH]",
    "  npm run outreach -- discover-github --query QUERY [--limit 20] [--file PATH]",
    "  npm run outreach -- validate [--file PATH]",
    "  npm run outreach -- queue [--date YYYY-MM-DD] [--file PATH]",
    "  npm run outreach -- review [--limit 10] [--file PATH]",
    "  npm run outreach -- qualify LEAD_ID --signal TEXT --problem TEXT --name NAME --channel CHANNEL --destination DESTINATION --permission PERMISSION --segment SEGMENT [--proof PROOF_ID]",
    "  npm run outreach -- approve LEAD_ID [--date YYYY-MM-DD] [--file PATH]",
    "  npm run outreach -- draft LEAD_ID [--follow-up] [--file PATH]",
    "  npm run outreach -- record LEAD_ID --status contacted|replied|pilot|activated|not_fit|do_not_contact [--date YYYY-MM-DD] [--note TEXT] [--file PATH]",
    "  npm run outreach -- record-follow-up LEAD_ID [--date YYYY-MM-DD] [--file PATH]",
    "  npm run outreach -- report [--file PATH]",
    "",
    "Every first touch requires an explicit qualify then approve command.",
    "See docs/outreach-pipeline.md for the schema, stage gates and outreach rules.",
  ].join("\n");
}

export function runCli(argv) {
  const [command, ...args] = argv;
  const store = storeFrom(args);
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (command === "init") {
    if (!existsSync(store)) writeStore(store, []);
    process.stdout.write(`${store}\n`);
    return 0;
  }
  if (command === "discover-github") {
    const query = text(option(args, "--query", ""));
    const limit = Number(option(args, "--limit", "20"));
    if (!query) throw new Error("discover-github requires --query");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be between 1 and 100");
    const payload = JSON.parse(execFileSync("gh", [
      "api", "-X", "GET", "search/code", "-f", `q=${query}`, "-f", `per_page=${limit}`,
    ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
    const existing = readStore(store);
    const ids = new Set(existing.map((lead) => lead.id));
    const rawCandidates = candidatesFromGitHubSearch(payload).filter((lead) => !ids.has(lead.id));
    const candidates = [];
    let hydrationFailures = 0;
    for (const candidate of rawCandidates) {
      try {
        const repository = JSON.parse(execFileSync("gh", ["api", `repos/${candidate.project}`], {
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
        }));
        const hydrated = hydrateGitHubCandidate(candidate, repository);
        if (hydrated) candidates.push(hydrated);
      } catch {
        hydrationFailures += 1;
        candidates.push(candidate);
      }
    }
    writeStore(store, [...existing, ...candidates]);
    process.stdout.write(JSON.stringify({
      discovered: candidates.length,
      hydration_failures: hydrationFailures,
      total: existing.length + candidates.length,
      store,
    }, null, 2) + "\n");
    return 0;
  }
  const leads = readStore(store);
  if (command === "validate") {
    process.stdout.write(JSON.stringify({ valid: true, leads: leads.length, store }, null, 2) + "\n");
    return 0;
  }
  if (command === "queue") {
    printQueue(buildQueue(leads, option(args, "--date", day())));
    return 0;
  }
  if (command === "review") {
    const limit = Number(option(args, "--limit", "10"));
    process.stdout.write(`${JSON.stringify(researchReview(leads, limit), null, 2)}\n`);
    return 0;
  }
  const id = args[0];
  if (command === "qualify") {
    const next = replaceLead(leads, id, (lead) => qualifyLead(lead, {
      observed_signal: option(args, "--signal", lead.observed_signal),
      problem_hypothesis: option(args, "--problem", ""),
      segment: option(args, "--segment", lead.segment),
      proof_id: option(args, "--proof", lead.proof_id),
      contact_name: option(args, "--name", ""),
      contact_channel: option(args, "--channel", ""),
      contact_destination: option(args, "--destination", ""),
      contact_permission: option(args, "--permission", ""),
    }, option(args, "--date", day())));
    writeStore(store, next);
    process.stdout.write(`${id}: qualified\n`);
    return 0;
  }
  if (command === "approve") {
    const next = replaceLead(leads, id, (lead) => approveLead(lead, option(args, "--date", day())));
    writeStore(store, next);
    process.stdout.write(`${id}: approved\n`);
    return 0;
  }
  if (command === "draft") {
    const lead = leads.find((candidate) => candidate.id === id);
    if (!lead) throw new Error(`unknown lead: ${id ?? "(missing)"}`);
    process.stdout.write(`${draftForLead(lead, { followUp: args.includes("--follow-up") })}\n`);
    return 0;
  }
  if (command === "record") {
    const status = option(args, "--status", "");
    const next = replaceLead(leads, id, (lead) => recordLeadStage(lead, status, {
      date: option(args, "--date", day()),
      note: option(args, "--note", ""),
    }));
    writeStore(store, next);
    process.stdout.write(`${id}: ${status}\n`);
    return 0;
  }
  if (command === "record-follow-up") {
    const next = replaceLead(leads, id, (lead) => recordFollowUp(lead, option(args, "--date", day())));
    writeStore(store, next);
    process.stdout.write(`${id}: follow-up recorded\n`);
    return 0;
  }
  if (command === "report") {
    process.stdout.write(JSON.stringify(outreachReport(leads), null, 2) + "\n");
    return 0;
  }
  throw new Error(`unknown command: ${command}\n\n${usage()}`);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`outreach: ${error.message}\n`);
    process.exitCode = 1;
  }
}
