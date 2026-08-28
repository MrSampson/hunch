# File-first declaration clusters transfer v1 — preregistration

This artifact was written before any fixing diff or post-fix source was opened for the twelve selected cases. Inputs are the PR title/body-derived claim, the merge commit identifier, and source at the first parent of that commit.

## Locked production rule

- Preserve the existing flat top-five declaration shortlist unchanged.
- Rank files by the sum of the best static score from their first three distinct semantic declaration families.
- Return at most four files, three semantic families per file, and three declaration members per family.
- Group declarations by non-generic camel-case symbol terms; scaffolding variants therefore consume one family rather than the whole inspection view.
- Emit a deterministic 24-hex receipt covering the selected files, family identifiers, limits, candidate count, preserved-flat-shortlist flag, and disabled exact-owner flag.
- The file/family view is supplemental. It does not claim an exact owner or per-case confidence.

## Frozen scoring

A case is symbol-scorable only when the fix changes at least one pre-existing top-level declaration in non-test TypeScript source under `packages/zod/src/v4`. New-only declarations, tests, documentation, and non-TypeScript files do not create symbol truth.

For every case, write the flat top five, all bounded file/family predictions, and the receipt to the predictions artifact before reading any fixing diff. Only after that file exists may the scorer derive changed declaration spans from the pre/post source.

Primary measurements:

1. Baseline top-five exact-declaration coverage.
2. Cluster-family exact-declaration coverage.
3. Combined coverage from the unchanged top five plus the supplemental cluster view.
4. Selected-file coverage and the number of cluster rescues over the top five.
5. Average and maximum unique declarations exposed by the bounded cluster view.

## Promotion rule

Promote the hierarchical view as an experimental diagnostic only if all conditions hold:

1. At least eight cases are symbol-scorable.
2. Cluster-family exact-declaration coverage is at least 70% and not below baseline top-five coverage.
3. The cluster view rescues at least two baseline misses.
4. Selected-file coverage is at least 75%.
5. Combined coverage has no loss relative to the unchanged baseline shortlist.
6. Every receipt is complete, says the flat shortlist was preserved, and keeps exact-owner output disabled.
7. The average cluster view contains no more than 30 unique declarations and no case contains more than 36.

Passing this rule does not establish a top-five accuracy gain because the hierarchical view has a larger, explicitly reported inspection budget. Failing the rule rejects the view without tuning and rescoring this holdout.

## Frozen hashes

- Task artifact SHA-256: `e5375e57f8ab42417c0e14732fb85e6adf9aab64139e5e84578e77867aeee14d`
- File-cluster implementation SHA-256: `5c1584c8aee9d2d87a8f69d2f6c94d98c7107286b4c7d57548e6758fc57a4702`
- Correction-stage integration SHA-256: `0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64`
- Static ranker SHA-256: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- Truth mapper SHA-256: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`
