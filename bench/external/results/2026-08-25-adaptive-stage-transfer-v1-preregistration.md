# Repository-adaptive correction shortlist transfer v1 — preregistration

Status: **LOCKED BEFORE TASK SELECTION, PREDICTION, OR FIX-DIFF ACCESS**

Date locked: 2026-08-25 (Asia/Jerusalem)

Algorithm: `bench/external/adaptive-stage-ranker.ts`

Algorithm SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`

Development repositories (never scored as holdout): `ajv-validator/ajv`, `fabian-hiller/valibot`.

## Question

Can issue-specific repository path/symbol vocabulary and component consensus replace Zod-specific filename routing while preserving a safe stage + likely-file + top-five diagnostic?

## Untouched repositories and sample

- `arktypeio/arktype` (default branch `main`): 6 tasks
- `typestack/class-validator` (default branch `develop`): 6 tasks
- Target: 12 tasks, with at least 10 symbol-scorable tasks across both repositories.

Inspect at most the newest 500 closed pull requests per repository and sort qualifying merged PRs by `merged_at` descending. Take the first six that:

1. are merged, non-draft, and target the named default branch;
2. have a non-empty body;
3. do not begin with `docs`, `doc`, `chore`, `ci`, `build`, `test`, `style`, `refactor`, `deps`, `dependency`, `release`, or `version` (including conventional-commit scopes);
4. contain a schema/validation-domain signal in title/body;
5. contain either a defect signal in the title (`fix`, `bug`, `incorrect`, `wrong`, `fail`, `error`, `regression`, `missing`, `invalid`, `crash`, or `broken`) or an explicit behavioral-failure phrase in the body (`currently`, `expected`, `actual`, `incorrect`, `wrong`, `fail`, `broken`, `regression`, `does not`, `doesn't`, `cannot`, `can't`, `unable`, `throw`, `crash`, `silently`, or `instead of`);
6. have a resolvable merge/squash commit and pre-fix parent.

Selection may inspect PR metadata and commit-parent identities only. Changed-file lists, patches, post-fix source, and fix diffs are forbidden until predictions are frozen.

## Frozen prediction protocol

For each task, concatenate title/body, read only production `.ts`/`.tsx` source from the pre-fix parent, run the locked adaptive ranker, and freeze the stage plus top ten candidates. Hash the task manifest and predictions with SHA-256 before any future diff is requested.

## Ground truth

After freezing, reveal the PR diff. Ground-truth owners are pre-existing top-level declarations whose pre-fix span intersects a changed production-TypeScript line. New-only declarations cannot have been nominated from the pre-fix tree and do not make a task scorable. Test, fixture, example, benchmark, generated, declaration-only, and documentation files are excluded.

## Locked decision rule

Promote the adaptive router to an experimental product diagnostic only if all are true:

- at least 10 symbol-scorable tasks across both repositories;
- top-five pre-existing declaration recall is at least 70%;
- top-one file accuracy is at least 70%.

Exact-owner output remains disabled regardless of result. This holdout may not be tuned and rescored.
