# Engineering Landscape Graph

Updated 2026-08-21. This document defines Hunch's durable side of the product-to-code landscape.
The graph remains the authority for engineering semantics inside a repository; it does not make
Hunch a runtime discovery service or cross-provider orchestrator.

The reciprocal ORC contract is
[`docs/ENGINEERING-LANDSCAPE.md`](https://github.com/davesheffer/orc/blob/main/docs/ENGINEERING-LANDSCAPE.md).
That document owns live discovery, authorized cross-repository traversal, task-scoped assembly and
execution evidence. The two documents describe one boundary from opposite sides.

## Product outcome

A developer should be able to start from a task, file, service or product capability and learn:

- what product and capability the code serves;
- which repositories, services, interfaces and data systems participate;
- how those resources connect and which contracts bind them;
- how the system is built, tested, deployed and operated;
- which decisions, incidents, constraints and lifecycle facts govern a change; and
- which other repositories may need a coordinated change.

The repository is not the root of this model. It is one implementation node beneath product,
capability and system identity.

## Ownership boundary

Hunch owns the **declared, durable and evidenced landscape**: what should exist, why it exists and
how it is expected to relate. ORC owns the **observed and actionable landscape**: what is currently
reachable, installed, authenticated, healthy and eligible for a Run.

A practical test is:

> If the fact remains useful when every process is stopped, Hunch may own it. If it changes when a
> process starts, connects, authenticates or becomes unavailable, ORC owns it.

Hunch may record that a repository requires a CLI, configures an MCP server or deploys a service.
It must not claim that the executable is installed, the MCP handshake currently succeeds or the
service is healthy. Those are time-bound ORC observations.

## One graph, four views

The Engineering Landscape is an additive view over the existing Hunch graph, not another graph
authority.

| View | Durable questions answered by Hunch |
| --- | --- |
| Product | Which product, domain and capability does this repository implement? |
| Architecture | Which systems, repositories, components, services, interfaces and data resources connect? |
| Delivery | Which pipelines, artifacts, migrations and deployment targets carry a change? |
| Operations | Which owners, runbooks, dashboards, SLO declarations and lifecycle states govern it? |

## Resource model

Use one versioned `resource` contract with an extensible `kind`; do not create a separate storage
engine or bespoke schema for every surrounding type.

Initial kinds:

```text
product           capability        domain
system            repository        package
component         service           worker
job               api               mcp_server
cli               event             database
queue             storage           external_system
pipeline          artifact          deployment_target
environment       team_ref          runbook
dashboard
```

`team_ref`, `runbook` and `dashboard` are credential-free engineering references. Hunch does not
ingest an organization's people directory, messages or CRM and does not become an organizational
knowledge gateway.

Each resource carries at least:

```text
resource_id       stable kind-qualified identity
kind              versioned resource kind
name              human-readable name
scope             repository/product/environment scope
locator           credential-free canonical locator when available
lifecycle         planned | active | deprecated | retired
criticality       optional engineering criticality
contract_version  optional compatibility/version declaration
provenance        source evidence and capture authority
currentness       evidence timestamp/revision and validity state
metadata          bounded kind-specific fields
```

Secrets, bearer tokens, private keys, passwords and unrestricted credential material never enter
the resource, its locator, graph edges, receipts or generated agent context.

## Relationship model

Initial relationship types:

```text
provides             belongs_to          implemented_by
contains             depends_on          invokes
exposes              publishes           consumes
reads_from           writes_to           builds
tests                deploys             deployed_on
owned_by             monitored_by        governed_by
source_of_truth_for  compatible_with     replaces
```

Every relationship has its own stable identity, source/target resource IDs, provenance,
currentness and optional environment/criticality/contract metadata. Direction is explicit. A
relationship inferred from a manifest is not silently promoted to human-confirmed architecture.

Existing Hunch decisions, constraints, bugs, findings, symbols and components link to landscape
resources through the normal graph. This allows one bounded query to connect `why` evidence with
product and system topology without duplicating either record.

## Repository-local landscape fragments

Each repository publishes only the fragment it can evidence. Stable external references connect
that fragment to other repositories and systems:

```text
repository:github.com/acme/payments-api
  belongs_to       product:commerce
  implements       capability:payments
  builds           artifact:payments-service
  consumes         event:customer-events/v2
  writes_to        database:payments
  depends_on       repository:github.com/acme/identity-sdk
```

Hunch does not need every referenced repository checked out and does not recursively assemble a
global organizational graph. It preserves the durable link and evidence. ORC authorizes and
follows the link, asks the relevant repository's Hunch provider for its own fragment, and assembles
only the bounded view required by the task.

## Deterministic discovery

Hunch may derive candidate resources and relationships from repository-local, reviewable sources:

- package manifests, scripts, binaries and dependency declarations;
- MCP configuration and expected capability declarations;
- Docker, Compose, Kubernetes, systemd and deployment manifests;
- CI workflows, artifact definitions and environment templates;
- OpenAPI, AsyncAPI, protobuf and schema/migration contracts;
- Git remotes, workspace manifests and submodules;
- ownership, runbook and dashboard references; and
- explicit Hunch decisions and human-vouched corrections.

Discovery is deterministic and records source revision, file/field evidence and confidence. An
unreviewed inference remains derived/candidate evidence. Missing runtime discovery never deletes a
durable declaration automatically.

## Delivery contract

Hunch exposes a bounded landscape fragment through the existing validated-delivery envelope. The
transport must preserve:

```text
fragment version and scope
resource and relationship IDs
selection rank and reason
provenance and currentness
required/optional and blocking state
source revision/content evidence
estimated token cost
omitted-item evidence
native delivery receipt identity
```

A future `hunch landscape <target-or-task>` CLI/MCP surface may make the view explicit, but it must
reuse the graph, ranking/currentness rules and receipt machinery. It must not become a second
context envelope or ORC-specific API.

## ORC integration

```text
repository task
  -> Hunch returns the relevant durable landscape fragment
  -> Hunch Memory transports the fragment and native receipt
  -> ORC follows authorized repository/resource references
  -> ORC combines other Hunch fragments + Git + live runtime + optional providers
  -> ORC freezes a task-scoped landscape snapshot
  -> build, independent verification and execution evidence
  -> verified drift becomes a Hunch finding/proposal, never an automatic rewrite
```

ORC may report that a declared service, CLI, MCP server or contract differs from reality. Hunch
stores that mismatch only as evidenced finding/proposed knowledge until the normal authority model
accepts it. Runtime observation cannot silently rewrite architecture.

## Implementation status and handoff

HLG-1 landed as the deliberately bounded contract slice before discovery and ORC consumption:

- introduce the versioned resource contract in `src/core/types.ts` and extend the existing edge
  contract for resource relationships;
- preserve the JSON source of truth through `src/core/migrate.ts` and `src/store/jsonStore.ts`;
- rebuild resource projections through `src/store/schema.ts` and `src/store/hunchStore.ts`;
- keep resource IDs and relationship IDs stable across reindex, ordering and clean clones;
- reject credentials and unrestricted secret material before persistence or delivery; and
- cover migration, validation, deterministic identity, public/private overlays and derived-index
  reconstruction in the focused store/migration tests.

The implementation uses `hunch.resource/1` records and `hunch.resource-relationship/1` edges in
the existing JSON graph. Schema generation 3 migrates legacy edges before validation; resource IDs
remain readable and deterministic in `resources/index.json`; SQLite `resources` and
`resource_relationships` are rebuilt projections. The acceptance fixture covers a
product/capability/repository/service/API/database chain plus an external repository and verifies
exact identity, provenance and currentness across write, read, reindex and restart. It also rejects
runtime-health fields and credential material anywhere in the durable resource/relationship record.

The same fixture proves that the fragment remains useful without ORC and that no runtime
reachability or health claim is inferred from a durable declaration.

The first HLG-2 discovery slice has landed. `discoverRepositoryLandscape` reads a caller-selected
exact commit, bounds and parses root/workspace package manifests, canonicalizes configured and
manifest-declared repository identity without retaining credentials or host paths, and returns
content-addressed `hunch.landscape-candidate/1` resources/relationships. Evidence names the exact
file/field/revision/content hash. Working-tree bytes cannot alter an exact-revision result;
repository-identity conflicts remain explicit and leave packages unbound. The extractor is pure and
never writes `.hunch` graph authority.

HLG-2 next adds one source family at a time, beginning with MCP declarations, under the same
candidate/issue envelope. HLG-3 then projects only reviewed graph records through the existing
delivery envelope; HLG-4 adds external-reference drift intake. ORC's aligned execution snapshot
explicitly rejects `hunch.landscape-candidate/1` and requires an accepted, current fragment plus its
native receipt before execution authority can be frozen.

## Non-goals

- live service health, MCP handshakes, installed CLI versions or authenticated sessions;
- secret or connection management;
- cloning, opening, mutating or coordinating foreign repositories;
- global cross-provider context assembly;
- workflow, agent/model or deployment routing;
- an organizational people/content warehouse; or
- a second graph beside the existing Hunch graph.

## Acceptance milestone

Given a task or repository target, Hunch can return a revision-current, budgeted and receipted
fragment connecting product → capability → system → repository → service/interface/data/delivery
resources, including declared cross-repository references and the relevant decisions/constraints.
The same fragment remains client-agnostic and useful without ORC; ORC can consume it without
reconstructing identity or provenance from prose.
