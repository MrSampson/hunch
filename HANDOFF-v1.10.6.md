# Handoff — v1.10.6 release, ready to finish

**Written:** 2026-08-09. **Nothing is published.** npm is still on 1.10.5.

## TL;DR — what's left

**The release gate never completed** — it was stopped manually before finishing
(reached the `test` stage, 148 tests, 0 failures, then killed). So the first step
is to re-run it. It is idempotent and safe to re-run from scratch.

```bash
cd /Users/nofarkulishevski/Documents/GitHub/hunch-latest
npm run gate:release                 # ~25 min; want "Release gate passed"
```

Only if it exits 0:

```bash
git push origin main
git tag -a v1.10.6 -m "v1.10.6 — search that couldn't find your own function names"
git push origin v1.10.6              # THIS publishes to npm
```

Do NOT skip the gate. It is the last check before an irreversible npm publish
(see the warning section below).

## State right now

| Thing | State |
|---|---|
| `main` (local + origin) | merged PR #58, at `a714701` |
| Release commit `671ebc9` | **committed locally, NOT pushed** |
| Working tree | clean |
| `package.json` | 1.10.6 |
| Tag `v1.10.6` | does **not** exist, local or remote |
| npm | **1.10.5** — nothing published |
| Release gate | **stopped before completion — must be re-run** |

The gate was run twice and interrupted both times (the first killed to avoid two
concurrent gates in one worktree, the second stopped manually). Neither reached a
verdict: the furthest either got was the `test` stage — 148 tests, 0 failures — so
`core-build`, `matrix-release-verification`, `architectural-conformance`,
`clean-install-rehearsal` and `production-dependency-audit` are UNVERIFIED for
commit `671ebc9`. Partial log: `/tmp/gate_v1106.log`.

Note: an earlier full gate DID pass (`release_1ed9047ed7f6`, all 12 stages) — but
that was on the PR branch BEFORE the release commit existed. It does not cover
the version bumps or the changelog/locale edits in `671ebc9`.

## What's in the release

6 commits since `v1.10.5`, but **only `359fcd6` ships code**. The rest are tests,
docs, and `.hunch/` graph captures.

`359fcd6` — five medium round-3 audit findings, each with a red/green receipt,
verified by an independent pass then an adversarial refutation pass:

- **#11** — the no-FTS5 fallback couldn't find identifiers. `_` is both a LIKE
  single-char wildcard and the dominant character in identifiers; `likeSearch`
  STRIPPED it, so `hunch_record_decision` was searched as `hunchrecorddecision`
  and matched nothing — on exactly the runtimes where that fallback is the only
  search there is. Now escaped with `ESCAPE '\'`, plus relevance ordering.
- **#5** — pre-edit grounding asserted BOTH sides of a topic collision.
  `renderGrounding` filtered per-decision instead of per-topic, so two live
  decisions on one topic each got an assertive bullet — and since each lists what
  it REJECTED, the agent was told both answers were right and each was forbidden,
  in the last context it sees before writing code. Now reported as UNRESOLVED.
- **#6** — escalations/SessionStart read the public store only, returning empty in
  unified mode for graphs living in the overlay. Fixed mode-aware (a blanket union
  would leak private records onto a public surface).
- **#12** — `g2ShadowQueue` anchored ancestry to a workspace pseudo-head, turning a
  git call into a throw.
- **#13** — behavior replay legs scored from the process exit code, so an unrelated
  sibling failure could record `behavior_confirmed` from another test's evidence.

Deliberately NOT fixed: #7 and #9, both REFUTED by the adversarial pass. #9 is
recorded as `fnd_bc2d9820cd` — a latent trap that arms at schema v3.

Also included: PR #58 — the MCP roots fixture now canonicalizes its temp root, so
6 tests that failed on **every macOS checkout** pass. CI never caught them because
Linux has no `/var -> /private/var` symlink.

## The release commit (`671ebc9`) — what it touched

The 5 files this repo's convention requires:

- `package.json`, `package-lock.json` — 1.10.5 → 1.10.6
- `plugin/.mcp.json` — pinned `hunch-exact` → 1.10.6
- `site/changelog.html` — new Aug 9 group, v1.10.6 row
- `tooling/changelog-locales.mjs` — +1 title in **he, ru, ar, es**

**The trap that was checked:** `changelog-locales.mjs` warns that titles map
POSITIONALLY to changelog rows, and a past mismatch (69 rows vs 64 titles)
silently truncated every localized changelog at v1.9.4 for five releases.
Verified 70 → **71 in lockstep** across all four locales via the repo's own
`countChangelogRows`; `test/changelog-locales.test.ts` passes 3/3.

**Needs a human eye:** the four translated headlines were authored by Claude, not
a native speaker. They're idiomatic rather than literal, but they ship publicly:

- he — חיפוש שלא מצא את שמות הפונקציות שלכם
- ru — Поиск, не находивший имена ваших собственных функций
- ar — بحث لا يعثر على أسماء دوالّك نفسها
- es — Una búsqueda que no encontraba los nombres de tus propias funciones

Fix them before pushing the tag if any read wrong — after publication they're permanent.

## ⚠ Before you push the tag

- `tags: ["v[0-9]*"]` triggers `.github/workflows/release.yml`.
- The `npm-publish` environment has **NO protection rules** — no manual approval.
  Pushing the tag publishes to npm on CI's verdict alone.
- CI re-runs `validate` + `platform-matrix-safety` (Windows + macOS) before the
  minimal `publish` job. 1.10.6 has no prerelease → dist-tag `latest`.
- npm unpublishing is heavily restricted. This step is effectively irreversible.

Push `main` BEFORE the tag, so the tagged commit exists on origin.

## Housekeeping already done

- Fetched + pruned 12 dead remote branches; `main` fast-forwarded 133 commits
- Deleted 6 fully-merged branches (each verified with `merge-base --is-ancestor`)
- Worktrees 5 → 3; removed a stale Jul-17 `dist/` from the primary worktree
- 4 `freeze/*` tags pin every loose end — nothing was lost

## Still open (not blocking the release)

- **`wip/mic-drop-md1-uncommitted`** (`68c70ae`) — 13 previously-uncommitted files
  incl. a novel `test/git-platform-portability.test.ts`. Built on a base missing
  `main`'s issue-#53 stranded-lock fix, so it needs a conflict-aware rebase, not a
  cherry-pick. Frozen, not pushed.
- **`rescue/pre-reconcile-2026-07-16`** (`716bcb7`) — decided AGAINST landing:
  its 151-line `sourceFiles.ts` duplicates `main`'s 441-line `repoSource.ts`,
  which has 9 issue codes vs 1 error class plus `assertCleanIndexedCode`.
  Tagged `freeze/rescue-pre-reconcile` if you disagree later.
- **`origin/claude/hunch-org-memory-zs4hcg`** — NOT abandoned. Dated 2026-08-08,
  a recording kit for the "What is Hunch" demo (VHS tapes, fixtures). Left alone.

## Note for next session

Your shell was in `/Users/nofarkulishevski/Documents/GitHub/hunch` on branch
`rescue/pre-reconcile-2026-07-16` — the branch we decided NOT to land. Work from
`hunch-latest` instead; that's where `main` and the release commit live.
