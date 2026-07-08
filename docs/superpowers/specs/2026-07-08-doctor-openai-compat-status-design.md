# `hunch doctor` misreports the openai-compat provider

**Origin:** [MrSampson/hunch#8](https://github.com/MrSampson/hunch/issues/8)
**Follow-up to:** [#7](https://github.com/MrSampson/hunch/pull/7) (local-model / OpenAI-compatible synthesis provider)
**Status:** Approved, pending implementation plan

## Problem

`hunch doctor`'s synthesis-status message is wrong for the `openai-compat` provider added in #7. Confirmed live against a real local Ollama server (`qwen2.5-coder:1.5b`) — synthesis genuinely worked (`hunch sync` produced a real `llm_draft` decision with `synth:provider=openai-compat` in its provenance evidence) — but `doctor` reported:

```
synthesis:  openai-compat
            ↳ no assistant CLI found — synthesis uses the offline heuristic (advisory, low-confidence)
              for full synthesis install one: Claude Code (`claude /login`), Codex (`codex login`), or Cursor (`cursor-agent login`)
```

This is actively misleading: it tells a self-hosted user their setup is degraded to the offline deterministic heuristic (it isn't — a real LLM call just succeeded) and nudges them to install a subscription CLI they deliberately opted out of.

**Root cause:** `src/cli/index.ts`'s `doctor` command (`doctor` action, ~line 2210) has a hardcoded `SUB` lookup table describing only the three subscription-CLI providers (`claude-cli`, `codex-cli`, `cursor-agent`). Any other resolved provider name falls through to a generic `else` branch meant for "no LLM available, degraded to the offline heuristic" — which is correct for `deterministic` but wrong for `openai-compat`, a working HTTP-based LLM provider.

**Why the reviews missed it:** none of #7's reviews (per-task, whole-branch, or the independent `mr-complexity-reviewer` pass) exercised `doctor`'s output — all coverage was at the `selectProvider()`/`syncCommit()` level. The message-selection logic itself has zero test coverage today: it's inline in `doctor`'s `.action()` callback, which is exactly how this shipped unnoticed. Caught only by running `hunch doctor` live.

## Goals

1. `hunch doctor` reports the `openai-compat` provider accurately: the configured local/self-hosted endpoint and model, styled as a working status (like the subscription-CLI branches), not as a degraded fallback.
2. The three existing subscription-CLI messages, and the `deterministic`/unknown-provider fallback message, are unchanged.
3. Cover this logic with unit tests so a future provider addition can't regress `doctor`'s messaging the same way, undetected, again.

## Non-goals

- No changes to provider selection, synthesis, or any behavior outside `doctor`'s status message — this is a diagnostics-only fix.
- No broader refactor of `doctor` or `src/cli/index.ts` beyond extracting the one function this bug lives in.

## Design

### Extract the message logic into a small, pure, exported function

`src/cli/index.ts` currently has no exports — this is a Commander entry point only. The fix introduces its first: a pure formatting function, the same low-risk shape as `provider.ts`'s already-exported `safeModel`/`pexecIn`, not a rework of the CLI wiring.

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

- Signature takes `env: NodeJS.ProcessEnv` as a parameter (not reading `process.env` internally) so tests pass a plain object literal — no global-state save/restore boilerplate.
- Returns `string[]` (one or two lines) instead of calling `console.log` directly, so tests assert on the returned strings.
- `dim()` is an existing module-level `function` declaration later in the same file; hoisting makes it callable here regardless of declaration order (already true of the current inline code, unchanged).
- The `openai-compat` branch is printed **without** `dim()` — it reports a working configuration, matching the subscription-CLI branches' undimmed styling, not the degraded-heuristic branch's dimmed styling.

### `doctor`'s action becomes a one-line call site

Replace the inline `if (sub) {...} else {...}` block (currently ~10 lines) with:

```ts
for (const line of synthesisStatusLines(provider.name, process.env)) console.log(line);
```

No other change to the `doctor` command.

## Testing

New test file `test/doctor.test.ts` (no existing test file exercises `doctor`'s synthesis-status output — `test/claudeconfig.test.ts`'s "doctor heals..." test covers a config-path-healing concern, unrelated). Cases:

- Each of the three subscription-CLI names (`claude-cli`, `codex-cli`, `cursor-agent`) produces its existing message, including the `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`-stripped note when that var is present in the passed `env`, and its absence when not.
- `openai-compat` with `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` set reports the endpoint and model, and correctly reflects whether `HUNCH_SYNTH_API_KEY` is present (regression test for issue #8 — the specific case that was wrong).
- `deterministic` (and an arbitrary unrecognized provider name, e.g. `"future-provider"`) still produce the two-line "no assistant CLI found — offline heuristic" message unchanged (regression guard: the fix must not touch this branch's behavior).

## Acceptance criteria (from issue #8, restated against this design)

- [ ] With `HUNCH_SYNTH_PROVIDER=openai-compat` (or the `ollama` alias) and `HUNCH_SYNTH_BASE_URL`/`HUNCH_SYNTH_MODEL` set, `hunch doctor` reports the local/self-hosted endpoint and model, not "no assistant CLI found."
- [ ] `deterministic`'s existing "no assistant CLI found — offline heuristic" message is unchanged.
- [ ] The three existing subscription-CLI messages (`claude-cli`/`codex-cli`/`cursor-agent`) are unchanged.
