# Zod contrastive tournament experiment — 3× result

## Verdict

Reject the always-on hypothesis tournament. It did not improve sealed issue
accuracy and made protocol completion less reliable.

| task | U: contrastive probe | T: probe + tournament/closure |
|---|---:|---:|
| zod-5917 preprocess optionality | 0/3 | 0/3 |
| zod-5937 catch/optional interaction | 0/3 | 0/3 |
| total issue-contract accuracy | **0/6** | **0/6** |
| exact upstream-PR acceptance | 0/6 | 0/6 |
| resolved controller protocol | **3/6** | **0/6** |

This is a source-score tie and therefore not a T win under the preregistered
decision rule. It is a negative pilot, not evidence that tournaments never
help.

## Evaluator validity

Both immutable contrastive probes and both sealed issue-contract suites were
checked before comparison. Each showed the frozen red state on authentic
pre-fix source and green on the authentic fix. Probe/validator artifacts stayed
untouched in all twelve runs.

The primary evaluator is an independently authored issue contract covering
runtime variants, negative controls, static metadata, public structural
compatibility, and downstream behavior. Exact merged-PR tests remain a
secondary score. This correction matters for zod-5917 because the upstream
merge mandates a particular named subtype design and also bundles an unrelated
codec JSON-Schema fix; those tests alone reject behaviorally correct alternative
implementations.

Two instrument-development T smokes were excluded from the comparison:

- `2026-08-24T17-51-59-463Z-p45781.json`: correct ownership diagnosis and
  runtime fix, but incomplete static/public contract.
- `2026-08-24T18-01-30-733Z-p49969.json`: added contract-closure audit; runtime
  and downstream behavior improved, but the static contract still failed.

## What actually failed

### zod-5917

Five of six runs made the target runtime behavior green while preserving the
generic negative control. None made the corrected input-side optionality visible
in the static type contract. Four of six also had correct input JSON-Schema
behavior. The treatment therefore improved explanations more than implementations.

All three T runs wrote structurally ready tournament artifacts. Only repeat 2
ran its tournament validator before the first product edit. Repeats 1 and 3 ran
it after editing and were correctly denied retroactive credit. T repeat 2 then
used the remaining budget without producing a product edit.

### zod-5937

All six runs exhausted the 50-turn budget. U reached the red baseline in 3/3
but never re-proved green; T reached the baseline in 3/3 but never completed a
tournament receipt. Three runs made no product-source edit. The patches that did
exist either left plain catch fields required or specialized only the reported
preprocess chain, so runtime and JSON-Schema contracts stayed red.

## Cost and protocol

| metric | U | T |
|---|---:|---:|
| median turns | 48.5 | 51 |
| turn-cap runs | 3/6 | 5/6 |
| median controller reminders | 2.5 | 0 |
| ready tournament artifacts | n/a | 3/6 |

T's zero median reminders is diagnostic: the current cadence reminder starts
only after a product edit. On the catch task, T spent the entire budget in
pre-edit investigation, so the scheduler never warned it to close the tournament
and move on. On preprocess, two tournaments were completed only after editing,
when they were no longer valid evidence.

Wall time was noisy under three concurrent batches and is not used for the
decision. Raw turn counts and controller state are preserved in the JSON rows.

## Next optimization

Do not add more thinking content. Add an evidence-to-execution scheduler:

1. While no product edit exists, remind on a bounded activity cadence if a
   required before-edit receipt remains pending.
2. Name only the next narrow receipt, so the reminder drives convergence rather
   than expanding analysis.
3. Preserve the existing two-denial fail-open edit gate.
4. After implementation begins, keep the existing after-edit proof cadence.

This targets the observed failure directly: correct reasoning that arrives too
late or consumes the whole budget.

## Follow-up scheduler smoke

The pre-edit convergence reminder was implemented and then tested once on the
hard zod-5937 T case (`2026-08-24T19-01-14-912Z-p87993.json`). This smoke is not
part of the 3× comparison.

- Tournament receipt before editing: **yes** (old T catch runs: 0/3).
- Controller receipts satisfied: 2/3 (old T catch runs: 1/3 each).
- Reminders: 8 (old runs: 0 each).
- Hidden issue-contract assertions: 5/6 passed.
- Final accuracy: 0/1.

The agent correctly assigned ownership to `$ZodCatch`, made absent catch fields
work, and corrected input JSON-Schema requiredness. It missed the final
interaction: an outer `.optional()` must still omit an absent caught value,
which requires tracking whether catch substituted a fallback. The immutable
contrastive validation stayed red with `outer=false`, so the controller refused
completion correctly.

This is promising evidence that pre-edit cadence fixes receipt timing, but one
smoke is not an accuracy claim. The next experiment should add an explicit phase
budget/handoff after the tournament so enough turns remain to resolve a red
negative control; adding more analytical content is not indicated.

## Follow-up handoff and falsifier-pivot smokes

Two more single-run smokes used the same sealed zod-5937 T assignment. They are
instrument-development evidence, not part of the preregistered 3× comparison.

The explicit evidence-to-edit handoff
(`2026-08-24T19-34-10-919Z-p21708.json`) reproduced the scheduler result: 5/6
hidden assertions passed, but `catch().optional()` still materialized the catch
fallback for an absent key. The controller finished 2/3 receipts after eight
reminders and exhausted 51 turns. A handoff message alone did not improve
accuracy.

The first falsifier-pivot smoke
(`2026-08-24T19-43-43-078Z-p26281.json`) also failed, at 4/6 hidden assertions
after 51 turns. Transcript inspection established that the new intervention did
fire on the partial result:

- First edit: plain catch and the reported preprocess chain became green.
- Surviving control: `outer=true` regressed to `outer=false`.
- Controller response: named the partial improvement and forced a new ownership
  explanation instead of an unchanged rerun.
- Agent response: investigated the conflict, but treated pre-fix tests that pin
  catch-as-required behavior as an automatic veto, reverted the working edit,
  and exhausted the remaining budget before a replacement patch.

The authentic upstream fix confirms that the working catch edit had to remain:
it adds a separate `caught` payload flag so an outer optional wrapper can
short-circuit the fallback. The next controller variant therefore must name the
regressed control—not just the aggregate `state=green` marker—and require
conflicting evidence to be classified as an invariant or stale expectation
before reverting an observed improvement.

