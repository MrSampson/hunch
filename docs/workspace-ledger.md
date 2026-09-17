# Workspace ledger: branches and worktrees across machines

Status: **plan, not shipped.** Drafted 2026-09-17. Nothing in this document is implemented yet;
every file reference below is to code that exists today and that the plan builds on.

## The problem

One developer working on several machines (and a team working on many) accumulates branches and
worktrees nobody remembers. Answering the routine questions —

- which worktrees are open, and on which machine?
- which branches exist only on machine X and were never pushed?
- which branches are already merged (including squash-merged) and can be deleted?
- which worktree still has uncommitted work, so it must *not* be pruned?

— is today an agent conversation: `git worktree list`, `git branch -vv`, `git branch --merged`,
`git log`, a look at the PR list, and cross-referencing all of it, on *every* machine, *every*
time. It is slow, it burns tokens on deterministic work, and the answer is gone as soon as the
session ends. No machine can see another machine's worktrees at all.

Hunch already has the two things this needs: a git-native memory store that syncs between
machines through the private/shared overlay repository, and a set of git hooks that fire in the
regular code flow. The plan is to make each machine record its own workspace facts
deterministically, sync them through the overlay, and answer the questions above from memory
with one CLI command or one MCP tool call.

This is engineering memory, not the served state layer: no `hunch serve`, no daemon, no token.
It lives in the same flow as decisions and constraints.

## Design in one paragraph

Each machine writes **one record** per repository, `.hunch/workspaces/ws_<machine_id>.json`, into
the overlay store (private or shared), describing that machine's worktrees and local branches
with deterministic verdicts (pushed? ahead/behind? merged, and how?). The record is an
*observation* with an `observed_at` stamp and git evidence, never a claim of truth. Because each
machine owns exactly one file, syncing through the overlay never conflicts: no merge-driver
changes, no last-writer-wins. Snapshots refresh from git hooks and at MCP session start, so the
ledger is maintained as a side effect of normal work. Queries read the union of all machines'
records and produce a compact table plus a recommended action per branch and worktree.

## What gets recorded

A new additive record kind, `workspaces` (registered in `ENTITY_KINDS` / `SCHEMAS` in
`src/core/types.ts`, one directory `.hunch/workspaces/`). Older builds ignore directories they do
not know, so existing graphs load unchanged and no `manifest.json` schema bump is needed.

```jsonc
{
  "schema": "hunch.workspace/1",
  "id": "ws_a1b2c3d4e5f6",              // one record per machine per repository
  "machine": { "id": "mac_…", "label": "dave-mbp", "platform": "darwin" },
  "repository": "github.com/davesheffer/hunch",   // canonicalRemoteRepositoryIdentity()
  "observed_at": "2026-09-17T08:12:00Z",
  "default_branch": { "name": "main", "remote_head": "8f3c…" },
  "fetched_at": "2026-09-17T07:58:00Z",  // last time origin was fetched on this machine (or null)
  "worktrees": [
    { "path": "/Users/dave/code/hunch",           "branch": "main",           "head": "8f3c…",
      "is_main": true,  "dirty": false, "locked": false, "last_commit_at": "2026-09-16T…" },
    { "path": "/Users/dave/code/hunch-wt/feat-x", "branch": "feat/x",         "head": "1a2b…",
      "is_main": false, "dirty": true,  "locked": false, "last_commit_at": "2026-09-10T…" }
  ],
  "branches": [
    { "name": "feat/x", "head": "1a2b…", "upstream": "origin/feat/x", "upstream_gone": false,
      "ahead": 2, "behind": 0, "last_commit_at": "2026-09-10T…", "worktree": "/Users/dave/code/hunch-wt/feat-x",
      "merged": { "status": "unmerged", "method": null, "evidence": [] } },
    { "name": "fix/old", "head": "9c9c…", "upstream": "origin/fix/old", "upstream_gone": true,
      "ahead": 0, "behind": 40, "last_commit_at": "2026-07-02T…", "worktree": null,
      "merged": { "status": "merged", "method": "squash", "evidence": ["patch-id 9c9c…=d4d4… in main"] } }
  ],
  "provenance": { "source": "extracted", "confidence": 1, "evidence": ["git worktree list --porcelain", "git for-each-ref …"] }
}
```

Field rules:

- **Machine identity** is a stable random id generated once per machine and stored at the user
  level (`~/.config/hunch/machine.json`, `XDG_CONFIG_HOME` / `%APPDATA%` aware), so every
  repository on the machine reports under the same id. The label defaults to the hostname and is
  editable (`hunch workspaces label "dave-mbp"`). The hostname itself is never stored unless it
  is the label. Per-repo `.hunch/local.json` is *not* used for this: a fresh clone must report
  as the same machine.
