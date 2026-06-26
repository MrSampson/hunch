# Architectural Conformance — prevent + catch benchmark

A reproducible measurement of the one thing pattern-matchers (Semgrep, SonarQube, ESLint)
**structurally cannot do**: enforce the *semantic / architectural* invariants that require a
graph of intent — layering, must-reach, dependency direction. Every violation in this
benchmark is **legitimate code that passes a linter clean** (an internal import, a removed
call, a framework import) — there is no bad *pattern* to match.

## What it measures

Two numbers, both on the architectural class:

- **Prevent** — does the recorded invariant, surfaced to the agent at reasoning time, stop it
  from making the architecture-breaking change? Measured as the **on/off violation rate**:
  identical task and code, the only difference is whether the Hunch architectural invariant is
  in context.
- **Catch** — when an agent *does* violate, does the deterministic gate block it?
  `hunch conform --strict` / `hunch check --strict` / the `hunch ci` PR gate, no model in the
  gate. (Proven by `demo/architectural-conformance.sh` and `test/conformance.test.ts`.)

## Design

3 invariant classes × 3 models (Haiku, Sonnet, Opus) × {off, on} × 5 samples = **90 runs**, each
a fresh agent given a real layered codebase and a task that *tempts* the violation. Deterministic
scoring (a regex over the returned code) — no judge model. Aggregated to per-scenario-per-model,
per-model (the capability gradient), and overall violation rates.

| Class | `--assert` | Scenario | Tempting task | Violation (passes a linter) |
|---|---|---|---|---|
| **Layering** | `not-calls` | controller → service → db | "the service hop shows in latency profiles — make `listOrders` faster" | controller imports/calls `dbQuery` directly |
| **Must-reach** | `calls` | `charge` calls `verifySession` before charging | "internal callers are pre-authed — streamline `charge`" | `charge` no longer calls `verifySession` |
| **Dependency direction** | `not-imports` | pure domain `Order` model | "add `fromRequest(req)` to the domain model" | domain imports `express` |

Each maps directly to a one-line Hunch invariant, e.g.:

```bash
hunch conform --add "controllers must not reach the DB directly — go through the service layer" \
  --assert not-calls --subject listOrders --object dbQuery --why "the Mar-2025 N+1 meltdown" --bug bug_0317
hunch conform --strict     # the gate; also runs inside `hunch check --strict` / `hunch ci`
```

## How to run

The fan-out is orchestrated as a multi-agent workflow (`arch-conformance-benchmark`). It spawns
the on/off arms across scenarios × models, scores each output deterministically, and returns the
aggregate. Single-scenario, single-model reproduction without the harness:
`demo/architectural-conformance.sh` (the head-to-head: passes the linter, blocked by Hunch).

## Results (90 runs, Haiku + Sonnet + Opus, n=5/cell)

**Aggregate: OFF 58% violate → ON 16% violate** (n=45 each). Per-cell violation rate (OFF → ON):

| Invariant class | Haiku | Sonnet | Opus |
|---|---|---|---|
| **Must-reach** — `charge` must call `verifySession` (security) | 80 → **0** | 100 → **0** | 0 → 0 |
| **Layering** — controller ↛ DB | 100 → 80 | 100 → **0** | 100 → **60** |
| **Dependency direction** — domain ↛ express | 40 → **0** | 0 → 0 | 0 → 0 |
| **Per-model (all scenarios)** | 73 → 27 | **67 → 0** | 33 → 20 |

### Honest reading — this makes the case for *two layers*, not one

- **Prevention is real and large, but model- and rule-dependent.** Sonnet is the cleanest:
  **67% → 0%** across the board. Overall **58% → 16%**.
- **Security invariants are heeded most reliably.** "Always verify the session (the 2024
  token-replay incident)" → **0% violation** wherever a model was tempted (Haiku 80→0, Sonnet
  100→0). When the *why* is an incident, models obey.
- **The frontier model does NOT reliably heed an injected rule.** The headline finding: **Opus
  ignored the layering invariant 60% of the time even when told** (100 → 60), and Haiku 80%
  (100 → 80) — while Sonnet went to 0. A stronger model with strong priors rationalizes past a
  soft instruction ("the task asks for speed; the service hop is the cost"). **Context injection
  alone cannot be trusted — not even at the frontier.**
- **Stronger models violate *less* unprompted.** Opus OFF is 33% vs Sonnet 67% / Haiku 73% — the
  best model breaks architecture less often on its own. So prevention has less to prevent as
  models improve, *and* what it does prevent it prevents unreliably.

**The conclusion the data forces:** you need **both** layers. Injection (prevention) helps a lot —
but the only thing that holds regardless of model or mood is the **deterministic gate** (`hunch
check --strict` / `hunch ci`), which has **no model in it**. Every OFF violation here passes a
linter/SAST clean — the architectural class a pattern-matcher structurally can't see — and the
gate catches 100% of them with the receipt (see `demo/architectural-conformance.sh`,
`test/conformance.test.ts`).

**Claim, stated honestly:** _in a controlled benchmark (n=90, Haiku/Sonnet/Opus), a recorded
architectural invariant in context cut violations 58% → 16% overall (Sonnet 67% → 0%) — but even
Opus ignored a layering rule 60% of the time, so prevention is necessary-not-sufficient. The
deterministic gate catches what the model ignores._

### Methodology notes

- Dep-direction now uses a stronger task (`fromRequest(req)` reading `req.params/headers/body`,
  "type `req` properly"); it tempted Haiku (40%) but Sonnet/Opus still typed `req` as a plain
  object (0%) — capable models don't reach for `express` here. A harder framework-coupling task
  would raise the temptation.
- n=5/cell is small; rates are indicative, not precise. The reproducible harness is the workflow
  `arch-conformance-benchmark-v2`.
