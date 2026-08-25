# Zod Q-lite preregistration — 2026-08-24

## Question

Does replacing the full execution checklist with one adjacent-regression
contract preserve red-to-green discipline while improving source accuracy,
completion, and efficiency?

## Frozen comparison

- `Q`: task-relative episode + full 6–7 item controller + one executable probe
  compiled into baseline and validation receipts (8–9 total obligations).
- `R` / Q-lite: the same episode and probe + exactly one after-edit adjacent
  regression command (3 total obligations).
- Tasks: `zod-5917` and `zod-5937`.
- Model: `claude-sonnet-5`.
- Repeats: 3 per task and arm.
- Turn budget: 50 requested turns (the Claude receipt may report 51 at budget
  exhaustion).
- Diagnosis mode: `--no-repro`; future fix-test contents are absent from the
  agent checkout and are installed only in the separate scorer after generation.
- Network and web tools: denied.
- Authentic history: sealed at each task's pre-fix commit.

The Q-lite regression commands are fixed before any run:

- `zod-5917`: existing optional, partial-object, and input JSON Schema suites.
- `zod-5937`: existing partial-object, optional, and input JSON Schema suites.

Each is one synchronous Vitest command and one outcome-aware after-edit receipt.

## Outcomes and decision rule

Primary outcome: hidden source accuracy, requiring the scorer tests to pass and
the materialized probe artifact to remain untouched.

Secondary outcomes, in order: complete three-receipt protocol, task-cluster
consistency, median turns, and reminder count. Test-file edits remain a separate
integrity failure.

With only two task clusters and three repeats, no result will be described as a
general accuracy claim. Retain Q-lite as the preferred experimental arm only if
it does not lower total source accuracy versus Q and either improves protocol
completion or reduces turns/reminders. A task swap with equal totals is mixed,
not a win. If Q-lite loses source accuracy, reject the compression. If accuracy
ties without an efficiency/protocol benefit, call it inconclusive.

Instrument failures are excluded only for a predeclared reason: unavailable
model/authentication, sandbox infrastructure failure, dependency-installation
failure, or a prescribed command that cannot execute in the sealed environment.
Ordinary agent mistakes and turn exhaustion remain valid failures.
