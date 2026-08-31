# Project DNA Engine

Project DNA is Hunch's evidence-bound model of **how a repository communicates and works**. It is not a model persona and it is not a second memory store.

The durable architecture remains:

```text
committed repository evidence
        │
        ▼
Hunch Project DNA
  deterministic observed traits
  confidence + exact revision + evidence hashes
        │
        ▼
validated Hunch delivery
        │
        ▼
Hunch Memory
  transport/isolation/durability only
        │
        ▼
host context assembly (for example ORC)
        │
        ▼
policy-selected agent
```

## Authority boundary

A Project DNA trait is an **observation** until separately promoted through Hunch's existing reviewed durable-knowledge mechanisms. DNA may influence orientation, wording and advisory match scoring. It may not create or override a Decision, Constraint, Finding, policy, conformance rule or execution authorization.

The first implementation is intentionally network-free and model-free. `discoverProjectDna(root, revision)` reads only:

- up to 200 non-merge commit subjects reachable from one exact commit;
- bounded committed convention files such as `CONTRIBUTING.md`, PR templates, `AGENTS.md` and `CLAUDE.md`;
- no dirty worktree state;
- no GitHub API, review comments, user profile, transcript, model output or private global state.

This makes the profile reproducible for a source revision and safe to transport as provider evidence.

## Contract

The canonical library contract is `hunch.project-dna/1` in `src/core/projectDna.ts`.

A profile contains:

- `profile_id`: content-addressed profile identity;
- `repository_id`: clone-stable, opaque repository-lineage identity derived from root commits;
- `repository_revision`: exact Git commit;
- bounded history/source counts;
- ordered traits;
- a content seal.

Each trait contains:

- stable trait ID;
- category (`communication`, `engineering`, `review`, `culture`, `vocabulary`);
- stable key;
- concise claim;
- confidence;
- explicit observed/current/non-contradicted state;
- one or more exact-revision evidence references with content hashes.

Every evidence reference is labelled `committed-repository` with repository visibility. Hunch never
puts dirty-worktree bytes, credentials, filesystem paths, ambient GitHub data or model output in the
profile.

The first deterministic discovery signals include:

- Conventional Commit prevalence;
- title terminal-punctuation convention;
- lowercase descriptive-title convention;
- issue-reference prevalence when strongly established;
- repeated repository vocabulary in commit subjects;
- explicit committed expectations around tests, focused changes, backward compatibility, documentation and explaining PR rationale.

A signal is emitted only after a bounded threshold is met. Small histories do not manufacture communication culture.

## Project Match

`evaluateProjectDnaMatch(profile, artifact)` produces `hunch.project-dna-match/1`.

Only traits with a deterministic check for that artifact participate in the score. Orientation-only traits are retained with `applicable: false`; they do not silently become pass/fail guesses.

Examples of currently checkable traits:

- commit subject follows the observed Conventional Commit form;
- title follows terminal punctuation convention;
- descriptive title follows observed lowercase convention;
- expected issue reference is present;
- a PR body contains an explicit rationale signal when the repository has an evidence-backed `pr.explain_why` trait.

The match score is advisory. It must never block a commit/PR by itself and must never be presented as proof of maintainer acceptance.

## Agent and CLI surfaces

The same canonical contract is available without writing memory:

```text
hunch dna inspect [--ref <commit>] [--json]
hunch dna match --kind <commit|pull_request|issue|message> --title <text> [--body <text>] [--ref <commit>] [--json]
hunch dna context [--ref <commit>] [--traits <count>] [--json]
hunch dna diff <from> <to> [--json]
```

Programmatic consumers import the stable `@davesheffer/hunch/project-dna` entry point. MCP clients use
`hunch_project_dna` for the sealed profile, `hunch_project_dna_delta` for drift, and
`hunch_project_match` for an explainable artifact evaluation. Normal `hunch_context` delivery now
adds the same bounded DNA supplement after ranked memory when budget remains. These surfaces never
adopt traits, mutate the graph or grant enforcement authority.

## Drift and currentness

DNA does not mutate in place. A profile belongs to one exact repository revision. A newer revision produces a newly sealed profile. Consumers can therefore distinguish:

```text
same profile_id       -> exact same observed DNA
new profile_id        -> evidence set and/or derived traits changed
old repository_revision -> stale for a newer checkout unless explicitly requested for history
```

This is the anti-drift foundation. Later continuous learning should compare profiles and surface trait changes as reviewable deltas rather than rewriting historical DNA.

## Relationship to Repository Intelligence

Project DNA answers:

> How does this repository demonstrably communicate and work?

Repository Intelligence may later answer:

> What might those signals imply about risk, trajectory or likely maintainer reaction?

Those inferred hypotheses must live above DNA, carry separate confidence/evidence and never silently write back into the factual DNA profile.

## Cross-product contract map

| Layer | Owns | Must not own |
| --- | --- | --- |
| Hunch | inference, profile/match/delta schemas, seals, bounded delivery | persistence tenancy, final prompts, execution authority |
| Hunch Memory | authenticated store scope, immutable snapshots/deltas, compatibility transport | inference, trait ranking changes, policy promotion |
| ORC | source authorization, revision binding, role-shaped context, receipts, fallback | rewriting Hunch evidence or treating DNA as authority |

## Next production slices

1. ~~Thin CLI/MCP projections over the canonical library contract.~~ Landed: read-only CLI and structured MCP surfaces share the sealed core contract.
2. ~~Delivery-envelope integration with a bounded DNA orientation budget.~~ Landed in normal MCP context delivery.
3. Hunch Memory additive transport that preserves the Hunch profile/match envelope without interpreting it.
4. ORC ContextAssembler integration as a distinct Hunch-derived Stage section, preserving provider provenance and host-owned final budget.
5. Optional host-provided review/PR evidence intake through a bounded candidate contract; no ambient GitHub scraping inside Hunch core.
6. ~~Profile-delta/currentness reporting.~~ Sealed deltas landed; repository-scale validation, including the Infection pilot, remains.

The implementation order is intentional: semantics and evidence are frozen before transport and orchestration adapters consume them.
