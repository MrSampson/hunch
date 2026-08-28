# Zod executable-probe pilot — 2026-08-24

## Verdict

The executable-probe mechanism is operational, but this two-task pilot does not
establish a general accuracy improvement. With the final valid instrument, arm
`Q` solved 1/2 held-out issues:

| task | source score | probe baseline | probe after edit | controller | turns |
|---|---:|---:|---:|---:|---:|
| `zod-5917` — optional + preprocess | PASS — 206/206 | red observed | green observed | 8/8 resolved | 14 |
| `zod-5937` — preprocess + catch | FAIL — 221/224 | red observed | green observed | 5/9, unresolved | 51 |
| **total** | **1/2** | **2/2** | **2/2** | **1/2 resolved** | — |

The mechanism did what it claimed: it made both agents reproduce the reported
behavior before editing, prevented the first product edit until that receipt
existed, and required the same probe to turn green after editing. The probe
artifacts were unchanged in both scored checkouts.

The failed `zod-5937` run is the useful negative result. Its narrow probe turned
green, but the implementation changed optional-object semantics too broadly and
broke three neighboring scorer checks in `partial.test.ts`. A green reproduction
is therefore necessary evidence, not sufficient evidence of a correct fix.

This is one stochastic repeat over two related task clusters. It supports
keeping the mechanism available for experiments; it does not support advertising
an accuracy lift or enabling probe generation by default.

## Hypothesis and design

The preregistered mechanism was: replace a prose-only hunch with a bounded,
task-specific red-to-green probe containing an exact command and expected
markers. Compile that probe into two phase-aware obligations:

1. a `before-edit` baseline that must expose the failure;
2. an `after-edit` validation that must expose the intended changed behavior.

At firm or strict firmness, at most two product edits are denied while the
baseline receipt is absent; the gate then fails open to avoid deadlock. Receipts
are outcome-aware, latch when satisfied, and the validation receipt is reset by
a later product edit.

The benchmark used sealed pre-fix Zod ancestry and denied network and web tools.
This pilot was reproduction-assisted: the target fix's regression test files
were copied into the agent checkout, snapshotted for integrity, and copied again
into a separate clean scorer after generation. The probe contents themselves
were derived from the public issue reports rather than from those future tests
or target-fix patches. A later Q-lite comparison used `--no-repro` to measure the
stronger issue-only diagnosis setting.

## What worked

- Both final-run agents executed the prescribed baseline before editing.
- Both produced the expected red marker on the pre-fix source.
- Both later produced the expected green marker using the same command.
- The receipts survived harmless later command mismatches instead of being
  erased by the last matching attempt.
- `zod-5917`, previously 0/3 in the first controller pilot, reached a complete
  source-only fix in 14 turns with all eight obligations resolved.

## What did not work

`zod-5937` demonstrates probe overfitting. The reproduction checked the reported
`preprocess + catch` behavior, and the patch fixed that behavior, but the chosen
implementation also materialized catch fallbacks for missing and explicit
undefined object properties. The scorer reported three regressions while
221 other checks passed.

The full arm also carried the prior broad episode/controller checklist. The
failed run received eight reminders, reached the 51-turn cap, and left four
obligations unresolved. Adding a precise probe on top of a long checklist
improved falsifiability but did not reduce instruction load.

## Instrument corrections

Two exploratory runs were excluded from the efficacy verdict because their
probe transport was invalid:

1. `2026-08-24T14-38-29-963Z-p22922.json` embedded long inline commands. One
   agent rewrote the command into a temporary script whose relative import no
   longer resolved; the other never ran the probe.
2. `2026-08-24T14-54-58-139Z-p30009.json` materialized stable fixture files but
   invoked them through `npx tsx`. Claude's sandbox denied the IPC pipe opened by
   that CLI. Both agents independently found that Node with `--import tsx/esm`
   worked, revealing a second bug: a later invalid retry could overwrite an
   earlier valid receipt.

The final instrument uses a materialized `.hunch-probes/` artifact, invokes it
with `node --import tsx/esm`, and latches valid receipts. Manual checks against
authentic pre-fix and fix commits produced the expected red and green markers
for both issues before the sealed run began.

## Product decision

Keep the compiler, receipt semantics, phase gate, benchmark arm, and integrity
checks. They are bounded and inert unless explicit executable probes are
provided. Do not make the feature automatic or claim that it improves accuracy
from this sample.

The next optimization experiment should be **probe plus compact regression
contract**, not more reminders:

1. compare episode + full checklist + probe (`Q`) with episode + probe + one
   compact neighboring-regression command (`Q-lite`);
2. reserve the final verification step for that regression command after the
   probe turns green;
3. run at least three repeats across both tasks, then add unrelated repositories
   before making a product claim;
4. score source accuracy first, protocol completion second, turns/reminders
   third.

The intended test is whether reducing obligation load preserves the successful
red-to-green discipline while preventing narrow fixes that violate adjacent
behavior.

## Raw artifacts

- valid sealed pilot: `2026-08-24T15-15-59-037Z-p39255.json`
- invalid inline-command instrument: `2026-08-24T14-38-29-963Z-p22922.json`
- invalid `npx tsx` instrument: `2026-08-24T14-54-58-139Z-p30009.json`
