# `hunch doctor` openai-compat Status Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `hunch doctor` reporting the `openai-compat` synthesis provider as "no assistant CLI found — offline heuristic," which is false and actively misleading, by extracting its status-message logic into a small, pure, tested function that knows about the provider.

**Architecture:** `src/cli/index.ts`'s `doctor` command has its synthesis-status message inline in a `.action()` callback with zero test coverage — the root cause of issue #8 shipping unnoticed. This plan extracts that logic into a new exported function, `synthesisStatusLines(providerName, env): string[]`, adds an `openai-compat` branch to it, and replaces the inline block with a one-line call to it. `src/cli/index.ts` currently has no exports; this is its first, in the same low-risk "pure formatting/validation helper" shape as `provider.ts`'s already-exported `safeModel`.

**Tech Stack:** TypeScript (strict, ESM, Node ≥22.13), no build step at dev time (`tsx` runs source directly), `node:test`/`node:assert/strict` for tests (no test framework dependency).

## Global Constraints

- Node ≥22.13.0, pure ESM, no build step at dev time (`tsx` runs source directly).
- `tsc --noEmit` (via `npm run typecheck`) must stay clean — strict mode, `noUncheckedIndexedAccess`.
- Tests run via `npm test` (`tsx --test test/*.test.ts`) — new test file must use `node:test`/`node:assert/strict`.
- No behavior change to the three existing subscription-CLI messages (`claude-cli`/`codex-cli`/`cursor-agent`) or to the `deterministic`/unrecognized-provider fallback message — only the `openai-compat` case changes from "no assistant CLI found" to an accurate status.
- No changes to provider selection, synthesis, or anything outside `doctor`'s status message — diagnostics-only.
- Spec: `docs/superpowers/specs/2026-07-08-doctor-openai-compat-status-design.md`.

---

### Task 1: Extract `synthesisStatusLines()`, add the `openai-compat` branch, and test it

**Files:**
- Modify: `src/cli/index.ts` (insert the new function before the `// ---- doctor ----` section comment at line 2195; replace the inline `SUB`/`if`/`else` block inside the `doctor` action, lines 2208–2223)
- Test: `test/doctor.test.ts` (new file)

**Interfaces:**
- Consumes: nothing new — `dim()` (existing module-level `function` declaration later in the same file, already used by the code being replaced; hoisting makes it callable regardless of position).
- Produces: `export function synthesisStatusLines(providerName: string, env: NodeJS.ProcessEnv): string[];` — later code (none in this plan) may reuse it; this task's only consumer is `doctor`'s action itself.

- [ ] **Step 1: Write the failing test**

Create `test/doctor.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesisStatusLines } from "../src/cli/index.js";

test("synthesisStatusLines: claude-cli reports the subscription and notes when ANTHROPIC_API_KEY is stripped", () => {
  assert.deepEqual(
    synthesisStatusLines("claude-cli", {}),
    ["            ↳ LLM synthesis billed to your Claude subscription (claude CLI)"],
  );
  assert.deepEqual(
    synthesisStatusLines("claude-cli", { ANTHROPIC_API_KEY: "sk-x" }),
    ["            ↳ LLM synthesis billed to your Claude subscription (claude CLI) (ANTHROPIC_API_KEY in env is stripped — never billed to the API)"],
  );
});

test("synthesisStatusLines: codex-cli reports the subscription and notes when OPENAI_API_KEY is stripped", () => {
  assert.deepEqual(
    synthesisStatusLines("codex-cli", {}),
    ["            ↳ LLM synthesis billed to your ChatGPT subscription (codex CLI)"],
  );
  assert.deepEqual(
    synthesisStatusLines("codex-cli", { OPENAI_API_KEY: "sk-x" }),
    ["            ↳ LLM synthesis billed to your ChatGPT subscription (codex CLI) (OPENAI_API_KEY in env is stripped — never billed to the API)"],
  );
});

test("synthesisStatusLines: cursor-agent reports the subscription (no key-strip note — it has none)", () => {
  assert.deepEqual(
    synthesisStatusLines("cursor-agent", { ANTHROPIC_API_KEY: "sk-x" }),
    ["            ↳ LLM synthesis billed to your Cursor subscription (cursor-agent CLI)"],
  );
});

// Regression for issue #8: openai-compat was previously falling into the
// "no assistant CLI found — offline heuristic" branch, which is false — a
// real LLM call succeeds through this provider.
test("synthesisStatusLines: openai-compat reports the configured endpoint/model, not 'no assistant CLI found'", () => {
  const lines = synthesisStatusLines("openai-compat", {
    HUNCH_SYNTH_BASE_URL: "http://localhost:11434/v1",
    HUNCH_SYNTH_MODEL: "qwen2.5-coder:1.5b",
  });
  assert.deepEqual(lines, [
    "            ↳ LLM synthesis via local/self-hosted endpoint http://localhost:11434/v1 (model: qwen2.5-coder:1.5b) (no API key)",
  ]);
  assert.ok(!lines.join("\n").includes("no assistant CLI found"), "must not claim no assistant CLI was found");
});

test("synthesisStatusLines: openai-compat notes when HUNCH_SYNTH_API_KEY is set", () => {
  const lines = synthesisStatusLines("openai-compat", {
    HUNCH_SYNTH_BASE_URL: "http://localhost:11434/v1",
    HUNCH_SYNTH_MODEL: "qwen2.5-coder:1.5b",
    HUNCH_SYNTH_API_KEY: "sk-local",
  });
  assert.deepEqual(lines, [
    "            ↳ LLM synthesis via local/self-hosted endpoint http://localhost:11434/v1 (model: qwen2.5-coder:1.5b) (HUNCH_SYNTH_API_KEY set)",
  ]);
});

// Regression guard: the deterministic/unrecognized-provider fallback message
// must stay exactly as it was before this change.
test("synthesisStatusLines: deterministic (and any unrecognized provider) keeps the offline-heuristic message unchanged", () => {
  const expected = [
    "            ↳ no assistant CLI found — synthesis uses the offline heuristic (advisory, low-confidence)",
    "              for full synthesis install one: Claude Code (`claude /login`), Codex (`codex login`), or Cursor (`cursor-agent login`)",
  ];
  assert.deepEqual(synthesisStatusLines("deterministic", {}), expected);
  assert.deepEqual(synthesisStatusLines("future-provider", {}), expected);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test test/doctor.test.ts`
