# The drift-gated wiki — architecture & patterns

How `hunch wiki` works and the five patterns behind it. This doc is itself
**grounded**: every section is pinned to the decision that governs it, so the
specs ledger grades it ✅ — and if any of these decisions is ever superseded,
`hunch drift` flags this file and the wiki adopts a healed copy until the prose
is fixed. The doc cannot silently rot.

Run the whole loop in ~15s: `npm run build && bash demo/wiki.sh`.

## 1. Derived view — the graph is the only truth

<!-- hunch:topic wiki.derived-view dec_710fd0fb4f -->

Wiki pages are a **rendered view** of the decision graph (same rule as the
SQLite index): components, live decisions with their rejected alternatives,
scoped invariants, bug history, relations. Pages carry no timestamps — identical
inputs produce byte-identical pages — and every cited decision is pinned with a
`<!-- hunch:topic … dec_id -->` marker, so supersession fires the established
doc-anchor drift on the wiki's own pages. Delete the wiki and regenerate it any
time; nothing is lost because nothing lives only there.

**Home pairing is the leak boundary.** A `WikiHome` binds *source* to
*destination* as one choice: the public home reads the PUBLIC store only and
writes `<repo>/wiki/`; `hunch wiki --private` reads the full union (overlay
included) and writes into the **overlay repo** — never the committed tree.
Committed grounding docs advertise the public wiki only. Rejected: an
`--include-private` flag writing union pages into the committed wiki — one
un-reviewed `git add` from a leak.

## 2. Deterministic freshness — one state machine, no schedules

<!-- hunch:topic wiki.freshness-closure dec_c205c26472 -->

Freshness is never "re-run an agent and hope." Every generated artifact —
component pages, adopted copies, the specs ledger, the README index — goes
through one state machine backed by a wiki manifest:

- **inputs hash** (graph records, doc grades, index rows) → moved = *stale*;
- **written-bytes hash** → a hand-edited or merge-mangled page grades *stale*
  ("edited by hand") and `--heal` restores the derived view;
- **page-key orphaning** → renames, `--dir` moves, deleted components, retired
  adoptions all clean up on `--heal`; nothing generated is ever stranded.

`hunch drift` names exactly what moved (advisory), `hunch wiki --heal`
regenerates only that, and `hunch wiki --check` is the CI gate (green no-op on
repos that never adopted a wiki).

## 3. The specs ledger — docs graded, not guessed

<!-- hunch:topic wiki.specs-ledger dec_a2899939d9 -->

Every markdown doc in the repo is graded **deterministically** against the
graph — no LLM, no semantic guessing: **✅ grounded** (pins resolve to current
decisions), **⚠ stale** (superseded pin, proposed-but-shipped marker, dead code
refs — with the exact issues), **◻ unverified** (no anchors; Hunch can't vouch
either way). `wiki/specs.md` is the ledger; component pages link their related
docs with grades.

**Adoption: the wiki takes over stale docs.** A ⚠ doc gets a wiki-managed copy
under `wiki/docs/`: pins re-pinned to the current decision (only inside their
markers — prose is never rewritten), a "🧭 Graph correction" callout after each
healed pin quoting the current decision and what it rejected, all grading
issues in a banner. The **original file is never touched**; heal it (or delete
it) and the copy retires automatically on the next heal. One readable truth per
doc, always.

## 4. Jurisdiction — a store only grades what it can see

<!-- hunch:topic wiki.doc-grading-jurisdiction dec_9b8d8aade0 -->

A pin to a superseded decision whose only successor lives in the **private
overlay** grades *unverified* publicly — not stale. Grading it stale would leak
that a hidden successor exists; grading it grounded would vouch for prose the
graph knows is outdated. So: the public home doesn't adopt it and prints
nothing; the private home grades it stale, adopts it into the overlay wiki, and
heals the copy with the private decision. The same doc can honestly hold two
grades in two jurisdictions.

## 5. Prose rides the subscription, structure stays deterministic

Optional per-page "Overview" prose comes from `SynthProvider.draftProse` — the
same subscription-only CLI path as synthesis (API keys stripped), feature-
detected, template fallback on any failure. The freshness hash covers **graph
inputs only**, never LLM output, so nondeterministic prose can't fake
staleness. Everything drift-bearing (pins, invariants, structure, corrections)
is rendered deterministically around it.

## Command crib

```bash
hunch wiki                    # generate/refresh all pages (public store → wiki/)
hunch wiki --no-llm           # deterministic template pages only
hunch wiki --heal             # regenerate ONLY stale pages; retire orphans/adoptions
hunch wiki --check            # CI gate: exit 1 if anything is stale
hunch wiki --private [...]    # full graph → the PRIVATE overlay repo's wiki
hunch drift                   # names every stale artifact (wiki-stale, advisory)
```

**This repo's own policy:** the public wiki is never committed here (`wiki/` is
gitignored + a blocking constraint); the full-graph wiki lives in the private
overlay repo via `hunch wiki --private`.