- **Paths** are stored absolute (a worktree path is meaningful only on its own machine).
  They go through the existing credential-free validation (`isCredentialFreeText`).
- **Merged verdicts** are deterministic, computed on the machine that has the objects:
  - `ancestry` — `git merge-base --is-ancestor <head> <default remote head>`;
  - `squash` — patch-id equivalence of the branch's commits since merge-base against the default
    branch (same signal `commitRepairStatus` / `repair-provenance` use for orphaned commits);
  - `upstream_gone` alone is *not* a merged verdict (a branch can be deleted remotely without
    merging); it is reported as its own signal.
  - `unknown` when the default branch is not present locally or git failed (never collapsed into
    `unmerged` — the same "false ≠ error" rule `CommitRepairStatus` exists to enforce).
- **Dirty** is `git status --porcelain` non-empty in that worktree; **locked** comes from
  `git worktree list --porcelain`. Both gate pruning.
- **Freshness**: a record older than `workspaces.stale_after` (default 7 days) is reported as
  *unverified* in every query — the machine may be off, or the hook may not be installed. The
  data is still shown; the verdict is labeled.

Nothing here requires an LLM. Synthesis is untouched (`con_2ce3f2a547`).

## When the record refreshes (the regular code flow)

Snapshots are cheap (a handful of git commands, no network) and idempotent: a snapshot that
produces the same content hash as the stored record writes nothing and commits nothing.

| Trigger | Where it plugs in | Notes |
| --- | --- | --- |
| `git checkout` / `git switch` / `git worktree add` | new **post-checkout** managed block in `src/integrations/hooks.ts`, installed by `hunch init` next to post-commit / pre-commit / post-merge | the moment branches and worktrees actually change |
| `git commit` | existing post-commit block: append `hunch workspaces snapshot --quiet` after the capture step | keeps `head`, `ahead`, `dirty` current |
| MCP server start / first `hunch_context` of a session | `src/mcp/server.ts`, right after the existing overlay pull (`pullHunchStatus`) | guarantees a machine that only ever runs an agent still reports |
| `hunch worktree <path>` | existing command in `src/cli/index.ts` | snapshot after the worktree is created |
| `hunch workspaces snapshot [--fetch]` | manual / CI / cron | `--fetch` runs `git fetch --prune` first; the default never touches the network |

The snapshot is written to the overlay through the existing capture funnel
(`flushPrivate` in `src/integrations/sync.ts`), so it auto-commits and pushes exactly like a
private decision does, and other machines receive it on their next overlay pull. In `public`
mode (no overlay configured) the record is written to the repo-tracked `.hunch/` **only if**
`workspaces.publish_public: true`; the default is to skip with a one-line `doctor` hint, because
committing per-machine paths into the code repository is rarely wanted.

Hook cost guard: the hook runs the snapshot in the background (`&` / detached spawn, the same
pattern the post-commit capture uses) and skips entirely when the stored record is younger than
60 seconds, so `git checkout` latency is unaffected.

## The queries

