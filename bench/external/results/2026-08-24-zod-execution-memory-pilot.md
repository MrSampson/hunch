# Zod execution-memory pilot — 2026-08-24

## Verdict

Proven execution episodes are **useful context but not, by themselves, a
reliable accuracy mechanism**. On the two difficult tasks with three-repeat
rolling episodes, the episode arm passed 2/6 runs versus 1/6 for both the
baseline and existing Hunch arms. The only apparent gain was one pass on
`zod-5937`; it reproduced under both episode policies, but only once in three
runs under each policy. This sample is too small and inconsistent to establish
an accuracy improvement.

The episodes also worked on a feature task, so the idea is not limited to bug
repair. That feature was already easy for the baseline, however, and therefore
does not demonstrate a gain.

## Hypothesis

An agent should solve a held-out task more accurately when it receives a
bounded episode of relevant work that was proven before the target fix. Each
episode contained:

- the earlier task and mechanism;
- immutable, reachable historical commits;
- implementation steps and file/symbol anchors;
- verification commands and expected evidence;
- applicability boundaries and failure modes.

Arm `E` received the issue plus the episode. It had no Hunch access, network
access, hidden tests, target fix, or future Git objects.

## Results

| task | kind | baseline A | Hunch C | fixed-cutoff E | rolling E | result |
|---|---|---:|---:|---:|---:|---|
| `zod-5625` | feature | 3/3 | 3/3 | 1/1 | — | Episode solved it, but no room to improve accuracy. |
| `zod-5917` | bug | 1/3 | 1/3 | 0/1 | 1/3 | Rolling episode exactly matched baseline. |
| `zod-5937` | bug | 0/3 | 0/3 | 1/3 | 1/3 | Small positive signal, not reproducible within either policy. |

For the directly comparable rolling runs on the two hard tasks:

- baseline A: 1/6
- current Hunch C: 1/6
- execution episode E: 2/6
- every rolling hard-task run used all 51 available turns;
- all six rolling runs left existing upstream tests untouched.

These are independent stochastic sessions, not enough observations for a
credible significance claim. The fixed and rolling policies are reported
separately rather than pooled as if they were one preregistered experiment.

## What the successful runs show

`zod-5937` is the strongest evidence for the idea. One fixed-cutoff run and one
rolling run each produced a source-only patch that passed all 224 hidden tests.
The successful fixed run also passed the agent's full visible Zod suite (3,807
tests). Its implementation was not a copy of the future gold patch, which is
evidence of genuine behavioral problem-solving rather than target-fix leakage.

`zod-5625` demonstrates breadth beyond bugs. The episode-guided agent added the
codec feature in the classic and mini APIs, passed the hidden scorer, and did
not edit tests.

## Why it was not reliable

The episode improved the direction of investigation, but it did not control the
execution loop. On `zod-5937`, all rolling agents inspected the listed historical
evidence, yet two still stopped with narrow failures in static types, partial
semantics, or exact-optional-property handling. On `zod-5917`, none of the three
rolling agents opened both listed immutable commits; two submitted incomplete
implementations and one made no source change. Their hidden failures crossed
runtime behavior, public types, structural compatibility, and JSON Schema.

In plain terms: remembering a good past solution can point the model toward the
right neighborhood, but it does not make the model reliably finish every part
of the job.

## Validity safeguards

- Agent repositories ended at each task's authentic pre-fix commit.
- Target fixes and future Git objects were absent from the agent checkout.
- Episode provenance commits had to exist, be reachable from the sealed
  checkout, and satisfy the configured cutoff policy.
- An initial fixture containing non-ancestor commits was rejected before any
  model call, confirming that the provenance guard fails closed.
- Network and Claude web tools were denied.
- Hidden future tests ran only in a separate clean scorer checkout.
- Existing upstream test-file integrity was checked before scoring.

The fixed fixture used the global `2026-01-08` cutoff. The rolling fixture used
only authentic ancestors available before each individual target fix; it tested
whether fresher but still legitimate experience changed the outcome.

## Product implication

Do not make the next version merely a larger memory dump. The next falsifiable
experiment should combine the episode with an **episode-guided verification
controller**:

1. Convert the episode into an explicit checklist of required invariants.
2. Require the agent to inspect the bounded evidence or record why it is
   inapplicable.
3. Track runtime, static-type, serialization, and compatibility checks as
   separate obligations.
4. Prevent completion while a required obligation is untested or failing.
5. Store the commands, observations, failed attempts, and final proof as the new
   episode—not only a prose summary.

The accuracy hypothesis for that mechanism should be tested on more hard tasks
with repeated, paired runs. A useful success criterion is a positive exact
win/loss difference without more test tampering, timeouts, or infrastructure
failures.

## Raw runs

Fixed-cutoff episodes:

- `2026-08-24T10-58-11-133Z-p24169.json` — `zod-5625`, pass
- `2026-08-24T10-58-11-130Z-p24171.json` — `zod-5917`, fail
- `2026-08-24T10-58-11-130Z-p24170.json` — `zod-5937`, pass
- `2026-08-24T11-12-23-532Z-p32207.json` — `zod-5937`, fail
- `2026-08-24T11-12-23-532Z-p32208.json` — `zod-5937`, fail

Rolling episodes:

- `2026-08-24T11-23-21-255Z-p37851.json` — `zod-5937`, pass
- `2026-08-24T11-23-21-254Z-p37853.json` — `zod-5937`, fail
- `2026-08-24T11-23-21-258Z-p37852.json` — `zod-5937`, fail
- `2026-08-24T11-32-40-121Z-p44302.json` — `zod-5917`, pass
- `2026-08-24T11-32-40-121Z-p44303.json` — `zod-5917`, fail
- `2026-08-24T11-32-40-121Z-p44304.json` — `zod-5917`, fail
