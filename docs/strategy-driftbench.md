<!-- hunch:topic strategy.driftbench -->
# Strategy — DriftBench: own the category's measuring stick

**Dated 2026-08-09. Status: proposed (no build started). Decision owner: Dave.
Grounded in [docs/competitive-landscape.md](./competitive-landscape.md), snapshot 2026-08-09.**

## The decision

Build and publish **DriftBench**: a reproducible, public benchmark that measures
how much architectural damage AI coding agents cause, and how much each
memory/governance setup actually prevents. Rigged scenario repos with seeded
invariants; realistic "optimize / clean up" agent tasks that tempt violations;
agents run under multiple conditions (bare, AGENTS.md, memory-recall layer,
Hunch); scoring = violations shipped vs violations prevented, deterministic,
with full transcripts. Harness, tasks, and leaderboard all public; anyone can
re-run it. The protocol is preregistered through Hunch's own experiment
machinery before first publication.

Companion product payoff: the benchmark's seeded invariants become **starter
invariant packs** (`hunch init --pack <stack>`), distributed as plain git repos,
community-PR-able, provenance preserved — attacking the cold-start adoption
problem with the same artifact.

## Why this is the edge

1. **It weaponizes the one unfair asset.** Hunch is the only player in the
   category with preregistered experiments, hash-bound treatments, and
   comprehension-qualified reviewers already in the product (EXP-03 line). A
   benchmark from Hunch ships with methodology; competitor numbers are vendor
   claims (see the landscape doc's Memco/Spark entry).
2. **Whoever defines the benchmark defines the category.** There is no accepted
   measure for "does memory/governance prevent AI architectural damage" — the
   exact frontier the landscape doc identifies. The axis DriftBench defines
   (prevented violations, with receipts) is the axis Hunch is built to win.
3. **Competitors are structurally blocked.** Platform vendors can't publish a
   benchmark that indicts their own built-in memories; recall-only products
   fail it by design; assurance CLIs publishing one reads as marketing, while
   Hunch publishing one reads as method — the credibility asymmetry was earned
   in public (preregistrations, refuted claims recorded as findings).
4. **Every run is content.** Measured pain replaces narrated pain across the
   blog, video, and social surfaces.
5. **It feeds product, not just attention.** Scenario invariants → starter
   packs → a new repo has working invariants in minute one → community
   improvement loop that is git-native by construction.

## Rejected alternatives (on the record)

- **Race the assurance CLI category on evidence features** (more signing, more
  gates): rejected — that category's release velocity (3 majors/month observed)
  makes it their home turf; do table-stakes interop (SARIF — shipped
  2026-08-09) and no more.
- **Open interchange standard for engineering memory**: rejected *for now* —
  right instinct, wrong sequencing; standards need adoption gravity the
  benchmark is meant to create. Revisit after DriftBench has public traction.
- **Enterprise control-plane (SSO/RBAC/hosted)**: rejected — chases a funded
  SaaS competitor away from Hunch's cleanest differentiation (git-native,
  self-hosted, human-gated authority).

## Scope of a credible v1

- 8–10 scenarios across 2–3 stacks (the `video/demo/` orders rig is the
  prototype: service layers, auth paths, seeded `not-calls` invariants).
- 3–4 conditions per scenario: bare agent · AGENTS.md · recall-only memory ·
  Hunch (advisory and strict).
- Runner: headless agent sessions per cell; scoring from `hunch conform
  --strict` exit codes + diff inspection — deterministic, no judge model in the
  scoring path.
- Outputs: per-cell transcripts, a scored table, a results page; protocol
  preregistered before the first published run.
- Estimated effort: weeks, not months.

## Success criteria (decide continuation against these)

- The launch report is reproducible by a third party from the public harness.
- At least one external party runs or cites it within a quarter.
- `hunch init --pack <stack>` exists and a new repo gets enforceable
  invariants on day one.
- Competitor marketing starts responding to the axis (prevented violations),
  not the old one (recall quality).

## First moves

1. Scaffold the harness: scenario format, runner, deterministic scorer, two
   scenarios ported from `video/demo/`.
2. Preregister the v1 protocol through the constitution experiment tooling.
3. Draft the launch post alongside the build (the zod-benchmark post is the
   voice model).

*Review this memo when the landscape doc's next snapshot lands, or immediately
if a credible public benchmark for AI architectural damage appears first.*
