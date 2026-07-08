# Local-Model / OpenAI-Compatible Synthesis Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in synthesis provider that drives Hunch's decision/bug drafting through any OpenAI-compatible HTTP endpoint (Ollama, vLLM, LM Studio, llama.cpp server, ...) — no subscription CLI, no API key required — with its own configurable timeout, while leaving default behavior byte-for-byte unchanged when the new env vars are unset.

**Architecture:** `src/synthesis/provider.ts`'s `CliSynthProvider` abstract base (today: "turn one prompt string into text, via `run()`") is renamed `PromptSynthProvider` and widened — its contract never depended on the transport being a CLI spawn. A new `OpenAICompatProvider extends PromptSynthProvider`, implementing `run()` via Node's global `fetch` against `{HUNCH_SYNTH_BASE_URL}/chat/completions`, gets all of `draftDecision`/`draftBug`/`draftProse`/`verifyDecision` for free from the shared base — including automatic participation in deep-synthesis (`--deep`) and the Critic pass. It's registered in `PROVIDERS` after the three CLI providers and before `DeterministicProvider`, so priority-order selection is unchanged when the new env vars are unset, and `HUNCH_SYNTH_PROVIDER=ollama` is accepted as an alias for its canonical name `openai-compat`.

**Tech Stack:** TypeScript (strict, ESM, Node ≥22.13), Node's global `fetch`/`AbortController`/`Headers` (no new dependency — `@types/node` ^22.13 ships these as ambient globals, no `"dom"` lib needed), `node:http` for test-only fake servers, `node:test`/`node:assert` for tests (no test framework dependency).

## Global Constraints

- Node ≥22.13.0, pure ESM, no build step at dev time (`tsx` runs source directly).
- `tsc --noEmit` (via `npm run typecheck`) must stay clean — strict mode, `noUncheckedIndexedAccess`. `fetch`/`AbortController`/`Headers`/`Response` are available as ambient globals from `@types/node`; do not add `"dom"` to `tsconfig.json`'s `lib` array.
- Tests run via `npm test` (`tsx --test test/*.test.ts`) — every new/modified test file must use `node:test`/`node:assert/strict`, matching the existing style in `test/cliproviders.test.ts` / `test/integration.test.ts`.
- No behavior change to existing provider selection, CLI providers, or synthesis output when `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` are unset — every existing test file must stay green throughout (`test/cliproviders.test.ts`, `test/provider.test.ts`, `test/provider-exec.test.ts`, `test/ensemble.test.ts`, `test/verify.test.ts`, `test/synthesis.test.ts`, `test/integration.test.ts`).
- `test/providers.test.ts` (plural) is unrelated — it tests `src/integrations/providers.ts` (MCP config writers), not `src/synthesis/provider.ts`. Do not confuse the two files.
- No dual wire-format support (no native-Ollama `/api/chat` client), no new SDK dependency, no streaming.
- `selectWorkers()`/`selectVerifier()` in `src/synthesis/provider.ts` need NO code changes — they already generalize over any `SynthProvider` in `PROVIDERS` whose `name !== "deterministic"`.
- Spec: `docs/superpowers/specs/2026-07-08-local-model-synthesis-provider-design.md`.

---

### Task 1: Rename `CliSynthProvider` → `PromptSynthProvider` (no behavior change)

**Files:**
- Modify: `src/synthesis/provider.ts` (the abstract class ~lines 242–310, and its three `extends CliSynthProvider` call sites: `ClaudeCliProvider` ~line 330, `CodexCliProvider` ~line 392, `CursorCliProvider` ~line 418)

