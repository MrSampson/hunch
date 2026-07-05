# We let the AI audit its own memory tool. It was using 4 of 19 tools.

*Hunch's whole pitch is that an AI assistant grounded in your decision graph makes better
changes. So we asked the obvious uncomfortable question: is the assistant actually USING the
graph? We put an agent inside Hunch for two weeks of real feature work, then asked it to audit
its own experience — honestly. The answer shipped as v1.3.0.*

---

## The audit nobody runs

Every memory product measures recall benchmarks. Almost nobody measures the thing that decides
whether memory matters at all: **does the agent reach for the right tool at the right moment,
or does it fall back to grep?**

So after two weeks of an agent building real features inside this repo — the wiki, the specs
ledger, doc adoption — we asked it to review its own tool usage. The honest count: **4 of 19
`hunch_*` tools used.** Not because the data was missing. The graph had the answers. The entry
points whiffed at the moment of decision.

## What it filed (every finding has a decision id in the public graph)

**1. The grounding tax.** The pre-edit hook injects the relevant decisions before every file
edit — the best grounding the agent had ever worked with, its words — and it injected the
*same* 10–16KB block on every edit to the same file. Twenty-plus times per session. The cost
of being grounded was competing with the work (`dec_7cce5bcd8a`).

**2. The task-shaped entry point shrugged at task-shaped input.** `hunch_context("improve
retrieval ranking")` returned *empty* — while the graph held a decision literally titled that,
one search away. It only resolved file paths and symbols (`dec_39bc7c8bee`).

**3. Ranking lost to keyword luck.** A runbook written minutes earlier ranked below an old
release runbook for its own trigger phrase. When ranking misses, agents grep — the exact
failure the graph exists to prevent (`dec_e622668785`).

**4. The gate blocked its own honest edits.** Scope-only blocking rules denied *every* edit
in guarded directories, including invariant-preserving ones — pushing work outside the tools
the gate was meant to keep honest (`dec_57e3dcca52`, `dec_5141920439`).

## What shipped, with numbers

- **Injections dedupe per session** — full context once, a one-line delta on identical
  repeats (~100× smaller). Any record change re-sends the full block; the deny path never
  dedupes. Sessions now *open* with an orientation: recent decisions, live roadmap.
- **`hunch_context` falls back to search** on task phrases — the closest graph matches
  instead of an empty brief. The tool list agents see is now grouped by *moment* (orient →
  design → edit → commit → after), covering the full surface instead of 9 of 19.
- **Retrieval ranks by what the graph knows** — live beats superseded, human-vouched beats
  drafted, recent beats ancient, all with bounded floors so history dims but never vanishes.
  And when a query only matches a *superseded* decision, the topic's **current** decision
  surfaces right above it. Measured on a committed golden set: **Recall@10 90% → 100%, MRR
  +14%** — and that eval now gates every future retrieval change in CI. No model in the
  ranking path.
- **Every blocking rule is content-matched** — the gate denies the edit that actually
  re-introduces the violation, not every edit near it. The flow-shaped invariant that resists
  text matching became conformance predicates instead: `hunch conform` now *proves* the JSON
  store never reads through SQLite, on every run.
- **Duplicate drafts die before the LLM is called.** Record a decision, commit the code —
  previously the post-commit hook re-drafted the same content as review-queue noise (7 of 14
  queued drafts, measured). Now a recent human-confirmed decision covering the commit's files
  skips the draft entirely, with a named receipt.

## The part we didn't expect

Halfway through, the eval gate flagged a regression — in *our own golden set*. A test case
expected a decision we had **superseded that same day**. Golden sets rot exactly like docs do.
The fix was the same discipline the product preaches: expectations follow the supersession
chain, and the topic-chain promotion means even a stale query surfaces the current truth.

Every finding above was recorded as a *proposed* decision — which made it appear on the
roadmap (`hunch now` renders live proposed decisions; ship one and it leaves by itself). Two
weeks later the roadmap emptied itself through supersessions. The changelog for v1.3.0 is the
first we've written where **every claim resolves to a decision id** in the committed graph.

## Try the loop

```bash
npm i -g @davesheffer/hunch
cd your-repo && hunch init   # advisory by default — nothing blocks until you say so
hunch now                    # what happened + what's next, from the graph
```

The audit prompt that started all this is one your own assistant can answer today: *"what's
missing for you to work from the graph instead of grepping?"* Ask it. Record what it says as
proposed decisions. Watch your roadmap write itself.