A first control-delta T rerun
(`2026-08-24T20-01-07-345Z-p32589.json`) did not expose the intervention. It
spent all 51 turns before implementation, satisfied only the contrast baseline,
never produced a tournament receipt, and made no source edit. Its 4/6 hidden
score is therefore the unchanged pre-fix result, not evidence for or against
the pivot wording. This is another observation in favor of the preregistered
decision to reject the always-on tournament. The next smoke isolates the pivot
under U, preserving the same sealed contrast without tournament overhead.

That isolated U smoke
(`2026-08-24T20-20-13-493Z-p39467.json`) produced the first full pass in this
optimization sequence:

| measure | result |
|---|---:|
| sealed issue-contract assertions | **6/6** |
| exact upstream-PR acceptance | **pass** |
| controller receipts | **2/2 resolved** |
| test/probe integrity | **untouched** |
| turns | 51 |
| wall time | 927 s |

The transcript provides a causal trace. The agent first restored catch input
optionality, producing `target=true plain=true outer=false`. The revised pivot
then named both the improvements and the exact regressed control
(`outer=true → outer=false`), told the agent to preserve the working behavior,
and warned that pre-fix tests were not an automatic veto. The agent kept the
catch fix, added a narrow outer-optional handling change, reran the immutable
probe, and obtained `state=green target=true plain=true outer=true
required=false`. The sealed scorer accepted this alternative implementation.

This is a positive single-run signal, not a replicated accuracy estimate. It
supports two product decisions: keep the contrastive U protocol as the default,
and keep the control-delta/conflict-aware pivot. It does not rescue always-on T.
Efficiency remains unresolved: the pass still exhausted 51 turns and spent
about fourteen minutes after the pivot. The next optimization should persist
pivot state and issue one bounded follow-up if no targeted edit occurs within a
small number of proof activities; further wording expansion is not indicated.

Hunch verification after the controller change: typecheck and build passed;
the focused pipeline/hook suite passed 33/33; the full repository suite passed
1,225 tests with 0 failures and 1 intentional skip.

## Pivot-deadline efficiency preregistration

The next matched zod-5937 U smoke adds one persisted controller state: after a
partially green validation, issue one follow-up if three further proof
activities occur without a product edit. The follow-up is issued at most once
per edit generation and resets on the next edit or completed proof.

The preceding control-delta U smoke is the reference: sealed pass, 2/2 receipts,
51 turns, 927 seconds. Before observing the new run:

- Accept a positive efficiency signal only if the sealed issue contract and
  exact upstream acceptance still pass, the controller resolves, artifacts stay
  untouched, and the run finishes in **45 turns or fewer**.
- A correct 46–51-turn result is inconclusive for efficiency.
- Any correctness or protocol regression rejects the deadline variant.
- Wall time is secondary because provider latency is noisy.

## Pivot-deadline result: rejected

The matched run (`2026-08-25T01-01-52-235Z-p11642.json`) failed the locked rule:
51 turns, 5/6 hidden assertions, upstream rejection, although the controller
resolved 2/2 receipts and the runtime contrast was green. The one missing
contract was input JSON Schema: the catch field remained required.

Transcript inspection confirmed exposure. The pivot fired at the partial
`target=true plain=true outer=false` result, and the one-time deadline fired
three proof activities later. The agent eventually replaced the metadata fix
with an object-parser-only catch special case. That made every runtime marker
green but could not inform the separate JSON-Schema consumer. The deadline
therefore accelerated pressure toward a locally green workaround without
protecting contract closure. The persisted deadline was removed.

## Contrast contract-closure preregistration

The next U smoke keeps the accepted control-aware pivot without the deadline
and closes the observed evaluator gap in the immutable contrast itself:

- `target=true` now requires both normal and jitless object parsing.
- `json=true` requires input JSON Schema to omit the catch field while retaining
  an ordinary required string.
- The expectation bound increases from six to eight markers, still below a
  fixed hard cap.

The revised probe was validated before the run: authentic pre-fix source is red
with `json=false`; the authentic fix is green with `json=true`. Accept only if
the sealed issue contract and exact upstream acceptance pass, both controller
receipts resolve, and the probe/test artifacts remain untouched. Turn count is
reported but is not the primary endpoint for this contract-completeness test.

## Contrast contract-closure result: keep

The matched run (`2026-08-25T01-14-23-383Z-p17093.json`) met every acceptance
condition:

| measure | result |
|---|---:|
| sealed issue-contract assertions | **6/6** |
| exact upstream-PR acceptance | **pass** |
| controller receipts | **2/2 resolved** |
| test/probe integrity | **untouched** |
| turns | 51 |
| wall time | 579 s |

The transcript again gives a useful causal trace. Seeing `json=false` in the
baseline caused the agent to inspect how the input required list consumes
`optin` before its first edit. Restoring catch metadata made
`target=true plain=true json=true` while the outer-optional control remained
red. The existing falsifier pivot explicitly named all three improvements and
the `outer=true → outer=false` regression. The agent preserved the metadata
fix, changed the outer-optional boundary, and finished with every marker green.

Keep the expanded contrast. It prevents the exact runtime-only workaround that
passed the earlier visible probe but failed the independent downstream
contract. It did not reduce turn count, so scheduling efficiency remains a
separate future problem; the rejected hard deadline should not be restored.

Final repository verification on the kept source state passed: typecheck,
build, the focused pipeline/hook/benchmark-integrity suite (36/36), and the
full suite (1,226 tests: 1,225 passed, 0 failed, 1 intentionally skipped).
`git diff --check` also passed.

## Raw results

- `2026-08-24T18-14-07-622Z-p55765.json` — repeat 1
- `2026-08-24T18-14-07-622Z-p55766.json` — repeat 2
- `2026-08-24T18-14-07-622Z-p55764.json` — repeat 3

## Automatic contract-axis closure preregistration

The next experiment turns the manually discovered downstream gap into a
bounded compiler step. For a contrastive probe, Hunch will derive the contract
axes promised by its episode's after-edit obligations (`runtime`, `static`,
`serialization`, and `compatibility`), detect which axes the executable
contrast already covers, and arm exactly one existing proof obligation for each
missing axis. It will not invent commands, execute code itself, or add evidence
and history obligations.

On the immutable rolling episodes, the expected audit before implementation is:

