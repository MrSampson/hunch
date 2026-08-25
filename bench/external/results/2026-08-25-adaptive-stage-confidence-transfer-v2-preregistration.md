# Adaptive shortlist confidence transfer v2 — preregistration

Status at lock: v1 aborted before prediction because one repository did not meet its locked task count. The ranker and confidence policy are unchanged. V2 uses two different repositories whose task titles, bodies, pre-fix sources, and fix diffs have not been inspected; repository metadata and aggregate merged-PR counts established feasibility only.

## Frozen inputs

- Ranker: `bench/external/adaptive-stage-ranker.ts`
- Ranker SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`
- Confidence policy: `bench/external/adaptive-stage-confidence.ts`
- Confidence-policy SHA-256: `f79dd7c5bae1f2028cd74a223a23422c38ef009737d4fb9ffd9ca3625169e514`
- Untouched repositories: `Effect-TS/effect` (`main`) and `react-hook-form/react-hook-form` (`master`).
- Eight tasks per repository, selected deterministically newest-first from the first 500 recently updated closed PRs.

## Task selection

A task must be a non-draft merged PR into the named branch, have a non-empty body, contain schema/validation/parsing/serialization/coercion/transformation/form vocabulary, and either have an explicit defect word in the title or an explicit current-versus-expected behavioral phrase in the body. Documentation, maintenance, dependency, test-only, style, refactor, release, and version-prefixed titles are excluded. Selection stops at the first eight eligible PRs per repository; there is no manual substitution.

The prediction input is the PR title plus body and the repository at the first parent of the merge commit. Predictions and evidence labels are frozen before requesting any PR diff. A task is symbol-scorable only when the fix changes at least one pre-existing top-level declaration in non-test TypeScript source. New-only declarations are excluded from symbol truth.

## Locked confidence rule

- `supported`: the top candidate's path shares at least two terms with the issue and its score leads the runner-up by at least 2 points (or it is the only candidate).
- `tentative`: at least one path or symbol term overlaps, but the supported rule is not met.
- `insufficient`: no candidate exists or the top candidate has zero path and symbol overlap; the product must abstain.
- The label describes support for the bounded top-five shortlist only. It never authorizes an exact-owner claim.

## Promotion rule

Promote the evidence label into the diagnostic only if all conditions hold:

1. At least 10 tasks are symbol-scorable across both repositories.
2. At least four scorable tasks are labeled `supported`, covering at least 25% of scorable tasks.
3. The correct pre-existing declaration appears in the top five for at least 85% of supported tasks.
4. Supported top-five accuracy exceeds unfiltered top-five accuracy by at least 15 percentage points.

Likely-file confidence is a separate claim and is not promoted unless supported-task top-one file accuracy independently reaches 85%. Exact-owner output remains disabled regardless of results. A failed rule is recorded rather than tuned and rescored on this holdout.
