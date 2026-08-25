# Cross-repository correction-stage transfer v1 — preregistration

Status: **ABORTED BEFORE PREDICTION OR FIX-DIFF ACCESS**

Date locked: 2026-08-25 (Asia/Jerusalem)

## Question

Does the Zod-validated correction-stage diagnostic transfer, without tuning, to other TypeScript schema/validation libraries?

## Repositories and sample

- `ajv-validator/ajv`: 6 tasks
- `fabian-hiller/valibot`: 6 tasks
- Total target: 12 tasks, with at least 10 scorable production-TypeScript fixes.

Tasks are selected deterministically from GitHub's closed-pull-request API, newest merged first as of the lock date. A task must:

1. be merged, non-draft, and target the repository's default branch;
2. contain both a defect signal (`fix`, `bug`, `incorrect`, `wrong`, `fail`, `error`, `regression`, `missing`, `invalid`, or `crash`) and a schema/validation-domain signal in its title/body;
3. have non-empty title/body issue evidence;
4. have a resolvable merge/squash commit and pre-fix parent.

Selection may inspect PR metadata and commit-parent identities only. It may not inspect changed-file lists, patches, post-fix source, or fix diffs before predictions are frozen.

## Frozen prediction protocol

For each task:

1. concatenate PR title and body as the issue input;
2. read only production `.ts`/`.tsx` source from the pre-fix parent;
3. run the shipped `rankIssueCorrectionStageCandidates` implementation without repository-specific tuning;
4. freeze the stage and top ten candidates;
5. hash the complete prediction array with SHA-256.

The task manifest and predictions must be written before any scoring code requests a PR diff or post-fix source.

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

If the rule fails, the product must continue to describe the evidence as Zod/schema-domain only. This holdout may diagnose the next design change, but it must not be used to tune and rescore the same tasks.

## Protocol disposition

The deterministic metadata-only selection was dry-run once. It admitted obvious documentation and environment-maintenance PRs because the locked rule allowed generic `fix` plus terms such as `schema`, `error`, and `string`. The run was aborted before source retrieval, prediction, changed-file access, post-fix access, or scoring. This protocol has no router verdict and its two repositories are not reused in v2.