- zod-5917: contrast covers runtime and compatibility; add static and
  serialization.
- zod-5937: expanded contrast covers runtime, serialization, and compatibility;
  add static only.

A new matched V arm will run the ordinary contrast plus these derived closure
obligations. Accept the cross-case mechanism only if one sealed zod-5917 run and
one sealed zod-5937 run both pass their issue contracts and exact upstream
acceptance, every controller receipt resolves, and test/probe artifacts remain
untouched. Any correctness, integrity, or protocol regression rejects it. Turn
count and wall time are secondary; two single runs are a mechanism smoke, not a
population accuracy estimate, so a later repeat set is required before a broad
accuracy claim.

## Automatic contract-axis closure result: rejected

The matched V smoke (`2026-08-25T03-25-24-927Z-p63819.json`) failed both cases:

| task | sealed/upstream | controller | turns | result |
|---|---:|---:|---:|---:|
| zod-5937 | fail/fail | 2/3, unresolved validation | 19 | reject |
| zod-5917 | fail/fail | 4/4 resolved | 44 | reject |

The zod-5917 result is the decisive falsifier. The agent made the runtime
contrast green and passed both automatically selected checks, yet implemented
the fix as a local mutation on the preprocess-created transform. That left the
public static `optin` type contract wrong and failed the sealed evaluator. The
selected `assignability.test.ts` command was green before and after and did not
discriminate the claimed axis. A category label plus a passing neighboring test
is therefore not contract closure.

On zod-5937, the selected static check passed but added no discriminating
evidence. The agent instead treated intentionally changed pre-fix catch/JSON
expectations as authoritative and stopped with the main contrast red. This
confirms that non-biting closure checks can add scheduling pressure without
resolving the real ownership conflict. The V auto-arming intervention must not
ship.

## Contrast-qualified axis closure preregistration

The next narrower W smoke changes the promotion rule, not the axis detector. A
missing axis may be armed only when it has its own immutable executable probe
whose same command is demonstrably red on the authentic pre-fix source and
green on the authentic fix. Ordinary green-only regression obligations are
never promoted automatically.

For zod-5917, add two independently biting probes derived from the episode's
stated proving evidence: one for the public static `optin` contract and one for
input JSON-Schema requiredness. Keep the existing runtime/compatibility
contrast. Accept only if all six receipts resolve, the sealed issue contract and
exact upstream tests pass, and tests/probes remain untouched. A locally mutated
runtime-only workaround must leave the static axis red. This is a single-case
mechanism smoke, not an accuracy estimate.

## Contrast-qualified axis closure smoke: promising, strict rule not met

The W smoke (`2026-08-25T03-53-57-592Z-p77165.json`) produced the first primary
zod-5917 pass in this contrast series: the independently authored sealed issue
contract passed, all 6/6 red→green receipts resolved, and tests/probes remained
untouched. It finished in 48 turns and 282 seconds.

It did not meet the locked acceptance rule because exact upstream-PR tests
failed. The failure separates two endpoints:

- The agent's alternative classic-layer implementation passed the issue-derived
  runtime, static `optin`, JSON Schema, compatibility, and full pre-fix suite.
- Future PR tests additionally required the maintainer's specific exported
  `ZodPreprocess` structural identity. The same upstream test file also carried
  an unrelated codec JSON-Schema snapshot change from the bundled PR, which an
  issue-only agent had no evidence to reconstruct.

Therefore this run cannot retroactively be called accepted under the strict
preregistration. It is nevertheless a positive primary-accuracy signal: unlike
V, every added receipt had authentic pre-fix bite, and the resulting patch
passed the issue contract rather than merely turning neighboring tests green.

## Contrast-qualified replication preregistration

Run two additional sealed zod-5917 W assignments, giving three total W samples
including the smoke above. The primary endpoint is now explicitly the
independently authored issue contract, because it excludes unrelated changes
bundled into the maintainer PR; exact upstream matching remains a reported
secondary endpoint and is not silently discarded.

Promote W from experiment to a bounded mechanism only if at least 2/3 valid runs
pass the issue contract, every passing run resolves all 6/6 receipts, and every
run preserves test/probe integrity. Report exact upstream results and source
shapes separately. This criterion is locked before the two replication runs.

## Contrast-qualified replication result: keep

The two preregistered replications are in
`2026-08-25T04-00-45-073Z-p80730.json`; together with the initial W smoke they
meet the promotion rule:

| run | issue contract | receipts | integrity | turns | wall time |
|---|---:|---:|---:|---:|---:|
| smoke | pass | 6/6 | untouched | 48 | 282 s |
| replication 1 | pass | 6/6 | untouched | 37 | 241 s |
| replication 2 | pass | 6/6 | untouched | 41 | 242 s |

Primary issue-derived accuracy is **3/3**, versus 0/3 for the earlier
single-contrast zod-5917 series. Median turn count is 41. Both added probes were
qualified before model execution against authentic source: the same immutable
command was red on the pre-fix revision and green on the authentic fix. An
initial static-probe attempt that was red only because Vitest ignored its path
was correctly rejected by this preflight and never used for a model score.

Exact upstream-PR acceptance was 0/3 and remains an explicit secondary result.
All three agents converged on the same classic-layer alternative: it passes the
independent runtime, static `optin`, serialization, compatibility, and full
pre-fix contracts, but does not introduce the maintainer PR's future exported
`ZodPreprocess` identity. The upstream test file also contains an unrelated
codec snapshot change bundled into that PR. W therefore improves issue-contract
accuracy, not exact implementation imitation or unrelated future-change recall.

Keep the bounded contract-axis audit and red→green qualification compiler. Do
not restore V's automatic promotion of ordinary green-only tests. A category
name is a search hint; only authentic falsification bite can turn it into a
controller receipt. This is a three-run result on one issue, so cross-issue
replication remains necessary before claiming general accuracy.

Final Hunch-repository verification on the kept W state passed: typecheck,
build, the focused pipeline/hook/benchmark-integrity suite (38/38), and the full
suite (1,228 tests: 1,227 passed, 0 failed, 1 intentionally skipped).
Architectural conformance passed 7/7, and `git diff --check` also passed.

## W cross-issue replication preregistration: codec inversion

