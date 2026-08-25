# Zod execution-controller pilot — 2026-08-24

## Verdict

The Execution Controller is a **promising accuracy amplifier when the retrieved
episode contains the missing mechanism**, but it is not an independent general
reasoner. Across two hard tasks it scored 3/6, versus 2/6 for the same rolling
episodes without the controller and 1/6 for both baseline and current Hunch.
The gain was concentrated entirely in one task:

| task | baseline A | Hunch C | rolling episode E | episode + controller X |
|---|---:|---:|---:|---:|
| `zod-5917` | 1/3 | 1/3 | 1/3 | 0/3 |
| `zod-5937` | 0/3 | 0/3 | 1/3 | 3/3 |
| **total** | **1/6** | **1/6** | **2/6** | **3/6** |

The stricter controller-protocol score additionally requires no pending
obligation at termination: `zod-5937` was 2/3, `zod-5917` was 0/3, and the total
was 2/6. Source accuracy remains the primary benchmark outcome; the stricter
score makes the max-turn completion bypass visible instead of silently treating
it as compliant.

This is a six-run pilot over only two task clusters. It is evidence to continue,
not a statistically credible claim of a general accuracy improvement.

## Mechanism tested

Arm `X` received the same task-relative, provenance-checked work episode as arm
`E`, plus a controller plan of observable obligations. Obligations were grouped
as evidence inspection, runtime behavior, static types, serialization, and
compatibility. A session-wide obligation survives edits; an after-edit
obligation resets whenever product code changes again. One generic test command
cannot satisfy an unrelated specific obligation.

The production implementation also converts delivered decision hypotheses into
machine-readable obligations. `hunch_context` arms those obligations in the MCP
session automatically, and the existing firm/strict Stop hook reports unresolved
obligations alongside the normal post-edit verification gate.

## What worked

All three `zod-5937` controller runs produced source-only fixes that passed all
224 hidden checks while leaving existing upstream tests untouched. The three
agents independently converged on the same two directional ideas:

- catch must advertise optional input so a missing key reaches its fallback;
- an outer optional wrapper must still short-circuit explicit `undefined`
  instead of materializing the nested catch fallback.

The episode contained the necessary recent precedents: specialized preprocess
directionality (`02c2baf7`), object optionality (`b6066b3e`), and catch fallback
input behavior (`36fe14e1`). The controller made all three agents inspect those
commits and decomposed validation into the dimensions that episode-only runs had
missed. Two runs ended with all 7/7 obligations satisfied. The third ran the
relevant suites but then created a root-level repro file; because that counted
as another product edit, its four after-edit receipts correctly reset before the
turn budget ended. Its source patch still passed the hidden scorer.

## What did not work

`zod-5917` scored 0/3. Two runs remained broadly incomplete. The strongest run
reached 205/206 hidden tests and had no type errors, but failed one input JSON
Schema snapshot because output-side codec metadata still leaked into the input
schema.

That failure exposes two limits:

1. **Memory depth caps the controller.** This held-out task required inventing
   the specialized preprocess abstraction that `zod-5937` could later reuse as
   an authentic ancestor. The earlier `zod-5917` episode did not contain that
   solution, and a checklist cannot manufacture a missing design.
2. **Running a test file is weaker than proving an invariant.** The near-pass ran
   the required JSON Schema suite, so its broad command-shaped obligation was
   satisfied, but the visible suite did not exercise the exact metadata-flow
   invariant. Future obligations need an executable assertion plus expected
   outcome—not merely a command name.

All six controller sessions exhausted the 51-turn benchmark budget. Claude's
budget termination did not emit the ordinary Stop lifecycle event, so the Stop
gate issued 0 blocks. The benchmark therefore measured guaranteed obligation
delivery, tracking, and agent uptake, but not the final completion refusal. Unit
and live cross-process smoke tests separately proved that the Stop verdict and
state transitions work. A future benchmark must make budget termination route
through the same completion verdict or classify it as an unresolved completion.

## Validity

- Authentic Git ancestry ended at each task's pre-fix commit.
- Target fixes and all future Git objects were absent from agent checkouts.
- Every episode commit was reachable in the sealed checkout and preceded the
  target fix.
- Network and Claude web tools were denied.
- Hidden future tests ran only after generation in a separate clean checkout.
- Existing upstream test integrity was checked before hidden tests were copied.
- All six controller attempts left existing upstream tests untouched.
- The controller and episode-only runs used the same model and 51-turn budget.

## Product conclusion

Keep the controller, but describe it accurately: it is a **thinking discipline
and verification amplifier**, not the source of the underlying insight.

The next controller iteration should:

1. store executable assertions and expected outputs in an episode;
2. record command exit status/output evidence, not only that a command ran;
3. generate task-specific probes for each invariant before accepting a broad
   suite as proof;
