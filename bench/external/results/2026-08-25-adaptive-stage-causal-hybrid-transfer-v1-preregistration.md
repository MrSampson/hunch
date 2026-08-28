# Adaptive causal-slot hybrid transfer v1 — preregistration

Status at lock: the graph-conditioned weights and one-slot allocation were developed only on consumed datasets. Holdout task text, source snapshots, and fix diffs have not been inspected. Repository metadata and aggregate merged-PR counts established feasibility only.

## Frozen inputs

- Baseline adaptive ranker SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`
- Causal hybrid SHA-256: `3c9afa460042b109c6505c9368ef70fabce528a155e921898a475d1e7a55e42b`
- Untouched repositories: `nestjs/nest` (`master`) and `honojs/hono` (`main`).
- Eight tasks per repository, selected deterministically newest-first from up to 500 recently updated closed PRs.

## Task selection

A task must be a non-draft merged PR into the named default branch, have a non-empty body, change between one and eight files according to GitHub PR metadata, contain validation/parsing/serialization/coercion/transformation/request/response/routing vocabulary, and either have an explicit defect word in the title or an explicit current-versus-expected phrase in the body. Documentation, maintenance, dependency, test-only, style, refactor, release, and version-prefixed titles are excluded. The first eight eligible PRs per repository are selected with no manual substitution.

Both rankings use title plus body and the same pre-fix source snapshot. The baseline top five and causal-hybrid top five are frozen before requesting any diff. A task is symbol-scorable only when the fix changes at least one pre-existing top-level declaration in non-test TypeScript source; new-only declarations are excluded.

## Locked hybrid

1. Build the existing adaptive ranking.
2. Build a conservative static call graph from the same source using the repository's tree-sitter parser and relative-import resolver.
3. Seed the graph with up to three leading adaptive declarations and non-generic identifiers explicitly called, dotted, or backticked in the issue.
4. Score bounded callers and callees up to four hops away using direction, distance, and fan-in/fan-out centrality.
5. Preserve adaptive ranks 1–4 exactly. Use only rank 5 for the highest causal candidate not already present.

No project code is executed. The graph is derived in memory and is not persisted.

## Promotion rule

Promote the one-slot hybrid only if all conditions hold:

1. At least 10 tasks are symbol-scorable across both repositories.
2. The hybrid rescues at least two baseline top-five misses.
3. The hybrid loses zero baseline top-five hits.
4. At least one rescue occurs in each repository.

Top-one file output is unchanged by construction. Exact-owner output remains disabled. A failed rule is recorded and is not tuned and rescored on this holdout.