All queries read every `ws_*` record visible in the store (this machine's plus every synced one)
and never shell out to git on another machine's behalf. Output is deliberately compact: one line
per worktree/branch, so an agent spends tens of tokens, not thousands.

### `hunch workspaces` — the inventory

```
MACHINE     WORKTREE                          BRANCH            DIRTY  LAST COMMIT  SEEN
dave-mbp    ~/code/hunch                      main              -      1d           2h ago
dave-mbp    ~/code/hunch-wt/feat-x            feat/x            yes    7d           2h ago
dave-desk   /home/dave/hunch                  main              -      1d           9d ago (unverified)
dave-desk   /home/dave/hunch-wt/fix-old       fix/old           -      77d          9d ago (unverified)
```

Flags: `--machine <label>`, `--branch <name>`, `--json`.

### `hunch branches` — the verdicts

```
BRANCH        MACHINES            WORKTREE        UPSTREAM        MERGED          ACTION
feat/x        dave-mbp            dave-mbp        ahead 2         no              keep (dirty worktree on dave-mbp)
fix/old       dave-mbp,dave-desk  dave-desk       gone            yes (squash)    delete local on dave-mbp; prune worktree on dave-desk
spike/y       dave-desk           -               never pushed    unknown         review: unpushed, 41d idle, dave-desk unverified
```

Flags: `--merged`, `--stale <days>`, `--unpushed`, `--machine <label>`, `--json`.

The `ACTION` column is a recommendation computed from the same rules everywhere:

| Condition | Recommendation |
| --- | --- |
| merged (ancestry or squash) and no dirty/locked worktree anywhere | delete local branch on each machine that has it; prune its worktree |
| merged but a worktree on it is dirty | keep; name the machine and worktree |
| unmerged, no upstream, idle > `stale_after` | review: unpushed work, possibly lost if the machine is retired |
| unmerged, upstream ahead/behind | keep |
| machine record unverified | any action is suffixed `(unverified)` and never auto-applied |

### `hunch workspaces prune`

`--dry-run` (default) prints the exact `git branch -d` / `git worktree remove` commands **per
machine**. `--apply` executes only the commands for *this* machine, only for branches whose
verdict is `merged` with evidence tied to the same `head` sha the record saw, and only when the
worktree is clean and unlocked; it then re-snapshots. Commands for other machines are printed,
never executed — and `--apply` never deletes remote branches. Deleting somebody else's unmerged
work is exactly the irreversible action Hunch should not take unattended, mirroring the
`repair-provenance --apply` posture in `src/integrations/hooks.ts`.

### MCP

One tool, `hunch_workspaces(view: "inventory" | "branches", filter?)`, returning the same rows
as JSON plus a `summary` string. It joins the everyday tool group (it is a grounding read, not a
specialist state tool). Its description tells the agent to call it *instead of* running git
inventory commands.

### Existing surfaces

- `hunch now` gains one line: `Workspaces: 3 machines · 7 worktrees (2 dirty) · 4 branches merged and deletable`.
- `hunch doctor` reports whether this machine has a workspace record, its age, and whether the
  post-checkout hook is installed.
- `hunch init` scaffolds a `/worktrees` slash command next to `/capture` and `/heal`
  (`src/integrations/scaffold.ts`) whose body is "call `hunch_workspaces`, then answer".

## Team mode

With `hunch shared --repo <url>`, every teammate's machine record lands in the same overlay, so
`hunch branches` answers "who has a worktree on `feat/x`, and is it dirty?" for the whole team.
Two knobs in `.hunch/config.json` under `workspaces`:

- `publish: "full" | "branches" | "off"` — `branches` omits worktree paths (label + branch +
  verdicts only) for people who do not want their directory layout in a shared store.
- `stale_after: "7d"`.

Machine labels are user-chosen and should not embed personal data; `doctor` warns when a label
equals the hostname in `shared` mode.

## Phases

Each phase ships on its own, is tested under `test/`, and does not require the next.

**Phase 1 — single machine, local truth.** Record kind + Zod schema + migration no-op
(`src/core/types.ts`, `src/core/migrate.ts`); machine identity (`src/core/machine.ts`);
snapshot extractor (`src/extractors/workspaces.ts`: worktree list, branch list, upstream state,
ancestry and squash verdicts, dirty/locked); `hunch workspaces snapshot`, `hunch workspaces`,
`hunch branches` reading the local store. Tests build throwaway repos with real worktrees,
merges, squash-merges and a deleted upstream. Exit criterion: on one machine, the three questions
in "The problem" are answered by one command with no LLM and no network.

**Phase 2 — cross-machine.** Overlay routing through `flushPrivate`; hooks (post-checkout block,
post-commit append, MCP-start refresh, `hunch worktree` hook-in); freshness labeling; union query
across `ws_*` records; `hunch_workspaces` MCP tool; `/worktrees` scaffold; `now` and `doctor`
lines. Exit criterion: a snapshot taken on machine A is visible in `hunch branches` on machine B
after B's next MCP session start, with A's record labeled by age.

**Phase 3 — safe cleanup.** `prune --dry-run` / `--apply` with the local-only, evidence-bound
rules above; `publish` privacy modes for shared stores; optional PR linkage (when the repo's
`post-merge` hook already sees a merged PR, attach `merged.method: "pr"` with the PR number —
never fetched from GitHub by the snapshot itself).

Deliberately **out of scope**: executing any command on another machine, deleting remote
branches, a background daemon, and any use of `hunch serve` — the ledger must work for a
developer whose only Hunch surface is the CLI and the MCP tools in their editor.

## Decisions to confirm before Phase 1

1. **Machine id at user level (`~/.config/hunch/machine.json`), not per repo.** Recommended: yes —
   the whole point is that all clones on a machine report as one machine.
2. **Default visibility of paths in `shared` mode.** Recommended: `full` for a solo developer's
   private overlay, `branches` as the default when `team.json` exists.
3. **Snapshot never fetches by default.** Recommended: yes — hooks must stay offline-safe and
   fast; `--fetch` and `hunch workspaces snapshot --fetch` in a daily cron are the opt-ins. The
   `fetched_at` field tells the reader how fresh the `behind` / `upstream_gone` signals are.
4. **`--apply` scope.** Recommended: local machine only, merged-with-evidence only, clean and
   unlocked only. No exceptions, no `--force`.