4. distinguish disposable repro artifacts from shipping product edits;
5. treat turn-budget exhaustion with pending obligations as an unresolved
   completion rather than bypassing the Stop gate;
6. expand to more task clusters before claiming a general accuracy lift.

## Raw controller runs

`zod-5937` — 3/3:

- `2026-08-24T11-51-50-419Z-p64604.json`
- `2026-08-24T11-51-50-422Z-p64603.json`
- `2026-08-24T11-51-50-424Z-p64602.json`

`zod-5917` — 0/3:

- `2026-08-24T12-02-47-738Z-p73133.json`
- `2026-08-24T12-02-47-738Z-p73134.json`
- `2026-08-24T12-02-47-738Z-p73132.json`

## Outcome-aware follow-up

The next controller revision made the command/result distinction executable:

- every obligation now has an explicit expected success/failure result;
- obligations may require and forbid bounded output markers;
- Claude's successful `PostToolUse` and failed `PostToolUseFailure` events are
  normalized separately;
- a matching command with an unknown, failed, or output-mismatched result stays
  pending, with only the bounded mismatch receipt persisted;
- max-turn termination with pending evidence is labeled
  `exhausted-unresolved` in the benchmark artifact.

The hard `zod-5917` case was repeated three times with the same task-relative
episode, model, sealed pre-fix ancestry, hidden scorer, and 51-turn budget. It
scored **2/3 source-accuracy passes**, versus **0/3** in the earlier
command-occurrence controller pilot:

| repeat | hidden source score | observed expectations | completion status |
|---|---:|---:|---|
| 1 | PASS — 206/206 | 5/6 | exhausted-unresolved |
| 2 | PASS — 206/206 | 2/6 | exhausted-unresolved |
| 3 | FAIL — no source edit | 2/6 | exhausted-unresolved |

The two passing agents changed only the three source surfaces required by the
held-out regression: classic schema construction, core schema semantics, and
input JSON Schema processing. Existing tests remained untouched. The strict
protocol score was still **0/3**, because every run reached the turn cap with at
least one expected result unproved.

This is a better result, not a general claim. Three stochastic repeats cannot
separate controller lift from trajectory variance. The strongest justified
conclusion is narrower: outcome-aware receipts are more truthful, and this
iteration coincided with a 0/3 → 2/3 recovery on the previously failing task.
The dominant remaining defect is now scheduling: obligations are delivered and
tracked, but the agent can spend the whole budget investigating without
reserving time to execute them. The next test should add a mid-flight proof
milestone (or reserved verification budget) plus one synthesized, task-specific
probe, then preregister another multi-task comparison.

Raw follow-up runs:

- repeat 1: `2026-08-24T12-41-34-881Z-p19485.json`
- repeats 2–3: `2026-08-24T12-48-57-319Z-p22857.json`

## Mid-flight scheduler follow-up

A bounded PostToolUse scheduler was then added so proof work does not depend on
the ordinary Stop event. It reminds after the first product edit, after a later
edit invalidates a receipt, after a result mismatch, and every six relevant
post-edit activities while obligations remain pending. The same sealed
`zod-5917` setup produced:

| repeat | hidden source score | observed expectations | reminders | completion status |
|---|---:|---:|---:|---|
| 1 | PASS — 206/206 | 6/6 | 4 | resolved |
| 2 | FAIL — incomplete implementation | 2/6 | 1 | exhausted-unresolved |
| 3 | FAIL — no source edit | 2/6 | 0 | exhausted-unresolved |

This is **1/3 source accuracy and 1/3 strict protocol accuracy**. It proves that
mid-flight result tracking can complete the protocol in a real run, but it does
not establish an accuracy improvement: source accuracy was lower than the
previous 2/3 batch, and the no-edit trajectory is outside an after-edit
scheduler's reach.

Raw run: `2026-08-24T13-23-28-963Z-p64587.json`.

### Rejected pre-edit reminder experiment

The zero-reminder trajectory motivated a second, isolated experiment: inject a
stall checkpoint after every 12 tracked actions without a product edit. This
did not help. All three fresh runs failed the hidden scorer, satisfied only the
same two historical-inspection obligations, never attempted any of the four
after-edit validations, and ended after three reminders each. Their tracked
activity counts were 31, 38, and 39; only one run made even one source edit.

That experiment scored **0/3 source accuracy and 0/3 strict protocol accuracy**.
The pre-edit stall behavior was removed rather than shipped. This negative
result is evidence against solving the remaining problem by making reminders
earlier or louder.

Raw run: `2026-08-24T13-46-02-991Z-p75095.json`.

The next mechanism should reduce the reasoning search space instead of adding
more nudges: synthesize a small executable probe for the claimed invariant (with
an expected result), or test a narrowly scoped phase gate only after prerequisite
evidence is satisfied. Either change needs a preregistered multi-task comparison;
the current data does not justify a general accuracy claim.
