# One-task development runs and measurement

The repository includes an operator-invoked launcher and a read-only PR measurement tool.
They prepare the development loop described in [Autonomous development](autonomous-development.md).
They do not install a schedule, choose a subscription, grant merge authority or activate policies.

## Prepare a run

Select one open proposed decision from `hunch now`. Create a clean linked worktree on an
`agent/` branch containing that exact proposal. The primary checkout, a dirty worktree, a
closed proposal and a mismatched proposal export are refused. An empty proposal queue means
there is no task to run; it is not permission to invent one.

Put the explicitly selected subscription CLI and its headless arguments in a private JSON file:

```json
{"provider":"subscription-cli","argv":["/absolute/path/to/selected-cli","<headless arguments>"]}
```

Use the selected CLI's documented stdin mode. On Windows select an executable, or `node`
and the CLI entry file, rather than a `.cmd` shim. No provider is discovered automatically.
The launcher removes common metered API credential environment variables, but cannot prove
how a CLI's own configuration is billed. Select its subscription mode before using it.

Review the plan before starting:

```sh
node --import tsx tooling/development-run.mjs \
  --worktree /path/to/linked-worktree \
  --proposal /path/to/linked-worktree/.hunch/decisions/dec_example.json \
  --argv-file /private/path/agent.json --minutes 40
```

Add `--run --output /private/path/new-run-receipt.json` to execute. The receipt destination
must be new and writable. The default budget is 40 minutes; allowed budgets are 1–120 minutes.
Allow at least 20 minutes for full verification. The fixed [task prompt](../tooling/development-task.md)
requires one draft PR and a stop. It forbids approving, merging, publishing and starting another task.

The launcher uses an exclusive worktree lock, shell-free process arguments, a wall-clock bound,
a 1 MiB combined output bound, and process-tree termination. After an interrupted host, inspect
the process and lock before manually recovering; a lock is never silently stolen. The receipt
retains the proposal, base revision, expanded prompt hash, exit status and output hashes. Raw
agent output is not retained. `task_completion: "unverified"` is intentional: inspect the PR,
checks and Hunch task evidence separately.

This is a runtime bound, not a permission sandbox. A selected CLI inherits the operator's local
access and can ignore a prompt or launch detached processes. Use an appropriately restricted
account/environment for unattended work. The launcher has been exercised with real Node child
processes, including failure and descendant termination; that is not a real-agent pilot.

## Measure PR outcomes

With authenticated read access through `gh`, fetch the default branch and collect a bounded report:

```sh
git fetch origin main
node tooling/development-metrics.mjs --repo davesheffer/hunch \
  --limit 100 --output /private/path/new-development-metrics.json
```

The report records review coverage, observed change requests, time to merge and exact merge
commits named by explicit revert messages in the last 2,000 locally fetched default-branch commits
(`origin/main` for Hunch). The local `origin` must match the repository being measured.
Missing or truncated review history stays unknown. Absence of an explicit revert marker does
not establish that no partial, manual or cherry-picked revert occurred.

The read-only `Development observation` workflow retains the initial PR head when a PR opens.
It does not check out or execute PR code. Download the `initial-pr-head-<number>` artifacts from
trusted workflow runs within their 90-day retention, keep their run links, and combine their JSON
objects into an array. Pass that file with `--initial-heads /private/path/heads.json`.
The collector checks repository and PR creation time, then examines the earliest retained
attempt of each required check on that head. A later green rerun does not erase a failure.
Incomplete check history stays unknown. Input artifacts are operator-supplied evidence, not
cryptographic attestations of workflow origin.

This measures the **first PR head**, not the first push to a branch. Historical PRs without an
original-head receipt remain unknown. Neither a process receipt nor these metrics evaluates
or grants an autonomy promotion. The two-user pilot, independent reviewer identity and explicit
human authority decisions remain separate gates.
