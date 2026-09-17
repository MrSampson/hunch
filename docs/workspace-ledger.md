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

The example below is a `publish: full` record; the default `branches` mode has no `path` fields.

```jsonc
{
  "schema": "hunch.workspace/1",
  "id": "ws_a1b2c3d4e5f6",              // one record per machine per repository
  "machine": { "id": "mac_…", "label": "machine-7f3a", "platform": "darwin" },   // label is user-set; never the hostname by default
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

- **Machine identity** is a random 128-bit id generated once per machine and stored at the user
  level (`~/.config/hunch/machine.json`, mode `0600`, `XDG_CONFIG_HOME` / `%APPDATA%` aware), so
  every repository on the machine reports under the same id. It is *not* derived from hardware
  serials, MAC addresses or the hostname, so it identifies nothing outside Hunch. The label
  defaults to `machine-<first 4 hex of id>` and is set by the user (`hunch workspaces label
  "build-box"`); the hostname, OS username and home directory are never recorded. Per-repo
  `.hunch/local.json` is *not* used for this: a fresh clone must report as the same machine.
- **Paths** are stored absolute (a worktree path is meaningful only on its own machine) and only
  when `publish` is `full` (see Team mode); in `branches` mode a worktree is recorded as
  `{ "branch", "dirty", "locked" }` with no path. Every string field goes through the existing
  credential filters (`isCredentialFreeText` / `isCredentialFreeValue` in `src/core/provenance.ts`)
  and the record is rejected, not trimmed, if any field fails.
- **What is deliberately not recorded**: commit messages, diffs, file names, remote URLs, author
  emails, environment variables, the hostname. Branch names, commit SHAs and ISO dates are the
  only repository-derived content, and branch names must pass `git check-ref-format`.
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

(shown with `publish: full`; in the default `branches` mode the WORKTREE column reads `yes` / `-`)

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
machine**. `--apply` executes only the commands for *this* machine, and before executing it
re-runs the snapshot and acts on that **fresh local result, never on a stored record**: a branch
is deleted only when the live verdict is `merged` with evidence tied to the same `head` sha, and
a worktree is removed only when it is clean and unlocked right now. It uses `git branch -d`
(never `-D`) and `git worktree remove` (never `--force`), so git itself refuses anything
unmerged or dirty as a second line of defense. `--apply` asks for interactive confirmation
listing every command; in a non-TTY it refuses unless `--yes` is passed explicitly. Commands for
other machines are printed, never executed — and `--apply` never deletes remote branches.
Deleting somebody else's unmerged work is exactly the irreversible action Hunch should not take
unattended, mirroring the `repair-provenance --apply` posture in `src/integrations/hooks.ts`.

### MCP

One **read-only** tool, `hunch_workspaces(view: "inventory" | "branches", filter?)`, returning
the same rows as JSON plus a `summary` string. It joins the everyday tool group (it is a
grounding read, not a specialist state tool). There is no MCP write or prune surface: an agent
can *see* what is prunable but can only act through the CLI, where the confirmation above
applies. Its description tells the agent to call it *instead of* running git inventory commands.

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

- `publish: "full" | "branches" | "off"` — **default `branches`** everywhere: label + branch +
  verdicts + dirty/locked flags, no paths. `full` (paths included) is an explicit opt-in a solo
  developer may choose for a private overlay; `off` disables the record entirely. The default is
  the same in private and shared mode so that switching an overlay from private to shared never
  starts publishing data that was previously local.
- `stale_after: "7d"`.

Machine labels are user-chosen and should not embed personal data; `doctor` warns when a label
equals the hostname or the OS username. `hunch workspaces forget <machine>` removes a retired
machine's record from the store (a normal, revertable memory move in `hunch log`).

## Security and privacy

This section is written for a security reviewer. It states the threat model, what leaves a
machine, and the control for each risk. Every control is a testable statement; Phase 1 ships the
tests named in the last column.

### What leaves the machine, and where it goes

- A workspace record leaves the machine **only** through the overlay repository the organization
  already configured for Hunch memory (`hunch private` / `hunch shared --repo <url>`) — a git
  remote under the organization's control, pushed with the developer's own git credentials over
  the transport git already uses. There is no Hunch-operated service, no telemetry, no third
  party, and no new network endpoint. With no overlay configured, nothing leaves the machine.
- In the default `publish: branches` mode the record contains: a random machine id, a user-set
  label, the OS platform name, the canonical repository identity (host + path, no credentials),
  branch names, commit SHAs, ISO timestamps, ahead/behind counts, dirty/locked booleans and the
  merged verdicts. Nothing else. Paths are added only under an explicit `publish: full`.
- The snapshot never reads the network. `--fetch` is an explicit opt-in and runs `git fetch
  --prune` with fixed arguments against the repository's existing remote only.

### Threat model and controls

| Risk | Control | Verified by |
| --- | --- | --- |
| Crafted `ws_*.json` in a cloned public `.hunch/` or a shared overlay (attacker-controlled input read automatically) | Strict Zod schema (`.strict()`, bounded lengths, regex-validated ids, `check-ref-format`-validated branch names), the existing per-record size cap (`MAX_JSON_RECORD_BYTES`) and the same symlink / FIFO / hard-link refusals `readTeamConfig` applies. An invalid record is skipped and reported by `doctor`; it is never partially applied. | schema fuzz tests; malformed/oversized/symlinked record fixtures |
| A stored record steering a destructive action (e.g. a record claiming a branch is merged) | Stored records are **display-only**. `prune --apply` re-computes the verdict from live git on this machine and acts on that only; it never reads `merged` from a record. Paths from *other* machines' records are never passed to any command. | test: a forged "merged" record must not cause a delete |
| Command injection through branch names / paths | git is invoked with `execFileSync` and a fixed argv (no shell), every ref is passed after `--`, values starting with `-` are rejected, and branch names must pass `git check-ref-format` before use. Paths used by `--apply` come from `git worktree list --porcelain` on this machine, never from a record. | argv-level unit tests with hostile names (`--upload-pack=…`, `-D`, spaces, newlines) |
| Git hook executing untrusted content | The post-checkout / post-commit blocks call the pinned `hunch` invocation with a constant argument list (`workspaces snapshot --quiet`); no argument is derived from repository content. Hook blocks are the same managed-block mechanism `hunch init` already uses, install only when the user runs `hunch init`, and are inspectable in `.git/hooks`. | hook-content snapshot test |
| Unattended destructive action | `--apply` is CLI-only, local-machine-only, `git branch -d` / `git worktree remove` without force flags, requires interactive confirmation or an explicit `--yes`, and never touches remote branches. The MCP tool is read-only. Nothing runs on another machine. | tests for each refusal path |
| Secret leakage into memory | Every string field passes the existing credential filters; remote URLs, commit messages, diffs, file names, author emails and environment variables are not recorded at all. A record that fails the filter is rejected, not trimmed. | credential fixtures rejected |
| Personal data | No hostname, OS username, home directory, hardware id or MAC address is recorded. Default label is `machine-<4 hex>`; `doctor` warns on a hostname/username label. `hunch workspaces forget <machine>` deletes a machine's record; the overlay's git history is the organization's own repository, subject to its retention. | field-level tests |
| Impersonation in a shared overlay (a teammate writing a record under another machine id) | Records carry no authority: they never gate a write, a merge or a delete, so a forged record can at most mislabel a row. The overlay's git commit author remains the audit trail. | documented; no code path grants trust to a record |
| Supply chain | No new runtime dependency. Node built-ins and git only. | `package.json` diff |
| Availability / performance | Hook snapshot is backgrounded, skips when the record is < 60 s old, is bounded to a fixed set of git commands with timeouts (the `timeout: 5_000` pattern in `src/extractors/git.ts`), and a failure never blocks the checkout or commit. | hook latency test |

### What a reviewer can inspect

- `src/extractors/workspaces.ts` — the complete list of git commands the snapshot runs, each
  with a fixed argv.
- `src/core/types.ts` `WorkspaceSchema` — every field that can exist in a record; the schema is
  `.strict()`, so nothing else can be stored.
- `src/integrations/hooks.ts` — the exact hook text installed.
- `hunch workspaces snapshot --dry-run --json` — prints what *would* be written, so a reviewer
  can see the record for their own machine before enabling publication.

## Phases

Each phase ships on its own, is tested under `test/`, and does not require the next.

**Phase 1 — single machine, local truth.** Record kind + strict Zod schema + migration no-op
(`src/core/types.ts`, `src/core/migrate.ts`); machine identity (`src/core/machine.ts`);
snapshot extractor (`src/extractors/workspaces.ts`: worktree list, branch list, upstream state,
ancestry and squash verdicts, dirty/locked); `hunch workspaces snapshot [--dry-run --json]`,
`hunch workspaces`, `hunch branches` reading the local store. Tests build throwaway repos with
real worktrees, merges, squash-merges and a deleted upstream, plus the hostile-input and
credential-filter tests listed in the security table. Exit criterion: on one machine, the three questions
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
   the whole point is that all clones on a machine report as one machine. Random, never
   hardware-derived.
2. **`publish: branches` (no paths) as the default in every mode.** Recommended: yes — paths
   are an explicit opt-in, so a private overlay later shared with a team never leaks a layout
   that was recorded under a different expectation.
3. **Snapshot never fetches by default.** Recommended: yes — hooks must stay offline-safe and
   fast; `--fetch` and `hunch workspaces snapshot --fetch` in a daily cron are the opt-ins. The
   `fetched_at` field tells the reader how fresh the `behind` / `upstream_gone` signals are.
4. **`--apply` scope.** Recommended: local machine only, live-verdict only, `-d` / no force,
   clean and unlocked only, interactive confirmation (or explicit `--yes`). No MCP write path.
