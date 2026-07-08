# First-class local-model / OpenAI-compatible synthesis provider

**Origin:** [MrSampson/hunch#3](https://github.com/MrSampson/hunch/issues/3)
**Companion:** [#2](https://github.com/MrSampson/hunch/issues/2) — multi-language code awareness (Python), merged in [#6](https://github.com/MrSampson/hunch/pull/6)
**Status:** Approved, pending implementation plan

## Problem

Hunch's LLM synthesis is subscription-CLI-only, by explicit design (`src/synthesis/provider.ts`):

```
const PROVIDERS = [ClaudeCliProvider, CodexCliProvider, CursorCliProvider, DeterministicProvider];
// "There is intentionally NO API-key provider."
```

Each concrete provider shells out to a subscription CLI (`claude -p` / `codex exec` / `cursor-agent -p`) and strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` (or `OPENAI_API_KEY`) to force flat-rate subscription billing — enforcing `con_2ce3f2a547` ("synthesis must run on subscription, never pay-per-token API"). An org without any of those subscriptions — or one that wants a self-hosted/local model for cost, privacy, or air-gap reasons — has no path to a local endpoint and gets only the `deterministic` no-LLM fallback: every `backfill`/`sync` run reports `0 via LLM`.

A proof of concept (impersonating `cursor-agent` to forward stdin to a local Ollama's `/api/chat`) confirmed the shape fits cleanly: a local `qwen3.6:35b` model returned valid decision JSON that Hunch's existing `decisionDraftFromText` extractor accepted unchanged. This issue makes that path first-class instead of a shim, and gives it its own configurable timeout — the `cursor-agent` provider's hardcoded 45s cap is documented as too tight for large local models.

## Goals

1. Add an opt-in provider that speaks the OpenAI chat-completions wire format over HTTP, so it works against any self-hosted server that implements it (Ollama's `/v1` compatibility layer, vLLM, LM Studio, llama.cpp server, ...) — not a narrow Ollama-only client.
2. No API key required to drive synthesis (`HUNCH_SYNTH_API_KEY` optional, omitted for keyless local servers).
3. A configurable request timeout distinct from the existing CLI providers' hardcoded caps (`cursor-agent`'s 45s in particular).
4. Zero change to default behavior when the new env vars are unset — existing subscription-CLI users see no difference in provider selection, ordering, or output.
5. Feed the existing `decisionDraftFromText`/`bugDraftFromText`/`verdictFromText` extractors unchanged — the new provider's `run()` output is plain text, mapped through the same pipeline as the CLI providers.

## Non-goals (explicitly out of scope)

- **Dual wire-format support.** No native-Ollama `/api/chat` client alongside the OpenAI-compat one. Modern Ollama already exposes an OpenAI-compatible endpoint; one code path covers it and every other OpenAI-compatible self-hosted server.
- **A new SDK dependency.** Built on Node's global `fetch` + `AbortController` (Node ≥22.13, already the engines floor) — no `openai` package.
- **Streaming responses.** Single-shot `stream: false`, matching how the CLI providers already work (one prompt in, one text blob out).
- **Special-casing deep-synthesis ensemble (`--deep`) or the Critic pass (`verifyDecision`) for this provider.** Both already generalize over any `SynthProvider`; the new provider participates for free once it implements the interface — no `selectWorkers()`/`selectVerifier()` changes needed.
- **Retry/backoff policy beyond what `verifyDecisionSafe` and the existing safe-wrapper fallback already provide.** A failed HTTP call throws and the caller falls back to `deterministic`, exactly like a CLI provider whose binary crashes.

## Design

### Base-class rename: `CliSynthProvider` → `PromptSynthProvider`

`CliSynthProvider` today is abstract over exactly one method — `protected abstract run(prompt: string): Promise<string>` — and provides `draftDecision`/`draftBug`/`draftProse`/`verifyDecision` on top of it, using the shared `SYSTEM`/`DECISION_TOOL`/`jsonInstruction` prompt-building and `decisionDraftFromText`/`bugDraftFromText`/`verdictFromText` mappers. Nothing about that contract is CLI-specific — it only cares that `run()` turns a prompt string into text, by whatever transport.

Rename it `PromptSynthProvider` and widen its doc comment to describe both transports it now backs (spawn a subscription CLI; POST to a local HTTP endpoint). `ClaudeCliProvider`, `CodexCliProvider`, `CursorCliProvider` change their `extends` clause only — no other change. `CliSynthProvider` is not exported outside `provider.ts` (confirmed: no references in `src/` or `test/` beyond the file itself), so this is a safe, purely internal rename.

`runCli()` (the spawn-based helper `CodexCliProvider`/`CursorCliProvider` call) stays on the renamed base, unused by the new provider — it does not conflict with anything HTTP-based.

### New provider: `OpenAICompatProvider`

```ts
export class OpenAICompatProvider extends PromptSynthProvider {
  readonly name = "openai-compat";

  async available(): Promise<boolean> {
    return !!process.env.HUNCH_SYNTH_BASE_URL && !!safeModel(process.env.HUNCH_SYNTH_MODEL, undefined);
  }

  protected async run(prompt: string): Promise<string> {
    // Reads HUNCH_SYNTH_BASE_URL/MODEL/API_KEY/TIMEOUT_MS fresh, not cached in
    // constructor fields — see rationale below. POST {baseUrl}/chat/completions,
    // AbortController-driven timeout, Bearer auth only if apiKey is set. Parses
    // choices[0].message.content.
  }
}
```

- **`available()`** requires *both* `HUNCH_SYNTH_BASE_URL` and `HUNCH_SYNTH_MODEL` — no network probe. Unlike the CLI providers' cheap `--version` check, probing an HTTP endpoint (possibly a cold local model) on every availability check would add latency to every `sync`/`backfill` call; checking env-var presence is instant, and a genuinely unreachable/misconfigured endpoint fails at `run()` time and degrades to `deterministic`, exactly like a CLI provider whose binary errors.
- **Env vars are read fresh on every call, not cached in constructor fields.** `PROVIDERS` is a module-level array of singletons constructed once at import time; if `HUNCH_SYNTH_BASE_URL` etc. were captured into constructor fields (as `ClaudeCliProvider.model` does for `HUNCH_SYNTH_MODEL`), the singleton would only ever see whatever the env looked like at that one import moment. That's invisible in production (env is set once, before the process starts) but breaks testability: `isAvailable()` also memoizes each provider's `available()` result process-wide, so a test suite that toggles these env vars between cases needs `available()`/`run()` to re-read `process.env` each call. This mirrors `selectProvider()`'s own style, which already re-reads `HUNCH_SYNTH_PROVIDER` on every invocation rather than caching it. The class is exported (unlike the CLI providers) specifically so tests can construct fresh instances directly.
- **`run(prompt)`** issues:
  ```
  POST {baseUrl}/chat/completions
  Content-Type: application/json
  Authorization: Bearer <HUNCH_SYNTH_API_KEY>   (only if set)

  {
    "model": "<HUNCH_SYNTH_MODEL>",
    "messages": [{"role": "user", "content": "<prompt>"}],
    "response_format": {"type": "json_object"},
    "stream": false
  }
  ```
  `HUNCH_SYNTH_BASE_URL` is expected to be the `.../v1` root (matches the issue's own example, e.g. `http://host:11434/v1`); the code appends `/chat/completions`. A non-2xx response or a response with no `choices[0].message.content` throws (→ safe-wrapper fallback), matching how the CLI providers signal failure.
- **Model id reuses `safeModel()`** (the existing shell-metachar/whitespace guard) — the same defense-in-depth rationale applies even though this transport isn't a shell spawn: `HUNCH_SYNTH_MODEL` still travels as untrusted input into a JSON body, and reusing the existing validator is cheap and consistent. Unlike `ClaudeCliProvider`'s `"haiku"` fallback, there is no universal default local model, so the fallback is `undefined` — an unset/rejected model means `available()` is `false`.
- **New `safeTimeout()` helper**, same shape as `safeModel()`: parses `HUNCH_SYNTH_TIMEOUT_MS` as a positive integer, falling back to `300_000` (5 min) on unset/invalid. Five minutes (vs. `cursor-agent`'s 45s) is deliberately generous — the issue specifically flags large local models as needing more headroom, and this provider has no other latency budget imposed on it.
- **Timeout implementation:** `AbortController` + `setTimeout(() => controller.abort(), timeoutMs)`, passed as `fetch`'s `signal`. An aborted fetch throws (`AbortError`), which the safe-wrapper's existing catch-and-fallback handles the same as any other provider failure.

### Provider registration and selection

```ts
const PROVIDERS: SynthProvider[] = [
  new ClaudeCliProvider(),
  new CodexCliProvider(),
  new CursorCliProvider(),
  new OpenAICompatProvider(),
  new DeterministicProvider(),
];
```

Placed **after** the three subscription CLIs, before `DeterministicProvider`:
- With `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` unset, `available()` is `false` and priority-order selection is byte-for-byte unchanged from today — satisfies "default behavior unchanged."
- A self-hosted user with no subscription CLI installed gets it automatically once both vars are set, with no need to force it via `HUNCH_SYNTH_PROVIDER`.
- A user who also happens to have a subscription CLI installed, and wants the local model preferred, sets `HUNCH_SYNTH_PROVIDER=openai-compat` (or the alias below) to force it — matching the issue's acceptance-criteria example.

**Alias:** `HUNCH_SYNTH_PROVIDER=ollama` is accepted as an alias for `openai-compat` in the forced-provider lookup inside `selectProvider()`:

```ts
function normalizeProviderName(v: string | undefined): string | undefined {
  return v === "ollama" ? "openai-compat" : v;
}
```

This keeps the provider's canonical name accurate (it is not Ollama-specific) while satisfying the issue's literal `HUNCH_SYNTH_PROVIDER=ollama` example.

### Deep synthesis and the Critic pass — free participation

`selectWorkers()` (the `--deep` ensemble pool) and `selectVerifier()` (the Critic pass) already iterate `PROVIDERS` filtering out only `"deterministic"`. Because `OpenAICompatProvider` implements the full `SynthProvider` interface via the shared `PromptSynthProvider` base (`draftDecision`, `draftBug`, `draftProse`, `verifyDecision` all inherited), it is picked up by both automatically once available — no changes needed to either function. This is a genuine "first-class" property the issue's framing asks for, not scope creep: it falls out of reusing the existing base class rather than hand-rolling a narrower interface.

## Testing

Extend the existing provider test files (no new file — mirrors how the three CLI providers already share `test/provider.test.ts` / `test/cliproviders.test.ts` rather than one file per provider):

- Spin up a throwaway `node:http` server bound to an ephemeral port per test, point `HUNCH_SYNTH_BASE_URL` at it (mirrors how the CLI tests spawn a real fake binary on `PATH` instead of mocking `child_process.spawn` — same "real transport, fake backend" philosophy applied to HTTP).
- Assert request shape: `model`/`messages`/`response_format` in the POST body, `Authorization: Bearer ...` present only when `HUNCH_SYNTH_API_KEY` is set and absent otherwise.
- Assert response mapping: a `choices[0].message.content` JSON string maps to a `DecisionDraft` via the existing `decisionDraftFromText` — no new mapping logic to test, just that `run()` hands it the right text.
- Assert timeout behavior: a handler that delays past a short `HUNCH_SYNTH_TIMEOUT_MS` causes `run()` to reject, and the safe-wrapper falls back to `deterministic`.
- Assert `available()` is `false` (and `selectProvider()` therefore returns something else) when `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` are unset — the "default unchanged" acceptance criterion, tested directly rather than inferred.
- `safeTimeout()` unit tests mirroring the existing `safeModel()` ones (valid values pass through, invalid/negative/non-numeric fall back to the default, unset falls back to the default).
- `normalizeProviderName`/alias test: `HUNCH_SYNTH_PROVIDER=ollama` resolves to the same provider instance as `HUNCH_SYNTH_PROVIDER=openai-compat`.
- A new test-only export, `__resetAvailabilityCacheForTests()`, clears `isAvailable()`'s process-wide memoization cache. Needed because that cache is keyed by provider name and shared across every test in a file: without a reset, an earlier test that iterates all providers while `HUNCH_SYNTH_BASE_URL` is unset would permanently cache `openai-compat → unavailable` for the rest of the file, regardless of later env changes. Never called from production code.

## Acceptance criteria (from issue #3, restated against this design)

- [ ] `HUNCH_SYNTH_PROVIDER=ollama HUNCH_SYNTH_BASE_URL=... HUNCH_SYNTH_MODEL=...` drives synthesis with no API key (alias resolves to `openai-compat`; `HUNCH_SYNTH_API_KEY` is optional).
- [ ] `backfill`/`sync` report `via LLM` using the configured local model (falls out of the existing `r.provider !== "deterministic"` counting logic in `src/cli/index.ts` — no changes needed there).
- [ ] Configurable request timeout (`HUNCH_SYNTH_TIMEOUT_MS`, default 300000ms), not the 45s `cursor-agent` cap.
- [ ] Default behavior unchanged when `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` are unset — `OpenAICompatProvider.available()` is `false`, `PROVIDERS` priority order and output are identical to today.