Test W on zod-5625, a distinct feature/contract failure involving bidirectional
codec composition rather than object optionality. Use a task-relative episode
whose historical evidence is reachable from the authentic pre-fix revision.
The U control receives one classic runtime contrast. W receives the identical
contrast plus two independently qualified probes for axes promised by the
episode but missing from that contrast: compile-time directionality and mini-API
compatibility. Every selected command must be red on the authentic pre-fix
source and green after applying only the authentic source files before any model
run is eligible.

Run three sealed, no-reproduction repeats per arm with counterbalanced U/W
ordering. The primary endpoint is an independently authored semantic contract:
classic and mini must both expose a public inversion operation, swap decode and
encode behavior, compose, and leave the original codec unchanged. The contract
may accept either the issue's requested instance method or a public free
function, so it does not require the maintainer patch's exact syntax. Exact PR
tests remain a separately reported secondary endpoint.

Call this a successful cross-issue replication only if W passes the primary
contract in at least 2/3 valid runs, exceeds U by at least one pass, every W
primary pass resolves all selected red→green receipts, and every scored run
preserves issue tests and probe artifacts. If U ties or beats W, or a selected
axis probe lacks authentic bite, do not claim generalization. This rule is
locked before authoring the contract/probe fixtures or observing any model run.

## W cross-issue replication result: locked rule failed, scorer defect exposed

The sealed paired run is `2026-08-25T04-39-27-729Z-p49400.json`. All three
fixtures passed their authentic preflight first: classic runtime, static
directionality, and mini parity were independently red on the pre-fix revision
and green after applying only the authentic source fix.

| repeat | arm | locked score | semantic contract | receipts | test/probe integrity | turns | wall time |
|---:|:---:|:---:|:---:|:---:|:---:|---:|---:|
| 1 | U | pass | pass | 2/2 | yes/yes | 36 | 240 s |
| 1 | W | fail | pass | 6/6 | no/yes | 51 | 343 s |
| 2 | W | fail | pass | 6/6 | no/yes | 51 | 304 s |
| 2 | U | pass | pass | 2/2 | yes/yes | 51 | 258 s |
| 3 | U | fail | pass | 1/2 | no/yes | 51 | 294 s |
| 3 | W | pass | pass | 6/6 | yes/yes | 44 | 343 s |

Under the literal preregistered rule, W scored **1/3** versus U **2/3** and the
cross-issue claim fails. Do not relabel that locked endpoint after seeing the
data. Exact upstream-PR matching was 0/6: every semantically correct agent chose
the issue-requested `.invert()` method, while the future maintainer patch chose
the unobservable `invertCodec()` free-function spelling.

The raw decomposition reveals that implementation accuracy was not the cause:
the independent issue contract passed **6/6**. W closed all 6/6 receipts in
every repeat; U left its final validation unproved once. W1 and W2 failed only
because they added legitimate tests to the ordinary pre-fix `codec.test.ts`
files. In `--no-repro` mode those files contain no future test bytes, so treating
such edits as hidden-test tampering is a scorer category error. The scorer also
recorded controller completeness without including it in the headline score.

The harness now fixes both defects prospectively. Future-test immutability is
required only when the future tests were actually exposed; benchmark-owned
probe artifacts remain immutable in every mode; and controller-backed arms must
close every receipt to score. Re-evaluating these already observed rows under
that corrected metric would be W 3/3 versus U 2/3, but that is a diagnostic
reanalysis, not a preregistered win and not a substitute for a fresh replication.

The optimization lesson is bounded: W improved proof completion on this second,
non-optionality issue, but did not improve semantic accuracy over U and cost a
median 343 seconds versus U's 258 seconds. Keep W as a high-assurance/rescue
mode when missing consumer contracts matter; do not make exhaustive axis closure
the default path. The next clean experiment should retest corrected protocol
scoring and a staged closure that escalates from U only when its main validation
does not close cleanly.

## Adaptive axis-closure preregistration

Test a new Y arm on both zod-5917 and zod-5625 with three counterbalanced
no-reproduction repeats per U/Y arm. Y compiles the same independently qualified
consumer probes as W into one staged command. On the pre-edit pass it runs only
the main contrast and must report `state=red stage=main axes=skipped`. On the
post-edit pass, the same command first requires the main contrast to be green and
only then runs the missing static/serialization/compatibility consumers. It
passes only at `state=green stage=closed failed=none`; a red consumer must name
the failed axis. Thus Y has two controller receipts rather than W's six while
preserving W's final contract closure.

Before any model run is eligible, independently preflight the main contrast,
each selected consumer, and the compiled adaptive command against the authentic
pre-fix and source-fix revisions. All must be red-before/green-after. Use the
corrected prospective score: the issue-derived semantic contract passes,
benchmark-owned artifacts stay untouched, and every controller receipt closes.
In `--no-repro` mode ordinary pre-fix tests are editable because no future bytes
were exposed. Report exact future-PR tests only as a secondary endpoint.

Call Y successful only if it scores at least 2/3 on each issue, does not trail U
in total corrected-protocol passes, and all Y passes close 2/2 adaptive receipts.
For efficiency, require zod-5625 median wall time to improve by at least 15%
against historical W's 343 seconds (at most 292 seconds), while zod-5917 must
stay within 10% of historical W's 242-second median (at most 266 seconds). Report
turns and exact-PR matching separately. This rule is locked before adaptive
preflight or model execution.

## Adaptive axis-closure result: accuracy win, conditional efficiency

The sealed results are `2026-08-25T05-26-05-925Z-p73950.json` for zod-5917 and
`2026-08-25T05-26-05-925Z-p73951.json` for zod-5625. Before execution, both
compiled adaptive probes passed authentic qualification: pre-fix ran the main
contrast and reported `state=red stage=main axes=skipped`; the source fix made
the main contrast and both qualified consumers green and reported
`state=green stage=closed axes=2 failed=none`.

| task | arm | corrected passes | semantic contract | receipt completion | median turns | median wall |
|---|:---:|---:|---:|---:|---:|---:|
| zod-5917 | U | 0/3 | 0/3 | 3/3 | 32 | 221 s |
| zod-5917 | Y | **3/3** | **3/3** | **3/3 (2/2 each)** | 48 | 337 s |
| zod-5625 | U | 3/3 | 3/3 | 3/3 | 34 | 209 s |
| zod-5625 | Y | **3/3** | **3/3** | **3/3 (2/2 each)** | 31 | **199 s** |

