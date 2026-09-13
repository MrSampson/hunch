# Hunch Guard review path (candidate)

The required `Hunch Guard` workflow remains the source of the ordinary blocking
check. This candidate adds a separately named `workflow_dispatch` path for the
solo maintainer to review one narrowly defined failure: a direct scope blocker
whose recorded scope is stale. It publishes `hunch-guard-review` on the exact
PR head SHA; it does not edit branch protection or replace the required check.

The dispatch must be made from `main` and supplies the PR number, full head and
base SHAs, a guard run id, a canonical report hash, a human reason, and an
explicit authorization boolean. The verifier binds all of those values to the
live open PR, the configured maintainer's GitHub numeric id and login, and the
trusted evaluator receipt. A report is reviewable only when its failure class is
exactly `direct_scope_blocker`. Policy failures, executable behavior policy
failures, conformance failures, vetoes, regressions, unknown results, incomplete
evaluation, and infrastructure errors are always refused.

The workflow checks out only the default branch and treats the downloaded guard
report as data. It never checks out a PR, installs a PR package, runs a PR script,
or invokes Hunch against a PR worktree. The receipt producer must therefore be a
trusted-base `pull_request_target` run with a machine-readable `hunch-guard-report`
artifact whose `workflow_sha` equals the requested base SHA. The current
`pull_request` guard does not satisfy that provenance contract, by design; until a
trusted producer is qualified, this candidate refuses every report from it rather
than granting an unsafe exception.

[GitHub's workflow syntax documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onworkflow_dispatch)
says `workflow_dispatch` runs only when the workflow exists on the default
branch, and [GitHub's security guidance](https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target)
warns that privileged `pull_request_target` workflows must not execute untrusted
code. The candidate follows both constraints. [GitHub's commit-status API](https://docs.github.com/en/rest/commits/statuses#create-a-commit-status)
permits a user with push access to set a status on a specified commit SHA; the
status context is separate from the existing Hunch Guard check. A one-time
branch-protection migration to require this context belongs to live qualification
after a trusted receipt producer exists; it is intentionally not part of this
candidate.

Run the focused verifier tests with:

```sh
npx tsx --test test/hunch-guard-review.test.ts
```
