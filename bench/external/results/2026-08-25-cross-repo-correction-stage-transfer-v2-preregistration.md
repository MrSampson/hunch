# Cross-repository correction-stage transfer v2 — preregistration

Status: **LOCKED BEFORE TASK SELECTION, PREDICTION, OR FIX-DIFF ACCESS**

Date locked: 2026-08-25 (Asia/Jerusalem)

## Question

Does the shipped Zod-validated correction-stage diagnostic transfer, without tuning, to other TypeScript schema/validation libraries?

## Repositories and sample

- `jquense/yup` (default branch `master`): 8 tasks
- `sinclairzx81/typebox` (default branch `main`): 8 tasks
- Total target: 16 tasks, with at least 10 symbol-scorable production-TypeScript fixes.

Tasks are selected deterministically from at most the newest 500 closed pull requests per repository, newest merged first as of the lock date. A task must:

1. be merged, non-draft, and target the named default branch;
2. have a non-empty body;
3. not have a title beginning with `docs`, `doc`, `chore`, `ci`, `build`, `test`, `style`, `refactor`, `deps`, `dependency`, `release`, or `version` (optional conventional-commit scope and `:`/`-` are allowed);
4. contain a defect signal (`fix`, `bug`, `incorrect`, `wrong`, `fail`, `error`, `regression`, `missing`, `invalid`, `crash`, `broken`, or `issue`) and a schema/validation-domain signal (`schema`, `validation`, `validate`, `parse`, `error`, `message`, `json`, `serialize`, `coerce`, `transform`, `object`, `string`, `number`, `array`, `tuple`, `union`, `record`, `ref`, `format`, `required`, `optional`, `nullable`, or `default`) in title/body;
5. have a resolvable merge/squash commit and pre-fix parent.

Take the first eight qualifying PRs per repository. Selection may inspect PR metadata and commit-parent identities only. It may not inspect changed-file lists, patches, post-fix source, or fix diffs before predictions are frozen.

## Frozen prediction protocol

For each task:

1. concatenate PR title and body as the issue input;
2. read only production `.ts`/`.tsx` source from the pre-fix parent archive;
3. run the shipped `rankIssueCorrectionStageCandidates` implementation without repository-specific tuning;
4. freeze the inferred stage and top ten distinct candidates;
5. write the complete task manifest and prediction array, each with a SHA-256 hash.

The prediction artifact must be durably written before any scoring code requests a PR diff, changed-file list, or post-fix source.

## Ground truth and metrics

After the prediction hash is frozen, reveal each PR diff. Ground-truth declarations are top-level declarations whose pre- or post-fix span intersects a changed production-TypeScript line. Test, fixture, example, benchmark, generated, declaration-only, and documentation files are excluded.

Primary metrics over symbol-scorable tasks:

- top-five declaration recall;
- top-one file accuracy.

Secondary diagnostics:

- exact declaration accuracy;
- abstention rate;
- per-repository rates;
- selected-stage distribution.

## Locked decision rule

Retain the router as a cross-repository diagnostic only if all are true:

- at least 10 symbol-scorable tasks across both repositories;
- top-five declaration recall is at least 70%;
- top-one file accuracy is at least 70%.

Exact-owner output remains disabled regardless of result.

If the rule fails, the product must continue to describe the evidence as Zod/schema-domain only. This holdout may diagnose a later design change, but it must not be used to tune and rescore these tasks.