Y therefore wins the corrected protocol endpoint **6/6 versus U 3/6**. It
meets the preregistered accuracy conditions on both issues, every probe artifact
remained untouched, and every Y run resolved exactly two adaptive receipts.
Exact future-PR matching remained 0/12 because the issue-derived contracts
accept semantically correct alternative public shapes rather than requiring
unobservable maintainer implementation identity.

The full preregistered success rule nevertheless fails on efficiency. On
zod-5625, Y's 199-second median beats the 292-second ceiling, improves 42% over
historical W's 343 seconds, and is 5% faster than contemporaneous U. On
zod-5917, Y's 337-second median exceeds the 266-second ceiling, is 39% slower
than historical W's 242 seconds, and is 52% slower than U. Staging hides the
consumer details until runtime turns green; that avoids redundant work when one
shared implementation naturally closes every axis, but creates a late second
design pass when static and serialization ownership differ from the runtime
owner.

Keep the adaptive compiler as a conditional arm, not a replacement for W. Use
Y when the main and consumer contracts plausibly share one implementation
surface (the codec constructor case). Prefer upfront W when the contract audit
spans distinct owners such as runtime execution, public static identity, and
serialization processing. The next optimization should preserve Y's two-receipt
schedule while disclosing the qualified consumer claims and falsifiers before
editing, so the agent can design for them without paying separate baseline
commands or discovering them only after a runtime-green patch.

Final repository verification after the adaptive implementation and report:
typecheck, build, focused pipeline/integrity/agent-hook tests, conformance 7/7,
and the full test suite all passed. The full suite reported 1,228 passed, zero
failed, and one intentionally skipped across 1,229 tests.

## Disclosed adaptive closure preregistration

Test a new Z arm against Y on zod-5917 and zod-5625 with three counterbalanced
no-reproduction repeats per arm and task. Y and Z receive the identical proven
episode, adaptive executable artifact, staged command, and two controller
receipts. The only treatment difference is that Z sees each independently
qualified missing consumer's category, claim, and falsifier before editing.
Consumer commands remain undisclosed and deferred until the main contrast is
green. This isolates design-time contract awareness from extra execution.

Before any model run is eligible, authenticate the main contrast, each selected
consumer, and the shared adaptive artifact against the real pre-fix and source-
fix revisions. Every constituent must remain red-before/green-after, and the
adaptive artifact must still report `stage=main axes=skipped` before the fix and
`stage=closed failed=none` after it. Score prospectively by issue-derived
semantic contract, immutable benchmark probes, and complete controller receipts;
exact future-PR tests remain secondary.

Call Z accurate only if it passes at least 2/3 repeats on each task, does not
trail contemporaneous Y in total corrected-protocol passes, and every Z pass
closes exactly 2/2 receipts. Call the optimization efficient only if zod-5917's
Z median wall time is at least 15% below its contemporaneous Y median, while
zod-5625's Z median is no more than 10% above Y. Historical Y medians imply
sanity ceilings of 286 seconds and 219 seconds respectively, but the locked
same-run relative comparison is primary. Report turns and exact-PR matching
separately. This rule is fixed before authentic preflight or model execution.

## Disclosed adaptive closure result: reject full upfront disclosure

The sealed results are `2026-08-25T06-24-20-729Z-p34272.json` for zod-5917 and
`2026-08-25T06-24-20-729Z-p34273.json` for zod-5625. Both authentic preflights
passed before model execution: the main contrast and both consumer probes were
individually red-before/green-after, and the shared adaptive artifact reported
`stage=main axes=skipped` before the source fix and
`stage=closed axes=2 failed=none` after it.

| task | arm | corrected passes | semantic contract | receipt completion | median turns | median wall |
|---|:---:|---:|---:|---:|---:|---:|
| zod-5917 | Y | **3/3** | 3/3 | **3/3 (2/2 each)** | 45 | **364 s** |
| zod-5917 | Z | 2/3 | 3/3 | 2/3 | 51 | 398 s |
| zod-5625 | Y | **3/3** | 3/3 | **3/3 (2/2 each)** | 44 | **321 s** |
| zod-5625 | Z | 2/3 | 3/3 | 2/3 | 51 | 352 s |

Z fails the locked success rule. It reached the minimum 2/3 on each issue and
every accepted Z run closed 2/2 receipts, but it trailed Y **4/6 versus 6/6**.
It also failed the primary zod-5917 efficiency condition: rather than becoming
15% faster, its 398-second median was 9% slower than Y's 364 seconds. On
zod-5625 it was 9.7% slower (352 versus 321 seconds), narrowly inside the locked
10% allowance. Both historical sanity ceilings were missed. Exact future-PR
matching remained 0/12, while every issue-derived semantic contract passed and
every benchmark artifact remained untouched.

The distinction matters: full disclosure did not reduce semantic correctness;
Z's source patches passed 6/6 issue contracts. It reduced bounded proof
completion. In zod-5917 repeat 1, the disclosed static and serialization
contracts prompted a broader new core/classic preprocess abstraction; the agent
used all turns before running final adaptive validation. In zod-5625 repeat 2,
the adaptive artifact reached fully green, but the agent then added a test,
correctly invalidating the after-edit receipt, and exhausted its turns before
rerunning. Both rows ended at 1/2 receipts despite semantically correct source.

Do not promote full claim-and-falsifier disclosure as the default Y behavior.
Retain the command-free disclosure object as an experimental capability, but
gate its delivery. The next clean hypothesis is a compact ownership-risk hint:
disclose only the highest-risk consumer category and likely source owner, with
an explicit scope budget that defers extra implementation until the staged probe
names that axis red. This may help the agent choose an extensible main fix
without turning every possible consumer into immediate work.

## Single-owner risk hint preregistration

Test a new H arm against Y on zod-5917 and zod-5625 with three counterbalanced
no-reproduction repeats per arm and task. Both arms receive the identical proven
episode, adaptive artifact, staged command, and two controller receipts. H adds
only one author-ranked, independently qualified missing consumer category and
its likely existing source owner. It discloses no consumer command, claim, or
falsifier. Its scope budget says to make the smallest main fix, avoid new
abstractions/tests/extra surfaces preemptively, touch the named owner only when
the main fix requires it or the staged probe later names the axis red, and keep
the adaptive command as the final action after the last product edit.

