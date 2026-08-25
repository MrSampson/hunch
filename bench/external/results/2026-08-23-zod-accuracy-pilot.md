# Zod time-split accuracy pilot — 2026-08-23

## Result

On four held-out upstream Zod bugs, the bare model passed 2/4 and the
Hunch-assisted model passed 3/4. That is a +25 percentage-point observed lift,
but the sample is much too small to establish a reliable product effect.

| held-out bug | bare model | Hunch | Hunch calls | paired result |
|---|---:|---:|---:|---|
| zod-5842 — `.merge()` drops `.refine()` | fail | fail | 6 | tie-fail |
| zod-5944 — incomplete IPv6 CIDR pattern | pass | pass | 1 | tie-pass |
| zod-5937 — `preprocess + catch` regression | fail | pass | 3 | Hunch win |
| zod-5826 — `.default()` shallow-copies | pass | pass | 1 | tie-pass |
| **Total** | **2/4 (50%)** | **3/4 (75%)** | **11** | **1 win, 0 losses, 3 ties** |

The 95% Wilson intervals are 15.0–85.0% for the bare arm and 30.1–95.4%
for the Hunch arm. With only one discordant pair, a two-sided exact McNemar
test is p=1.0. This is a promising pilot result, not a claim of accuracy lift.

## Method

- Repository: the official `colinhacks/zod` Git history, cloned at
  `e516c3baf22615e20934116abebfed6c000222c2`.
- Memory cutoff: 2026-01-08. The actual last code commit in the frozen checkout
  was `0cdc0b8597999fd9ca99767b912c1e82c1ff2d6c` (Zod 4.3.5, 2026-01-04).
- Cold memory: Hunch considered 40 pre-cutoff commits and seeded 37 decisions
  (26 synthesized through Claude CLI and 11 deterministic/heuristic).
  The snapshot is preserved locally in the Zod clone as branch
  `hunch-bench/cutoff-2026-01-08` at `8bf4e3900143486f2f3686e27e704ca769e82759`;
  its parent is the frozen Zod code commit above.
- Model: `claude-sonnet-5`, Claude Code 2.1.186, maximum 40 turns.
- Diagnosis mode: neither arm received the future regression tests. Both arms
  received the same issue report and buggy pre-fix checkout.
- Treatment: the C arm received only the frozen pre-cutoff `.hunch` graph,
  Hunch MCP, and Hunch project instructions. For the four scored pairs, the
  prompt explicitly required the C arm to call `hunch_context`; this isolates
  memory quality from ambient tool adoption.
- Score: after the agent finished, the harness applied the real merged fix's
  test files. A run passed only if those tests passed and the agent had not
  modified them.
- Preflight: every included task was independently verified to fail on the
  pre-fix source and pass after applying the real source fix.

## What happened

### Positive case: zod-5937

The bare arm exhausted its turn budget after creating scratch reproductions
without editing production source. The Hunch arm retrieved the pre-cutoff
optional/nonoptional decision and relevant graph symbols, then made the same
five logical source changes as the later upstream fix: mark `$ZodCatch` input
as optional, preserve the original optional input, track when catch substituted
a value, and honor that flag in optional handling. Zod's hidden tests passed.

This is strong case-level evidence that pre-existing engineering context can
turn a failed diagnosis into a correct patch. It does not establish causality
by itself because the model may also have discovered the fix independently.

### Negative-transfer case: zod-5842

Hunch retrieved a valid earlier decision allowing `extend()` on refined objects
when keys do not overlap. The assisted model generalized that rule to
`merge()`, preserving receiver checks when it judged them safe. The later Zod
fix deliberately used a different asymmetric rule: always reject refinements
on the receiver, but preserve checks from the second schema. The hidden test
therefore failed.

This is the clearest product signal in the pilot: retrieval relevance is not
enough. Hunch needs to communicate a decision's applicability boundary and
make analogy-vs-authority uncertainty explicit, or an old correct rule can
produce a new incorrect fix.

### Ambient adoption failure

Before forcing treatment uptake, one C-arm pilot exposed Hunch but made zero
Hunch calls. It failed, as did the control. The generated project instructions
also still said “0 decisions” after backfill until `hunch init` was rerun, even
though the graph contained 37 decisions. Ambient adoption and instruction
refresh must be measured separately from memory quality.

## Recommended next development

Build an eval-driven **memory applicability gate**, not another capture surface:

1. Attach explicit applicability and non-applicability boundaries to retrieved
   decisions, including the operation and invariants that make an analogy safe.
2. Before the agent relies on a historical decision, require a short check that
   the current operation preserves the same semantics; surface conflicts and
   asymmetric cases as uncertainty rather than authority.
3. Fix post-backfill instruction refresh and measure `hunch_context` uptake as
   a separate product metric.
4. Expand this time-split suite to at least 30 validated bugs across multiple
   repositories and use repeated paired runs before publishing an accuracy
   claim.

## Raw artifacts

- Unforced adoption pilot: `2026-08-23T04-35-00-549Z.json`
- Forced zod-5842 pair: `2026-08-23T04-41-49-024Z.json`
- Forced zod-5944 pair: `2026-08-23T04-51-05-815Z.json`
- Forced zod-5937 pair: `2026-08-23T04-51-11-081Z.json`
- Forced zod-5826 pair: `2026-08-23T04-51-16-734Z.json`
