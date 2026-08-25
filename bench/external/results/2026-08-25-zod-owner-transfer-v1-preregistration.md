# Zod blind owner-ranking transfer preregistration

Locked before the first owner prediction on this corpus. This is an offline
patch-owner transfer test, not a model/prompt experiment and not a second test
of the consumer-risk endpoint used by arm I.

## Question

Can the deterministic owner ranker identify the exact implementation symbol
worth steering toward on genuinely unseen Zod issues, using only the issue text
and source as it existed immediately before the authentic fix?

## Frozen corpus and implementation

The manifest is `2026-08-25-zod-owner-transfer-v1-manifest.json`. It contains 21
tasks and SHA-256 hashes of the issue-only inputs. Tasks zod-5625, zod-5775,
zod-5868, zod-5917, and zod-5937 are excluded because their owners or ranker
behavior were observed during development. No task may be removed after
prediction because it abstains, fails, or is hard to label.

Evaluator SHA-256:
`42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`.
The original pretty-printed manifest emitted by the evaluator had SHA-256
`567e253e8e6512643b693fdde7644ab26867de257c9c4d6ebe22b469b7bbf032`.

The issue-only probe is generated without per-task judgment. Category order is
serialization when JSON Schema terms occur, then types when TypeScript/static
terms occur, then compatibility when Classic/Mini or v3/v4 cross-surface terms
occur, otherwise behavior. Its artifact is the unchanged issue title and body.
The ranker reads non-test TypeScript source from the first parent of the fix.

## Sealed labels

For each task, prediction is computed before the evaluator opens the future
diff. Ground-truth files are non-test TypeScript files changed by the authentic
fix. Ground-truth symbols are top-level function, class, interface, type-alias,
or const declarations whose source spans intersect a changed hunk, using the
post-fix declaration plus the pre-fix declaration for deletions. Tasks without
a representable declaration stay in file metrics but are marked symbol-
unscorable; they are not silently dropped from the corpus.

An issue is an owner-disclosed case when its text literally contains a ground-
truth symbol, full/suffix source path, or basename. All other tasks are true-
discovery cases. Results must be reported for both strata.

## Metrics and locked decision

Report exact-symbol precision among symbol outputs, symbol coverage and recall,
top-five symbol recall, file accuracy among any outputs, abstention, and true-
discovery symbol precision/coverage. File-level output remains diagnostic
regardless of its accuracy because the prior prompt experiment already showed
that it slows agents.

Promote automatic symbol hints only if all conditions hold:

- at least 10 symbol outputs;
- at least 90% exact-symbol precision;
- at least 50% exact-symbol coverage over symbol-scorable tasks;
- at least 8 true-discovery symbol outputs; and
- at least 85% true-discovery exact-symbol precision.

Otherwise keep all automatic owner inference diagnostic-only. A hash mismatch,
missing Git object, evaluator crash, or label-construction error invalidates the
run rather than permitting a threshold or task-list change.