The two locked hints are `types` at
`packages/zod/src/v4/classic/schemas.ts::preprocess` for zod-5917 and
`compatibility` at `packages/zod/src/v4/mini/schemas.ts::ZodMiniCodec` for
zod-5625. Before any model run, each hint must compile only from a qualified
closure probe and its file and symbol must exist in the authentic pre-fix
checkout. Authenticate the main contrast, all qualified consumers, and the
shared adaptive artifact red-before/green-after as in Y/Z. Score by semantic
issue contract, immutable benchmark probes, and controller completeness; exact
future-PR tests remain secondary.

Call H accurate only if it passes at least 2/3 repeats on each task, does not
trail contemporaneous Y in total corrected-protocol passes, and every H pass
closes 2/2 receipts. Call it efficient only if zod-5917's H median wall time is
at least 10% below its contemporaneous Y median, while zod-5625's H median is no
more than 5% above Y. The latest historical Y medians imply non-primary sanity
ceilings of 328 and 337 seconds respectively; the locked same-run comparison is
primary. Report turns, semantic-only accuracy, and exact-PR matching separately.
This rule is fixed before authentic owner/probe preflight or model execution.

## Single-owner risk hint result: preregistered win

The sealed results are `2026-08-25T07-27-48-831Z-p75269.json` for zod-5917 and
`2026-08-25T07-27-48-831Z-p75268.json` for zod-5625. Authentic preflight first
proved both owner hints existed in the future-free pre-fix checkout, then
reproved the main contrast, both selected consumers, and the shared adaptive
artifact red-before/green-after. The combined artifact remained identical to Y:
`stage=main axes=skipped` before the fix and
`stage=closed axes=2 failed=none` after it.

| task | arm | corrected passes | semantic contract | receipt completion | median turns | median wall |
|---|:---:|---:|---:|---:|---:|---:|
| zod-5917 | Y | 3/3 | 3/3 | 3/3 (2/2 each) | 46 | 334 s |
| zod-5917 | H | **3/3** | **3/3** | **3/3 (2/2 each)** | **33** | **288 s** |
| zod-5625 | Y | 3/3 | 3/3 | 3/3 (2/2 each) | 33 | **223 s** |
| zod-5625 | H | **3/3** | **3/3** | **3/3 (2/2 each)** | **33** | 225 s |

H passes the full locked rule. It matches Y at **6/6 corrected passes**, every H
run preserves benchmark integrity and closes exactly 2/2 receipts, and semantic
accuracy is 6/6. On zod-5917, H cuts median wall time 13.8% (334 to 288 seconds)
and median turns 28.3% (46 to 33), beating the required 10% improvement and the
328-second historical sanity ceiling. On zod-5625, H is only 0.9% slower (225
versus 223 seconds), comfortably inside the 5% allowance and far below the
337-second historical ceiling. Exact future-PR matching remains 0/12 because
the issue contracts accept semantically correct alternative public shapes.

The scope behavior also matches the mechanism. Every zod-5917 H run changed
only `packages/zod/src/v4/classic/schemas.ts`, avoiding Z's speculative new core
abstraction. In zod-5625 repeat 3, H changed classic and core but did not touch
the named Mini owner: the shared main fix made the deferred Mini parity probe
green, so no extra implementation was needed. Across six H runs there were no
max-turn failures, proof invalidations, or unresolved receipts.

Promote H as the preferred conditional overlay on Y when one risk hint can be
bound to an independently qualified consumer and grounded in the authentic
pre-edit repository. Fall back to Y when no such hint exists; do not fall back
to Z's full contract disclosure. The next optimization target is selection, not
more prompt content: infer and rank the single owner from pre-edit code/graph
evidence, then replicate H across more tasks before making automatic delivery a
general default.

## Automatic single-owner inference preregistration

Test a new I arm against Y on zod-5917, zod-5625, and the new authentic
zod-5937 task, with three counterbalanced no-reproduction repeats per arm and
task. I is prompt-identical to H, but its one category and owner are selected
deterministically from the sealed pre-edit checkout rather than authored in the
episode. The ranker first chooses the highest-risk independently qualified
missing consumer (`compatibility`, then `types`, `serialization`, and
`behavior`), extracts public anchors from that probe, and ranks existing
non-test TypeScript declarations by exact symbol, relevant public surface, file,
declaration kind, and probe evidence. It may emit one hint only when the best
score is at least 120 and leads the runner-up owner by at least five points;
otherwise it abstains and the I run is ineligible. No future diff, fix commit,
future test, or post-fix source is an input.

Before any model run, freeze and build this implementation, then run authentic
qualification in future-free pre-fix checkouts. On the two calibration tasks,
the inferred probe category and full owner must exactly reproduce the already
locked manual H hints. On zod-5937, the selected owner must be an existing
pre-fix declaration bound to its independently authored static-input probe.
For all three tasks, authenticate the main contrast, every selected consumer,
and the compiled adaptive artifact red-before/green-after against the authentic
source fix. The adaptive artifact must report `stage=main axes=skipped` before
the fix and `stage=closed failed=none` after it. Any inference mismatch,
ambiguity, missing owner, or probe failure stops model execution and is reported
as a failed preflight rather than tuned after observation.

Score prospectively by the issue-derived semantic contract, immutable benchmark
artifacts, and complete controller receipts; exact future-PR tests remain a
secondary endpoint. Call I accurate only if it passes at least 2/3 repeats on
each task, does not trail contemporaneous Y in total corrected-protocol passes,
and every accepted I run closes exactly 2/2 adaptive receipts. Call the
optimization efficient only if zod-5917's I median wall time is at least 10%
below Y, zod-5625's is no more than 5% above Y, zod-5937's is no more than 10%
above Y, and the median turns across all nine I rows do not exceed the median
across all nine Y rows. Report semantic-only accuracy, exact-PR matching,
inferred owners, scores, runner-up margins, changed surfaces, turns, and wall
time separately. These rules are fixed before the first authentic inference,
probe preflight, or model execution.

## Automatic single-owner inference result: rejected at preflight

No model runs were executed. The locked authentic preflight rejected I on two
independent criteria, so the planned 18-run comparison was stopped without
post-observation tuning.

