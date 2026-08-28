# Flat-file-anchored declaration clusters transfer v3 — preregistration

This is a third non-overlapping blind cohort. V1 and v2 predictions and truth are revealed development data. No fixing diff or post-fix source for these cases was opened before this artifact and the task manifest were frozen.

## Locked mechanism

V3 deliberately reuses v2's ranking behavior: preserve all distinct files represented by the unchanged flat top five, fill unused slots by aggregate semantic-family score, and expose at most five files × two families × three declaration members. V3 changes the receipt version and evaluation contract, not the ranker behavior.

Each deterministic receipt must record the flat-file-anchor strategy, limits, selected files and cluster identifiers, source-candidate count, flat-shortlist preservation, and disabled exact-owner output.

## Why the contract changed

The view is supplemental: the original top five remains separately visible. V2 improved their preserved union from 4/12 to 7/12 but was rejected by a cluster-only 70% threshold. That threshold measured the supplement as if it were a replacement. V3 evaluates the delivered union and reports the larger inspection budget explicitly.

## Blind scoring and promotion

A case is scorable only when its fix changes a pre-existing top-level declaration in non-test TypeScript under `packages/zod/src/v4`. Predictions and receipts must exist on disk before truth derivation begins.

Promote the supplemental hierarchical diagnostic only if all hold:

1. At least eight scorable cases.
2. Combined exact-declaration coverage is at least 50% and exceeds baseline top-five coverage by at least 15 percentage points and at least two cases.
3. At least two baseline misses are rescued.
4. Selected-file coverage is not below baseline file coverage.
5. The flat top five are separately preserved, so combined coverage has zero losses by construction.
6. Every receipt is complete, uses the flat-shortlist-file-anchor strategy, and keeps exact-owner output disabled.
7. The cluster inspection view averages at most 24 unique declarations and never exceeds 30.

Passing promotes only the supplemental inspection view. It does not establish a top-five gain, an exact-owner claim, or per-case confidence.

## Frozen hashes

- Task artifact SHA-256: `da08d983f81298f66f762e277b0f07aae38a8ed0c27ccb4139b7c3d8938df7dd`
- Cluster implementation SHA-256: `c5b65248a17e25e2e9ab59fab84c2df867aeb1d0517e001bc07989a2f82d064e`
- Correction-stage integration SHA-256: `0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64`
- Static ranker SHA-256: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- Truth mapper SHA-256: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`