**Interfaces:**
- Consumes: nothing new.
- Produces: `abstract class PromptSynthProvider implements SynthProvider` (module-private, not exported — same visibility as today's `CliSynthProvider`). Later tasks extend this instead of `CliSynthProvider`.

`CliSynthProvider` is not exported and has no references outside `src/synthesis/provider.ts` (verified: only the class definition and the three `extends` sites). This is a pure identifier rename plus a widened doc comment — no behavior change, verified by the existing suite staying green rather than a new test.

- [ ] **Step 1: Rename the class and widen its doc comment**

Replace:

```ts
// --------------------------------------------------------------------------
// Base for headless-CLI SUBSCRIPTION providers. Each one drives a coding-assistant
// CLI billed to the user's own subscription (never a pay-per-token API key — see
// dec_5a7c0733f7). The prompt always goes over STDIN (never argv — keeps untrusted
// diff content out of any shell pexecIn uses on Windows), and the CLI's text output
// is handed to the SAME mappers, so the rest of the system is provider-agnostic.
// --------------------------------------------------------------------------
abstract class CliSynthProvider implements SynthProvider {
```

with:

```ts
// --------------------------------------------------------------------------
// Base for any provider whose interface reduces to "turn one prompt string into
// text" — the three subscription-CLI providers below (spawn, stdin, subscription
// billing — see dec_5a7c0733f7) AND the opt-in local/self-hosted HTTP provider
// further down (OpenAICompatProvider). Neither transport nor billing model is
// part of the contract; only run()'s shape is. Every implementation's text output
// is handed to the SAME mappers, so the rest of the system stays provider-agnostic.
// --------------------------------------------------------------------------
abstract class PromptSynthProvider implements SynthProvider {
```

Then change the three subclass declarations:

```ts
class ClaudeCliProvider extends CliSynthProvider {
```
→
```ts
class ClaudeCliProvider extends PromptSynthProvider {
```

```ts
class CodexCliProvider extends CliSynthProvider {
```
→
```ts
class CodexCliProvider extends PromptSynthProvider {
```

```ts
class CursorCliProvider extends CliSynthProvider {
```
→
```ts
class CursorCliProvider extends PromptSynthProvider {
```

- [ ] **Step 2: Confirm no stray references remain**

Run: `grep -rn "CliSynthProvider" src/ test/`
Expected: no output (every match was renamed).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 4: Run the full test suite — must stay green (proves no behavior change)**

Run: `npm test`
Expected: all tests pass, same count as before this change.

- [ ] **Step 5: Commit**

```bash
git add src/synthesis/provider.ts
git commit -m "refactor: rename CliSynthProvider to PromptSynthProvider (no behavior change)"
```

---

### Task 2: `safeTimeout()` helper

**Files:**
- Modify: `src/synthesis/provider.ts` (add next to `safeModel()`, ~line 320)
- Test: `test/cliproviders.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export function safeTimeout(v: string | undefined, fallback: number): number;`

- [ ] **Step 1: Write the failing tests**

Add to `test/cliproviders.test.ts`, updating the existing import line:

```ts
import { extractCodexText, safeModel, safeTimeout, selectProvider } from "../src/synthesis/provider.js";
```

Append:

```ts
// HUNCH_SYNTH_TIMEOUT_MS feeds AbortController's delay directly. A non-numeric or
// nonsensical value (negative, zero, NaN, Infinity) would either abort immediately
// or never abort, so validate the same way safeModel does: fall back rather than
// propagate garbage.
test("safeTimeout passes a valid positive number through unchanged", () => {
  assert.equal(safeTimeout("60000", 300_000), 60000);
  assert.equal(safeTimeout("1", 300_000), 1);
});

test("safeTimeout falls back to the default on unset/invalid/non-positive values", () => {
  for (const bad of [undefined, "", "0", "-5", "abc", "NaN", "Infinity"]) {
    assert.equal(safeTimeout(bad, 300_000), 300_000);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: FAIL — `safeTimeout` is not exported / not defined.

- [ ] **Step 3: Implement `safeTimeout`**

In `src/synthesis/provider.ts`, immediately after the `safeModel` overloads/implementation (~line 325):

```ts
// A timeout comes from a HUNCH_*_TIMEOUT_MS env var and feeds AbortController's
// delay directly (never a shell argv token, unlike safeModel's model id) — but a
// non-numeric or nonsensical value (negative, zero, NaN, Infinity) would either
// abort immediately or never abort at all, so validate the same way: fall back to
// the provider's default rather than propagate garbage.
export function safeTimeout(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? n : fallback;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: PASS (all tests in the file, including the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/synthesis/provider.ts test/cliproviders.test.ts
git commit -m "feat: add safeTimeout() env-var validator for configurable synthesis timeouts"
```

---

### Task 3: `OpenAICompatProvider` class (standalone, not yet wired into selection)

**Files:**
- Modify: `src/synthesis/provider.ts` (new class after `CursorCliProvider`, before `DeterministicProvider`, ~line 441)
- Test: `test/cliproviders.test.ts`

**Interfaces:**
- Consumes: `PromptSynthProvider` (Task 1), `safeModel`/`safeTimeout` (Task 2, existing).
- Produces: `export class OpenAICompatProvider extends PromptSynthProvider { readonly name = "openai-compat"; available(): Promise<boolean>; }` — exported (unlike the three CLI providers) specifically so tests can construct fresh instances directly, reading `process.env` at construction-free, per-call time rather than through the module-level `PROVIDERS` singleton (which would only see env vars present at the moment `provider.ts` was first imported).

This task builds and tests the class in isolation — no registration in `PROVIDERS`, no `selectProvider()` involvement. That's deliberately deferred to Task 4, which has its own availability-cache concerns to handle.

- [ ] **Step 1: Write the failing tests**

Append to `test/cliproviders.test.ts`, updating the import line again:

```ts
import { extractCodexText, safeModel, safeTimeout, selectProvider, OpenAICompatProvider } from "../src/synthesis/provider.js";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
```

Add a small local test helper and the test cases:

```ts
function startFakeServer(
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => handler(req, res, body));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test("OpenAICompatProvider.available() is false unless BOTH HUNCH_SYNTH_BASE_URL and HUNCH_SYNTH_MODEL are set", async () => {
  delete process.env.HUNCH_SYNTH_BASE_URL;
  delete process.env.HUNCH_SYNTH_MODEL;
  assert.equal(await new OpenAICompatProvider().available(), false);

  process.env.HUNCH_SYNTH_BASE_URL = "http://127.0.0.1:1/v1";
  assert.equal(await new OpenAICompatProvider().available(), false, "base url alone is not enough");
  delete process.env.HUNCH_SYNTH_BASE_URL;

  process.env.HUNCH_SYNTH_MODEL = "m";
  assert.equal(await new OpenAICompatProvider().available(), false, "model alone is not enough");
  delete process.env.HUNCH_SYNTH_MODEL;
});

test("OpenAICompatProvider.draftDecision POSTs {baseUrl}/chat/completions with model/messages/response_format and maps choices[0].message.content", async () => {
  let received: { method?: string; path?: string; auth?: string; body?: Record<string, unknown> } = {};
  const server = await startFakeServer((req, res, body) => {
    received = { method: req.method, path: req.url, auth: req.headers.authorization as string | undefined, body: JSON.parse(body) };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"decision":"use a local model","context":"self-hosted","nontrivial":true}' } }],
    }));
  });
  process.env.HUNCH_SYNTH_BASE_URL = server.url;
  process.env.HUNCH_SYNTH_MODEL = "qwen2.5:7b";
  delete process.env.HUNCH_SYNTH_API_KEY;
  try {
    const provider = new OpenAICompatProvider();
    assert.equal(await provider.available(), true);
    const draft = await provider.draftDecision({ subject: "feat: x", body: "", files: ["a.py"], diff: "+def a(): pass" });
    assert.equal(draft.decision, "use a local model");
    assert.equal(received.method, "POST");
    assert.equal(received.path, "/chat/completions");
    assert.equal(received.body?.model, "qwen2.5:7b");
    assert.equal((received.body?.response_format as { type?: string })?.type, "json_object");
    assert.equal(received.body?.stream, false);
    assert.ok(Array.isArray(received.body?.messages));
    assert.equal(received.auth, undefined, "no Authorization header when HUNCH_SYNTH_API_KEY is unset");
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    await server.close();
  }
});