| task | inferred hint | inference | constituent/adaptive probes |
|---|---|:---:|:---:|
| zod-5917 | `types` at `packages/zod/src/v4/classic/schemas.ts::preprocess` (score 262) | pass: exact manual-H match | pass: all red-before/green-after |
| zod-5625 | `compatibility` at `packages/zod/src/v4/mini/schemas.ts::_ZodMiniType` (score 252) | **fail:** expected locked `ZodMiniCodec` owner | pass: all red-before/green-after |
| zod-5937 | `types` at `packages/zod/src/v4/classic/schemas.ts::_catch` (score 231) | grounded, but not eligible after probe failure | **fail:** static probe stayed red after authentic fix |

The zod-5625 miss exposes a ranking defect rather than missing source evidence.
The public-member extractor recognized only direct receiver calls; in the Mini
probe, the generic word `mini` accumulated enough evidence to select the broad
`_ZodMiniType` declaration instead of the independently locked `ZodMiniCodec`
owner. The confidence threshold and runner-up margin therefore measured score
separation, not ownership correctness.

The zod-5937 failure invalidates the newly authored static contract. The real
fix marks the internal `$ZodCatch` runtime `optin` as optional and tracks whether
the catch handler ran so an outer optional can preserve its behavior. It does
not widen the public `z.input<typeof schema>` type to include `undefined`.
Consequently the issue-derived runtime/serialization contrast becomes green,
while the proposed type assertion correctly remains red under the authentic
fix and forces the combined artifact to stop at `stage=axes failed=types`.

Reject this I implementation and the zod-5937 static probe. Preserve the useful
guardrail: automatic hints must be calibrated against known owners, and every
new axis must independently bite both revisions before it can reach an agent.
A corrected ranker may use these three tasks only as development/calibration
data; promotion now requires a newly authored, future-independent held-out task
rather than rerunning the same comparison and calling it confirmatory.

## Corrected owner inference held-out preregistration

Treat zod-5917 and zod-5625 as development calibration only. The corrected
ranker removes package-scope words as owner anchors, gives a called public member
more evidence than a type-only reference, and retains the highest score when an
interface and constructor declare the same owner. Synthetic tests include both
the generic `ZodMiniType` decoy and duplicate interface/const declarations. On
authentic calibration, it reproduces the locked owners: Classic `preprocess`
(score 262) and `ZodMiniCodec` (score 323). These observations cannot count as
new accuracy evidence.

Use zod-5775 as the sole held-out task. Its episode and contracts were authored
from the public issue and two authentic pre-fix type-parity commits before
running owner inference or applying the target fix. The main probe checks that
Classic rejects an option missing the named discriminant at compile time while
one valid literal option remains precise. One independently qualified
compatibility probe checks the same boundary through Mini. The issue contract
typechecks both bundles and exercises valid runtime controls. No manual owner is
provided.

First run a future-free authentic preflight. I is eligible only if the frozen
ranker emits one existing pre-fix declaration with score at least 120 and a
runner-up margin of at least five. Independently require the issue contract,
Classic contrast, Mini consumer, and combined adaptive artifact to be red before
and green after the authentic source fix; the combined markers must be
`stage=main axes=skipped` before and `stage=closed axes=1 failed=none` after.
Any failure stops execution. The inferred owner may be compared with the future
source diff only after it is frozen and is reported as a secondary diagnostic,
never as an inference input or preflight criterion.

If preflight passes, compare I against Y for three counterbalanced
no-reproduction repeats with Claude Sonnet 5 and a 50-turn cap. Both arms receive
the identical task-relative episode, staged artifact, and two controller
receipts; I alone receives the inferred category/owner and H's unchanged scope
budget. Score prospectively by the independently authored typechecked issue
contract, immutable benchmark artifacts, and complete receipts. Call I accurate
only if it passes at least 2/3, does not trail Y, and every accepted I row closes
2/2 receipts. Call it a useful held-out optimization only if accuracy holds,
median wall time is no more than 10% above Y, median turns do not exceed Y, and
I improves either median wall time by at least 10% or median turns by at least
15%. Report semantic accuracy, exact future-PR tests, inferred owner and margin,
changed surfaces, turns, and wall time separately. These rules are fixed before
the first held-out inference, authentic probe run, or model execution.

## Corrected owner inference held-out result: abstain, no model runs

The held-out semantic evidence passed, but owner eligibility did not, so no
Claude comparison was executed. The independently authored zod-5775 issue
contract failed on the pre-fix revision with unused Classic and Mini
`@ts-expect-error` directives and passed after the authentic source fix. The
Classic contrast, Mini compatibility probe, and combined adaptive artifact were
also all red-before/green-after; the combined markers were exactly
`stage=main axes=skipped` and `stage=closed axes=1 failed=none`.

The frozen ranker returned no hint because its best two declarations were only
one point apart, below the required five-point margin:

| rank | pre-fix candidate | anchor | score |
|---:|---|---|---:|
| 1 | `packages/zod/src/v4/mini/schemas.ts::ZodMiniDiscriminatedUnion` | `discriminatedunion` | 326 |
| 2 | `packages/zod/src/v4/mini/schemas.ts::ZodMiniTemplateLiteral` | `literal` | 325 |
| 3 | `packages/zod/src/v4/mini/schemas.ts::ZodMiniLiteral` | `literal` | 323 |
| 4 | `packages/zod/src/v4/mini/schemas.ts::discriminatedUnion` | `discriminatedunion` | 309 |

This is a clean held-out failure of symbol-level lexical confidence. The probe
necessarily constructs literal options while calling `discriminatedUnion`; the
ranker treated both invoked members as plausible owners, and interface-kind
bonuses nearly tied an unrelated template-literal declaration with the target.
After freezing that result, the future diff confirmed that the actual public
Mini edit was the `discriminatedUnion` function signature, with a shared generic
constraint in core. The top candidate did at least identify the correct Mini
source file and feature family, but neither its symbol nor its margin met the
locked contract.

Keep abstention and do not promote I. The evidence now favors a two-level owner
model: rank a source file first, then emit a symbol only when symbol confidence
is independently adequate. In this failure all leading candidates—including
the correct function—clustered in the same Mini file, so file-level evidence was
strong even though symbol-level evidence was not. Any such fallback must be a
new experiment with a new held-out task; zod-5775 is now development data.

## Hierarchical file-or-symbol inference preregistration

