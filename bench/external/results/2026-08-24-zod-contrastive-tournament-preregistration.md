# Zod contrastive-tournament preregistration — 2026-08-24

## Question

After a contrastive probe has ruled out the known over-broad fixes, does forcing
two materially different architectural hypotheses and an observed discriminator
improve source accuracy?

## Frozen arms

- `U`: task-relative episode + one contrastive executable probe compiled into
  a before-edit red receipt and an after-edit green receipt.
- `T`: the identical episode and contrastive probe + one before-edit hypothesis
  tournament receipt.

The tournament requires a structured decision artifact containing exactly two
candidates with different ownership claims and source surfaces, one falsifier
per candidate, an actually run discriminator command and result, a chosen
candidate, supporting evidence, and a reason to reject the loser. A product edit
is gated until both the red probe baseline and tournament receipt exist, with the
same bounded two-denial fail-open policy as the existing pipeline.

After choosing a hypothesis, T also requires a bounded contract-closure audit:
the nearest analogous specialization, concrete runtime/static/public-API/
downstream contract surfaces, a check for each, and the most likely non-local
regression. If the chosen behavior differs from a generic abstraction, the audit
must use repository evidence to decide whether that difference belongs in a
subtype, constructor, export, trait, or local metadata.

The contrastive probes are frozen before any model run:

- `zod-5917`: inner-optional preprocess must become optional, while the
  equivalent generic `pipe(transform, optional)` remains required, required
  preprocess remains required, and preprocess remains a `ZodPipe`.
- `zod-5937`: the reported preprocess+catch case and a plain catch field must
  materialize fallbacks, while an outer optional wrapper still omits an absent
  caught value and an ordinary string remains required.

Unlike Q-lite, neither arm requires whole pre-fix test suites to retain all old
expectations. Each probe must be checked against authentic pre-fix and authentic
fix source before the first agent run. The authentic fix is never exposed to an
agent.

## Fixed execution

- Tasks: `zod-5917` and `zod-5937`.
- Model: `claude-sonnet-5`.
- Repeats: 3 per task and arm.
- Turn budget: 50 requested turns.
- Mode: `--no-repro`; future regression-test contents exist only in the scorer.
- Network and web tools denied; history sealed at each task's pre-fix commit.
- Probe and tournament-validator artifacts are snapshotted and must remain
  untouched.

## Outcomes and decision rule

Primary outcome is sealed issue-contract accuracy: independently authored hidden
tests for runtime variants, static contracts, public structural compatibility,
and downstream behavior. The merged PR's own tests remain a secondary exact-PR
score. Protocol resolution, ready tournament artifacts, turns, reminders, and
changed-source breadth are secondary.

Call T a promising improvement only if it has higher total issue-contract accuracy than
U and is not worse on either task cluster. A task swap is mixed. An issue-contract-score
tie is not a tournament win, even if its artifacts are cleaner. Any prescribed
probe that fails to show the frozen red result on authentic pre-fix source or the
frozen green result on authentic fix source invalidates the experiment before
model execution.

With two related task clusters and three repeats, even a positive result is a
pilot signal, not a general accuracy claim.

## Pre-comparison amendment

One excluded instrument-development smoke run (`zod-5917`, T) completed before
the repeated comparison and is recorded at
`2026-08-24T17-51-59-463Z-p45781.json`. It resolved the original tournament and
selected the correct specialized ownership surface, but implemented only the
runtime metadata override. Hidden scoring showed that a complete change also
crossed static-type, public-identity/export, and downstream serialization
contracts. The contrastive probes, tasks, model, repeats, outcome, and decision
rule remain unchanged. The contract-closure audit above was added before any U
versus T comparison run; the excluded smoke is not part of the result.

A second excluded T smoke with the closure audit is recorded at
`2026-08-24T18-01-30-733Z-p49969.json`. It repaired runtime behavior, static
directional metadata, generic negative controls, and input JSON Schema, yet the
upstream scorer still failed because the merged PR mandates a new named
`ZodPreprocess` subtype and also contains an unrelated codec JSON-Schema fix.
Therefore exact-PR tests are not a valid sole measure of issue correctness for
`zod-5917`. Before the first comparative run, the primary outcome was corrected
to sealed issue-contract tests that accept alternative implementations meeting
the observable contract; upstream test acceptance is retained and reported,
not discarded. Both issue-contract suites must fail on pre-fix and pass on the
authentic fix before comparison.