test("OpenAICompatProvider sends a Bearer Authorization header only when HUNCH_SYNTH_API_KEY is set", async () => {
  let authHeader: string | undefined;
  const server = await startFakeServer((req, res) => {
    authHeader = req.headers.authorization as string | undefined;
    res.end(JSON.stringify({ choices: [{ message: { content: '{"decision":"d","context":"c","nontrivial":true}' } }] }));
  });
  process.env.HUNCH_SYNTH_BASE_URL = server.url;
  process.env.HUNCH_SYNTH_MODEL = "m";
  process.env.HUNCH_SYNTH_API_KEY = "sk-local-123";
  try {
    await new OpenAICompatProvider().draftDecision({ subject: "s", body: "", files: [], diff: "" });
    assert.equal(authHeader, "Bearer sk-local-123");
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    delete process.env.HUNCH_SYNTH_API_KEY;
    await server.close();
  }
});

test("OpenAICompatProvider.draftDecision throws on a non-2xx response (caller falls back to deterministic)", async () => {
  const server = await startFakeServer((req, res) => {
    res.statusCode = 500;
    res.end("internal error");
  });
  process.env.HUNCH_SYNTH_BASE_URL = server.url;
  process.env.HUNCH_SYNTH_MODEL = "m";
  try {
    await assert.rejects(
      new OpenAICompatProvider().draftDecision({ subject: "s", body: "", files: [], diff: "" }),
      /500/,
    );
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    await server.close();
  }
});