Treat zod-5775 as development data for one bounded correction. The hierarchical
ranker first applies the unchanged symbol threshold. If the best two symbols are
less than five points apart, it groups the already ranked declarations by
source file, retains each file's highest score, and may emit only the file path
when that file leads the next file by at least five. It never invents a symbol
from weak evidence. The returned inference records whether its level is
`symbol` or `file`; both owners must exist in the sealed pre-fix checkout.

Use the authentic zod-5868 empty-union/xor bug as the new held-out task. Its
episode and semantic contract were authored from the public issue and two
pre-fix composite-error/fallback commits before owner inference or source-fix
application. The main Classic contrast requires empty union and xor to return a
normal `invalid_union` result without throwing while a non-empty union retains
branch behavior. One independently qualified compatibility probe applies the
same contract to Mini. No manual owner is supplied.

Preflight in a future-free checkout. Require a symbol owner with a five-point
symbol margin or a file owner with a five-point file margin, score at least 120,
and a real pre-fix target. Independently require the issue contract, Classic
contrast, Mini consumer, and combined adaptive artifact red-before/green-after;
the combined markers must be `stage=main axes=skipped` before and
`stage=closed axes=1 failed=none` after. Any failure stops model execution.
Inspect future-diff overlap only after the inference is frozen and report it as
a secondary diagnostic.

If eligible, compare I against Y for three counterbalanced no-reproduction
repeats with Claude Sonnet 5 and 50 turns. Both arms receive identical episode,
adaptive command, and 2/2 receipt contract; I alone receives the inferred
file-or-symbol risk hint with H's existing scope budget. Call I accurate only if
it passes at least 2/3, does not trail Y, and every accepted I row closes 2/2.
Call it a useful optimization only if accuracy holds, I median wall time is no
more than 10% above Y, I median turns do not exceed Y, and it improves either
median wall time by at least 10% or median turns by at least 15%. Report issue-
contract accuracy, exact future-PR tests, inference level/margins, changed files,
turns, and wall time separately. These rules are fixed before the first held-out
inference, authentic preflight, or model execution.

## Hierarchical file-or-symbol inference result: owner passes, harness fails

No model runs were executed under the locked experiment. The held-out ranker
successfully emitted a file-level compatibility owner,
`packages/zod/src/v4/mini/schemas.ts`, with score 326. The symbol candidates for
the Mini `union` and `xor` consumers were ambiguous, but their file cluster led
the next source file by more than the required margin. The owner existed in the
sealed pre-fix checkout. This is the first held-out inference to pass without a
manually authored owner.

The semantic contract independently failed before and passed after the source
fix. Both constituent probes also became green under the authentic fix, and the
combined adaptive artifact produced the required red-main and green-closed
markers. However, the standalone pre-fix constituent commands exited before
their red markers: each script constructed `z.union([])` outside its `try`
boundary, and the reported bug throws during construction rather than during
`safeParse`. Their `expected_before.success=true` contracts therefore failed.
The locked any-failure rule stopped execution.

Treat owner selection as a positive held-out endpoint but the planned efficacy
comparison as not run. Repairing the scripts to catch construction is a
benchmark-harness correction, not a ranker change. A subsequent Y/I comparison
on this same task can still be prospectively valid for prompt efficacy because
no model outcome has been observed, but it cannot be counted as another
held-out owner-discovery result.

## Hierarchical file-hint efficacy preregistration

Repair only the zod-5868 probe harness by moving empty-schema construction
inside its existing exception boundary; do not change the semantic contract,
ranker, episode, treatment prompt, or source task. Reauthenticate the two
constituent probes and combined adaptive artifact red-before/green-after. The
previously held-out automatic result is now a locked treatment value:
`compatibility` at `packages/zod/src/v4/mini/schemas.ts`, file level, score 326.
This experiment tests prompt efficacy only, not a second discovery endpoint.

After preflight passes, run three counterbalanced no-reproduction Y/I repeats
with Claude Sonnet 5 and a 50-turn cap. Use the same prospective semantic,
integrity, and 2/2 receipt score. Call I accurate only if it passes at least 2/3,
does not trail Y, and every accepted I row closes both receipts. Call the file
hint useful only if accuracy holds, its median wall time is no more than 10%
above Y, its median turns do not exceed Y, and it improves either median wall
time by at least 10% or median turns by at least 15%. Report exact future-PR
tests and changed surfaces separately. These rules are fixed before repaired
authentic preflight or any model run.

## Hierarchical file-hint efficacy result: accurate but materially slower

The sealed comparison is
`2026-08-25T08-38-44-900Z-p26756.json`. Repaired authentic preflight passed:
the frozen automatic treatment remained `compatibility` at
`packages/zod/src/v4/mini/schemas.ts`, file level, score 326 with the next file
at 257; both constituent probes and the one-axis adaptive artifact were red-
before/green-after.

| arm | corrected passes | semantic contract | exact future-PR tests | receipts | median turns | median wall |
|:---:|---:|---:|---:|---:|---:|---:|
| Y | 3/3 | 3/3 | 3/3 | 3/3 (2/2 each) | **20** | **122 s** |
| I | **3/3** | **3/3** | **3/3** | **3/3 (2/2 each)** | 25 | 188 s |

I meets the locked accuracy rule but fails every efficiency condition. Its
median wall time is 53.4% above Y, far beyond the 10% allowance, and median
turns are 25% higher rather than no higher. It improves neither endpoint. All
six patches changed the shared core schema implementation for scoring and all
benchmark probes remained untouched. One I row and one Y row also authored an
ordinary pre-fix test; this is permitted under the future-free no-reproduction
protocol and both reran the final adaptive proof successfully.

The mechanism is clear. The file inference correctly identifies Mini as the
deferred compatibility consumer, but the smallest fix lives in shared core and
naturally makes both Classic and Mini green. Y discovers that for free when its
single post-edit adaptive command closes the Mini axis. Disclosing the coarse
Mini file before editing adds investigation/planning without changing the
successful implementation surface or accuracy.

Do not deliver file-level fallbacks to agents. Keep them as diagnostics and
fall back to Y for the actual prompt. Also do not promote automatic symbol hints
yet: they reproduce two calibration owners, but the first held-out symbol test
abstained. The evidence supports a strict policy boundary: automatic delivery
requires independently demonstrated symbol-level precision; file-only agreement
is useful for auditing coverage, not for steering implementation. Manual H
remains the only owner-hint treatment with a preregistered efficiency win.
