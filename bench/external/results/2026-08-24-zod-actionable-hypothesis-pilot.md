# Zod actionable-hypothesis pilot — 2026-08-24

## Verdict

Bounded, falsifiable hypothesis packets made Hunch's output more precise and
safer to inspect, but this pilot did **not** improve task accuracy. The feature
is useful delivery infrastructure, not yet evidence of an accuracy win.

## Prior broad result

The sealed 26-task, three-repeat benchmark produced identical accuracy:

- Baseline (A): 70/78
- Hunch (C): 70/78
- Exact paired wins/losses: 0/0
- Hunch abstained on 44/78 treatment runs

See `2026-08-24-zod-abstention-3x.md` for the full analysis.

## Actionable-packet pilot

| version | task | arm | score | Hunch calls | delivered hypotheses | duration | observation |
|---|---|---:|---:|---:|---:|---:|---|
| v1 | zod-5229 | A | 0/1 | 0 | 0 | 609s | Baseline exhausted 51 turns. |
| v1 | zod-5229 | C | 0/1 | 1 | 2 | 482s | One relevant and one unrelated hypothesis; the attempted fix was incomplete. |
| v1 | zod-5917 | A | 0/1 | 0 | 0 | 271s | Baseline exhausted 51 turns. |
| v1 | zod-5917 | C | 0/1 | 1 | 0 | 250s | Hunch correctly abstained; no score change. |
| v2 | zod-5229 | C | 0/1 | 1 | 1 | 542s | Retrieved the exact earlier tuple record, but the agent did not inspect its supplied historical diff and generalized too broadly. |

Raw runs:

- `2026-08-24T09-52-31-686Z-p56110.json`
- `2026-08-24T09-52-31-686Z-p56111.json`
- `2026-08-24T10-18-34-175Z-p77041.json`

## What happened in v2

For `zod-5229`, Hunch delivered one focused hypothesis:

- Record: `dec_2da813046e`
- Historical case: all-optional tuple handling around `optStart`
- Attached commit: `e120a487`
- Supplied verification: inspect the exact historical commit and its two
  relevant files before editing

The agent used the tuple clue but never ran the supplied `git show` command. It
then widened the implementation into object optionality behavior. Hidden scoring
reported four regressions across optional, catch, and partial tests. The true
future fix was substantially deeper than the old record: it aligned tuple and
object optionality, distinguished input/output optionality, handled defaults,
dense tuple output, async parsing, and several edge cases.

The important distinction is:

- Retrieval precision improved: the unrelated record disappeared.
- Action uptake did not improve: the agent ignored the evidence-inspection step.
- Memory depth was insufficient: the stored decision summarized a nearby old
  edge case, not the complete failure-to-fix trajectory required for this bug.

## Next accuracy experiment

The next feature should store an executable repair episode, not only an ADR-like
decision summary. A repair episode should contain:

1. Minimal reproduction and exact failing assertions.
2. Observed mechanism/root cause, with file and symbol anchors.
3. The bounded fix diff or immutable fix-commit excerpt.
4. Proving tests, including regressions that reject over-broad fixes.
5. A disproof condition and applicability boundary.

Retrieval should inject the bounded evidence directly (or expose it through a
single structured tool call), rather than merely telling the coding agent to run
another command. Then rerun a preregistered paired benchmark on tasks with a
pre-existing analogous repair episode. The success threshold should be a
positive exact paired win/loss difference with no increase in test tampering or
infrastructure failures.