test("OpenAICompatProvider.draftDecision rejects when the endpoint exceeds HUNCH_SYNTH_TIMEOUT_MS", async () => {
  const server = await startFakeServer((_req, res) => {
    setTimeout(() => res.end(JSON.stringify({ choices: [{ message: { content: "{}" } }] })), 500);
  });
  process.env.HUNCH_SYNTH_BASE_URL = server.url;
  process.env.HUNCH_SYNTH_MODEL = "m";
  process.env.HUNCH_SYNTH_TIMEOUT_MS = "50";
  try {
    await assert.rejects(new OpenAICompatProvider().draftDecision({ subject: "s", body: "", files: [], diff: "" }));
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    delete process.env.HUNCH_SYNTH_TIMEOUT_MS;
    await server.close();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: FAIL — `OpenAICompatProvider` is not exported / not defined.

- [ ] **Step 3: Implement `OpenAICompatProvider`**

In `src/synthesis/provider.ts`, add after the `CursorCliProvider` class and before `DeterministicProvider` (~line 441):

```ts
// --------------------------------------------------------------------------
// Provider D: OpenAI-compatible / local model endpoint (Ollama, vLLM, LM
// Studio, llama.cpp server, ...) — opt-in, NOT a subscription CLI. Speaks the
// OpenAI chat-completions wire format over HTTP, so ONE implementation covers
// any self-hosted server that implements it (Ollama's /v1 compatibility layer
// included — no separate native /api/chat client). Off by default: available()
// requires BOTH HUNCH_SYNTH_BASE_URL and HUNCH_SYNTH_MODEL, so an installation
// with neither set behaves exactly as it did before this provider existed.
//
// Exported (unlike the CLI providers) so tests can construct fresh instances and
// read process.env at CALL time — see run()/available() below, which read env
// vars directly rather than caching them in constructor fields. That mirrors
// selectProvider()'s own style (it re-reads HUNCH_SYNTH_PROVIDER on every call)
// and avoids a stale-field trap: a module-level PROVIDERS singleton constructed
// once at import time would otherwise never see env vars a test (or a long-lived
// process) sets afterward.
// --------------------------------------------------------------------------
export class OpenAICompatProvider extends PromptSynthProvider {
  readonly name = "openai-compat";

  async available(): Promise<boolean> {
    return !!process.env.HUNCH_SYNTH_BASE_URL && !!safeModel(process.env.HUNCH_SYNTH_MODEL, undefined);
  }

  protected async run(prompt: string): Promise<string> {
    const baseUrl = process.env.HUNCH_SYNTH_BASE_URL?.replace(/\/+$/, "");
    const model = safeModel(process.env.HUNCH_SYNTH_MODEL, undefined);
    if (!baseUrl || !model) throw new Error("openai-compat: HUNCH_SYNTH_BASE_URL/HUNCH_SYNTH_MODEL not set");
    const apiKey = process.env.HUNCH_SYNTH_API_KEY;
    const timeoutMs = safeTimeout(process.env.HUNCH_SYNTH_TIMEOUT_MS, 300_000);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`openai-compat endpoint returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("openai-compat endpoint returned no message content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean. (Confirms `fetch`/`AbortController` resolve from `@types/node` globals with no `tsconfig.json` change needed.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: PASS (all tests in the file, including the five new ones).

- [ ] **Step 6: Commit**

```bash
git add src/synthesis/provider.ts test/cliproviders.test.ts
git commit -m "feat: add OpenAICompatProvider (opt-in local/self-hosted synthesis over HTTP)"
```

---

### Task 4: Wire into provider selection (registration, `ollama` alias, deep-synthesis participation)

**Files:**
- Modify: `src/synthesis/provider.ts` (`PROVIDERS` array ~line 529, `selectProvider()` ~line 551, `availCache`/`isAvailable` block ~line 536, top-of-file doc comment ~lines 1–18)
- Test: `test/cliproviders.test.ts`

**Interfaces:**
- Consumes: `OpenAICompatProvider` (Task 3).
- Produces: `export function __resetAvailabilityCacheForTests(): void;` (test-only), `HUNCH_SYNTH_PROVIDER=ollama` now resolves to the `openai-compat` provider.

`isAvailable()` memoizes each provider's `available()` result in a module-level `Map` for the lifetime of the process ("availability rarely changes within a process"). That assumption holds for a real CLI invocation but not across multiple tests in the same file that toggle `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` — an earlier `selectProvider()` call (e.g. the existing `"selectProvider never throws..."` test, which iterates every provider in `PROVIDERS` once its forced choice is unavailable) would otherwise cache `openai-compat → false` before this task's tests get to set the env vars. `__resetAvailabilityCacheForTests()` is the fix: call it before and after every test in this task that touches `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL`/`HUNCH_SYNTH_PROVIDER`, so results never depend on test execution order.

- [ ] **Step 1: Write the failing tests**

Append to `test/cliproviders.test.ts`, updating the import line once more:

```ts
import {
  extractCodexText,
  safeModel,
  safeTimeout,
  selectProvider,
  selectWorkers,
  OpenAICompatProvider,
  __resetAvailabilityCacheForTests,
} from "../src/synthesis/provider.js";
```

```ts
test("selectProvider does not pick openai-compat when its env vars are unset (default behavior unchanged)", async () => {
  __resetAvailabilityCacheForTests();
  delete process.env.HUNCH_SYNTH_PROVIDER;
  delete process.env.HUNCH_SYNTH_BASE_URL;
  delete process.env.HUNCH_SYNTH_MODEL;
  const p = await selectProvider();
  assert.notEqual(p.name, "openai-compat");
});

test("selectProvider resolves openai-compat when forced and BASE_URL+MODEL are set", async () => {
  __resetAvailabilityCacheForTests();
  process.env.HUNCH_SYNTH_BASE_URL = "http://127.0.0.1:1/v1"; // unreachable; available() checks env presence, not reachability
  process.env.HUNCH_SYNTH_MODEL = "m";
  process.env.HUNCH_SYNTH_PROVIDER = "openai-compat";
  try {
    const p = await selectProvider();
    assert.equal(p.name, "openai-compat");
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    delete process.env.HUNCH_SYNTH_PROVIDER;
    __resetAvailabilityCacheForTests();
  }
});

test("HUNCH_SYNTH_PROVIDER=ollama is accepted as an alias for openai-compat", async () => {
  __resetAvailabilityCacheForTests();
  process.env.HUNCH_SYNTH_BASE_URL = "http://127.0.0.1:1/v1";
  process.env.HUNCH_SYNTH_MODEL = "m";
  process.env.HUNCH_SYNTH_PROVIDER = "ollama";
  try {
    const p = await selectProvider();
    assert.equal(p.name, "openai-compat");
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    delete process.env.HUNCH_SYNTH_PROVIDER;
    __resetAvailabilityCacheForTests();
  }
});

test("selectWorkers includes openai-compat once available — deep-synthesis and the Critic pass participate for free", async () => {
  __resetAvailabilityCacheForTests();
  process.env.HUNCH_SYNTH_BASE_URL = "http://127.0.0.1:1/v1";
  process.env.HUNCH_SYNTH_MODEL = "m";
  try {
    const workers = await selectWorkers();
    assert.ok(workers.some((w) => w.name === "openai-compat"));
  } finally {
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    __resetAvailabilityCacheForTests();
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: FAIL — `openai-compat` is never selected (not registered yet), `__resetAvailabilityCacheForTests` not exported, `ollama` alias not recognized.

- [ ] **Step 3: Register the provider, add the alias, and export the test-only cache reset**

In `src/synthesis/provider.ts`, change the `PROVIDERS` array (~line 529):

```ts
const PROVIDERS: SynthProvider[] = [
  new ClaudeCliProvider(),
  new CodexCliProvider(),
  new CursorCliProvider(),
  new OpenAICompatProvider(),
  new DeterministicProvider(),
];
```

Immediately after the `availCache`/`isAvailable` block (~line 548), add:

```ts
/** Test-only: clears the availability memoization cache so a test that toggles
 *  env vars mid-process (e.g. HUNCH_SYNTH_BASE_URL) isn't served a stale result
 *  cached by an earlier call in the same process. Never call from production code. */
export function __resetAvailabilityCacheForTests(): void {
  availCache.clear();
}
```

Replace `selectProvider()` (~line 551):

```ts
/** "ollama" is accepted as an alias for "openai-compat" — the provider is not
 *  Ollama-specific (it speaks the OpenAI chat-completions format any self-hosted
 *  server can implement), but Ollama is the most common self-hosted target and
 *  users reach for that name first. */
function normalizeProviderName(v: string | undefined): string | undefined {
  return v === "ollama" ? "openai-compat" : v;
}

/** Choose the first available provider, honoring HUNCH_SYNTH_PROVIDER override
 *  ("ollama" normalizes to "openai-compat"). */
export async function selectProvider(): Promise<SynthProvider> {
  const forced = normalizeProviderName(process.env.HUNCH_SYNTH_PROVIDER);
  if (forced) {
    const p = PROVIDERS.find((x) => x.name === forced);
    if (p && (await isAvailable(p))) return p;
  }
  for (const p of PROVIDERS) {
    if (await isAvailable(p)) return p;
  }
  return new DeterministicProvider();
}
```

- [ ] **Step 4: Widen the top-of-file doc comment**

In `src/synthesis/provider.ts`'s module doc comment (top of file, ~lines 1–18), after the existing "Subscription, not API" paragraph, add:

```
 * A fourth, OPT-IN provider (name "openai-compat", alias "ollama") speaks the
 * OpenAI chat-completions format over HTTP to a self-hosted endpoint instead of a
 * subscription CLI. con_2ce3f2a547 scopes "subscription, never pay-per-token" to
 * the Anthropic API specifically — a self-hosted/local model is neither, so it
 * doesn't conflict — but it stays off unless HUNCH_SYNTH_BASE_URL and
 * HUNCH_SYNTH_MODEL are both explicitly set.
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx tsx --test test/cliproviders.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 7: Run the full test suite — must stay green**

Run: `npm test`
Expected: all tests pass, including `test/provider.test.ts`, `test/ensemble.test.ts`, `test/verify.test.ts`, `test/synthesis.test.ts` (none of which reference `openai-compat` and must be unaffected).

- [ ] **Step 8: Commit**

```bash
git add src/synthesis/provider.ts test/cliproviders.test.ts
git commit -m "feat: wire OpenAICompatProvider into provider selection with an ollama alias"
```

---

### Task 5: End-to-end integration test — `syncCommit` drives synthesis through `openai-compat`

**Files:**
- Modify: `test/integration.test.ts`

**Interfaces:**
- Consumes: `syncCommit` (existing, unchanged), `__resetAvailabilityCacheForTests` (Task 4).
- Produces: nothing new — this task only adds test coverage proving the full pipeline (git commit → `syncCommit` → provider selection → HTTP call → decision written) works end-to-end with no API key, and that the result correctly reports `provider: "openai-compat"` — which is what `backfill`'s existing `r.provider !== "deterministic" → llm++` counting logic (`src/cli/index.ts`, unchanged) keys off. No separate CLI-level `backfill` test is needed: that counting logic has no provider-specific branches, so proving `syncCommit` reports the right `provider` name is sufficient.

- [ ] **Step 1: Write the failing test**

Add to `test/integration.test.ts`, extending the import lines at the top:

```ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { __resetAvailabilityCacheForTests } from "../src/synthesis/provider.js";
```

Append at the end of the file:

```ts
test("syncCommit drives synthesis through the openai-compat provider end-to-end (no API key, reports via LLM)", async () => {
  const root = gitRepo();
  const store = new HunchStore(hunchPaths(root));
  store.json.ensureDirs();
  appendFileSync(join(root, "src/a.ts"), "export function b(){ return 2; }\n");
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "feat: add b"], { cwd: root, stdio: "ignore" });

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              title: "Add b()",
              context: "local model draft",
              decision: "Added function b to a.ts",
              consequences: [],
              alternatives_rejected: [],
              nontrivial: true,
            }),
          },
        }],
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;

  const savedProvider = process.env.HUNCH_SYNTH_PROVIDER;
  process.env.HUNCH_SYNTH_PROVIDER = "openai-compat";
  process.env.HUNCH_SYNTH_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.HUNCH_SYNTH_MODEL = "local-test-model";
  __resetAvailabilityCacheForTests();
  try {
    const r = await syncCommit(store, root);
    assert.equal(r.status, "written", `expected written, got skipped: ${r.reason}`);
    assert.equal(r.provider, "openai-compat", "this is exactly what backfill's 'via LLM' count keys off");
    assert.equal(r.decision!.decision, "Added function b to a.ts");
  } finally {
    process.env.HUNCH_SYNTH_PROVIDER = savedProvider ?? "deterministic";
    delete process.env.HUNCH_SYNTH_BASE_URL;
    delete process.env.HUNCH_SYNTH_MODEL;
    __resetAvailabilityCacheForTests();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Confirm the test actually exercises the new path, not a vacuous pass**

Provider selection and `OpenAICompatProvider` were already implemented and committed in Tasks 1–4, so this test is expected to pass on its first real run — there's no missing implementation to drive it green. To prove the assertion is actually load-bearing (not silently vacuous), temporarily change `assert.equal(r.provider, "openai-compat", ...)` to `assert.equal(r.provider, "openai-compat-typo", ...)` and run:

Run: `npx tsx --test test/integration.test.ts`
Expected: FAIL on the changed assertion — confirms `r.provider` really is `"openai-compat"` and the test isn't passing for an unrelated reason (e.g. an early return).

Revert the typo before continuing.

- [ ] **Step 3: Run the test to verify it passes**

Run: `npx tsx --test test/integration.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 4: Run the full test suite — must stay green**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add test/integration.test.ts
git commit -m "test: syncCommit synthesizes via the openai-compat provider end-to-end"
```
