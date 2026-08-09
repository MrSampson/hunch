# Handoff — 2026-08-09 session (web), resume at the office

**Written:** 2026-08-09, from a Claude Code web session on branch
`claude/hunch-org-memory-zs4hcg`. Everything described here is pushed. This note
complements `HANDOFF-v1.10.6.md` (the release half is still open — see §1).

## TL;DR — what's left, in order

1. **Finish the v1.10.6 release** (unchanged from the release handoff): gate →
   translations eyeball → tag `671ebc9` → push tag. npm is still on 1.10.5;
   no tag exists. Main has moved 4+ commits past the release commit, so gate
   and tag the release commit itself:
   ```bash
   git fetch origin && git checkout 671ebc9
   npm run gate:release        # ~25 min, want "Release gate passed"
   git tag -a v1.10.6 671ebc9 -m "v1.10.6 — search that couldn't find your own function names"
   git push origin v1.10.6     # publishes to npm — irreversible, no approval gate
   ```
2. **Review + merge the `claude/hunch-org-memory-zs4hcg` branch** — it carries
   ONE unmerged commit: `334215f` **premise decay** (see §3). Product code;
   should ride the next release train (1.10.7), not a hotfix push.
3. **After the next npm release** (first one carrying `mcpName`, i.e. 1.10.7):
   publish to the official MCP registry:
   ```bash
   mcp-publisher login github && mcp-publisher publish   # reads ./server.json
   ```
   (1.10.6 was published-side prepared BEFORE `mcpName` existed — the registry
   validates against the live npm tarball, so it must wait for 1.10.7.)

## 1. State right now

| Thing | State |
|---|---|
| npm | **1.10.5** — v1.10.6 still unpublished, tag does not exist |
| `main` | `5c2c36b`+ — release commit `671ebc9` plus this session's site/docs/feature work |
| Branch `claude/hunch-org-memory-zs4hcg` | main + `334215f` (premise decay) — the ONLY unmerged work |
| Vercel | deploys from main — new pinned blog post, mobile menu, /compare are live |
| MCP registry | manifest ready (`server.json` + `mcpName` + drift-guard test); publish blocked until 1.10.7 is on npm |

## 2. What landed on MAIN this session

- **Blog**: pinned release post "memory you never have to babysit" (v1.9.4 —
  NOTE: goes stale the moment 1.10.6 publishes; a 1.10 post is queued, §4).
- **Site**: mobile burger menu on all 26 pages/locales (`navigation.js`);
  `/compare` page (category-level, verifiable properties only), linked from
  the home footer.
- **`hunch check --format sarif`** — SARIF 2.1.0 across every gate family;
  severity-truth levels (error = would fail strict); exit codes unchanged.
- **MCP registry prep** — `server.json`, `mcpName`, `test/mcp-registry.test.ts`
  (pins manifest version to package.json), `docs/mcp-registry.md`.
- **Competitive landscape** — dated 2026-08-09 update in
  `docs/competitive-landscape.md`: Roam v14 (top threat), Memco's Spark pivot,
  MCP 2026-07-28 stateless spec, threat ranking, actions.
- **Strategy** — `docs/strategy-driftbench.md`: own the category's measuring
  stick (public preregistered benchmark + starter invariant packs). Status
  proposed; rejected alternatives on record.
- **`tooling/competitive-watch.mjs`** — no longer dies on a bad token;
  degrades to unauthenticated with explicit skip notes.
- **Video kit** — `video/`: rigged orders-demo (two-stage `setup.sh`), three
  VHS tapes, recording-day README. All command sequences verified on 1.10.5-era
  source; re-verify outputs after 1.10.6 ships.

## 3. The branch: premise decay (`334215f`) — review before merging

Decisions can record the checkable REASONS they rest on: optional
`premises[]` (claim + at most one deterministic check: `path_absent` /
`path_exists` / dated `review_by` attestation). A dead premise NEVER changes
authority — it raises an inline escalation on all existing surfaces
(`hunch escalations`, `hunch_escalations`, `hunch_now`, SessionStart) and an
advisory `premise-stale` drift kind. Cannot-evaluate never reads as holds.
Verified end-to-end: escalation fires when the premised path appears /
attestation expires; `conform --strict` still blocks while premises are dead.
10 new tests (`test/premises.test.ts`); typecheck + neighboring suites green.

**On merge, do two things:** run `/capture` to record the decision itself
(suggested topic `memory.premise-decay` — the red-teamed design rationale is in
this session's transcript: escalation-only authority, attestation-fatigue
scope, prior art = architectural-assumption research, positioning = first to
productize), and consider premises for 1–2 of the repo's own blocking
constraints as the dogfood.

## 4. Open queue (not blocking anything)

- **`wip/mic-drop-md1-uncommitted`** (`68c70ae`) — still the one stranded
  item from the release handoff; needs a conflict-aware rebase onto main.
- **Verify the MCP server against the MCP 2026-07-28 stateless spec** —
  action from the landscape update; session/roots assumptions are the risk.
- **1.10 blog post** — refresh the pin after 1.10.6 publishes ("the merge that
  quietly undid your bug fixes" is the material).
- **LinkedIn posts** — final drafts in this session's transcript: EN
  (junior + AI, no emojis) and HE ("how it's built", friend-tone, concise).
- **Video recording day** — everything scripted; needs a Mac, `vhs`, mic.
- **DriftBench build** — awaiting go/no-go on `docs/strategy-driftbench.md`.
- **Monthly watch**: `GITHUB_TOKEN="$(gh auth token)" npm run research:competitors`.

## ⚠ Reminders carried over

- The npm-publish CI environment has NO protection rules — pushing the tag
  publishes on CI's verdict alone; push `main`'s release commit refs first
  (already done) and never skip the gate.
- The four translated v1.10.6 changelog headlines ship permanently — eyeball
  before tagging (they're listed in `HANDOFF-v1.10.6.md`).