Expected: FAIL — `synthesisStatusLines` is not exported / not defined in `src/cli/index.ts`.

- [ ] **Step 3: Extract the function**

In `src/cli/index.ts`, insert the new function immediately before the `// ---- doctor ----` section comment (currently at line 2195):

```ts
/** The doctor command's synthesis-status line(s) for a resolved provider name.
 *  Exported for testing — the previous inline version had zero test coverage,
 *  which is how issue #8 (openai-compat misreported as "no assistant CLI
 *  found") shipped unnoticed through three review passes. */
export function synthesisStatusLines(providerName: string, env: NodeJS.ProcessEnv): string[] {
  const SUB: Record<string, { label: string; strip?: string }> = {
    "claude-cli": { label: "Claude subscription (claude CLI)", strip: "ANTHROPIC_API_KEY" },
    "codex-cli": { label: "ChatGPT subscription (codex CLI)", strip: "OPENAI_API_KEY" },
    "cursor-agent": { label: "Cursor subscription (cursor-agent CLI)" },
  };
  const sub = SUB[providerName];
  if (sub) {
    const hadKey = sub.strip && !!env[sub.strip];
    return [`            ↳ LLM synthesis billed to your ${sub.label}` +
      (hadKey ? ` (${sub.strip} in env is stripped — never billed to the API)` : ``)];
  }
  if (providerName === "openai-compat") {
    const base = env.HUNCH_SYNTH_BASE_URL ?? "(unset)";
    const model = env.HUNCH_SYNTH_MODEL ?? "(unset)";
    const keyNote = env.HUNCH_SYNTH_API_KEY ? " (HUNCH_SYNTH_API_KEY set)" : " (no API key)";
    return [`            ↳ LLM synthesis via local/self-hosted endpoint ${base} (model: ${model})${keyNote}`];
  }
  return [
    dim(`            ↳ no assistant CLI found — synthesis uses the offline heuristic (advisory, low-confidence)`),
    dim(`              for full synthesis install one: Claude Code (\`claude /login\`), Codex (\`codex login\`), or Cursor (\`cursor-agent login\`)`),
  ];
}

```

- [ ] **Step 4: Replace the inline block in `doctor`'s action**

Replace (currently lines 2208–2223):

```ts
    // Synthesis is billed to the user's SUBSCRIPTION via a coding-assistant CLI,
    // never a pay-per-token API key. Surface which one — or what's missing.
    const SUB: Record<string, { label: string; strip?: string }> = {
      "claude-cli": { label: "Claude subscription (claude CLI)", strip: "ANTHROPIC_API_KEY" },
      "codex-cli": { label: "ChatGPT subscription (codex CLI)", strip: "OPENAI_API_KEY" },
      "cursor-agent": { label: "Cursor subscription (cursor-agent CLI)" },
    };
    const sub = SUB[provider.name];
    if (sub) {
      const hadKey = sub.strip && !!process.env[sub.strip];
      console.log(`            ↳ LLM synthesis billed to your ${sub.label}` +
        (hadKey ? ` (${sub.strip} in env is stripped — never billed to the API)` : ``));
    } else {
      console.log(dim(`            ↳ no assistant CLI found — synthesis uses the offline heuristic (advisory, low-confidence)`));
      console.log(dim(`              for full synthesis install one: Claude Code (\`claude /login\`), Codex (\`codex login\`), or Cursor (\`cursor-agent login\`)`));
    }
```

with:

```ts
    // Synthesis is billed to the user's SUBSCRIPTION via a coding-assistant CLI
    // (or run through a configured local/self-hosted endpoint), never a
    // pay-per-token API key. Surface which one — or what's missing.
    for (const line of synthesisStatusLines(provider.name, process.env)) console.log(line);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test test/doctor.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 6: Manually confirm the fix against the real bug report**

Run: `npm run dev -- doctor` from a scratch git+hunch repo with `HUNCH_SYNTH_PROVIDER=ollama HUNCH_SYNTH_BASE_URL=http://localhost:11434/v1 HUNCH_SYNTH_MODEL=<any locally pulled model>` set, if a local Ollama server is available in this environment (`curl -s http://localhost:11434/api/version`). If no local Ollama server is available, skip this step and rely on the unit tests — do not fabricate a manual-run report.
Expected: `synthesis:  openai-compat` followed by `↳ LLM synthesis via local/self-hosted endpoint ...`, not "no assistant CLI found."

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8: Run the full test suite — must stay green**

Run: `npm test`
Expected: all tests pass (491 + the new `test/doctor.test.ts` cases), 0 failures.

- [ ] **Step 9: Commit**

```bash
git add src/cli/index.ts test/doctor.test.ts
git commit -m "fix: hunch doctor correctly reports the openai-compat provider (#8)"
```
