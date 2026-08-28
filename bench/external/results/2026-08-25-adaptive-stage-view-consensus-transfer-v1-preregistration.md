# Adaptive shortlist cross-view consensus transfer v1 — preregistration

Status at lock: the rule was developed only on consumed datasets. Holdout task text, source snapshots, and fix diffs have not been inspected. Repository metadata and aggregate merged-PR counts established feasibility only.

## Frozen inputs

- Ranker SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`
- Cross-view policy SHA-256: `69cacc6fe39682562a9d5fc2d5075a01524549ba23ee237f80891bb81f15ebd5`
- Untouched repositories: `trpc/trpc` (`main`) and `elysiajs/elysia` (`main`).
- Eight tasks per repository, selected deterministically newest-first from up to 500 recently updated closed PRs.

## Task selection

A task must be a non-draft merged PR into `main`, have a non-empty body, change between one and eight files according to GitHub PR metadata, contain schema/validation/parsing/serialization/coercion/transformation/request/response vocabulary, and either have an explicit defect word in the title or an explicit current-versus-expected phrase in the body. Documentation, maintenance, dependency, test-only, style, refactor, release, and version-prefixed titles are excluded. The first eight eligible PRs per repository are selected with no manual substitution.

The full title-plus-body, title-only, and body-only rankings use the same pre-fix source snapshot. All three top fives and the consensus label are frozen before requesting any diff. A task is symbol-scorable only when its fix changes at least one pre-existing top-level declaration in non-test TypeScript source; new-only declarations are excluded.

## Locked confidence rule

- `supported`: at least one exact declaration occurs in all three independent top-five lists.
- `tentative`: candidates exist, but the three views do not share a top-five declaration or both text slices are not available.
- `insufficient`: the full-text ranker produces no candidates; the product abstains.
- The label supports only the bounded full-text shortlist. It never authorizes the shared declaration itself as the answer, a likely-file claim, or an exact-owner claim.

## Promotion rule

Promote the cross-view evidence label only if all conditions hold:

1. At least 10 tasks are symbol-scorable across both repositories.
2. At least four scorable tasks are labeled `supported`, covering at least 25% of scorable tasks.
3. Supported top-five declaration accuracy is at least 85%.
4. Supported top-five accuracy exceeds unfiltered top-five accuracy by at least 10 percentage points.

Likely-file confidence remains disabled unless supported-task top-one file accuracy independently reaches 85%. Exact-owner output remains disabled regardless of outcome. A failed rule is recorded and is not tuned and rescored on this holdout.
