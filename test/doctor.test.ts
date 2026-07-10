import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { synthesisStatusLines, maybeWarnOllamaContext } from "../src/cli/invocation.js";

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
    "\x1b[2m            ↳ no assistant CLI found — synthesis uses the offline heuristic (advisory, low-confidence)\x1b[0m",
    "\x1b[2m              for full synthesis install one: Claude Code (`claude /login`), Codex (`codex login`), or Cursor (`cursor-agent login`)\x1b[0m",
  ];
  assert.deepEqual(synthesisStatusLines("deterministic", {}), expected);
  assert.deepEqual(synthesisStatusLines("future-provider", {}), expected);
});

test("maybeWarnOllamaContext short-circuits to null for any non-openai-compat provider, without any network call", async () => {
  for (const name of ["claude-cli", "codex-cli", "cursor-agent", "deterministic", "ensemble"]) {
    assert.equal(await maybeWarnOllamaContext(name, {}), null);
  }
});

test("maybeWarnOllamaContext reaches probeOllamaNumCtx for the openai-compat provider", async () => {
  const server = createServer((req, res) => {
    res.end(JSON.stringify({ parameters: "" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  try {
    const warning = await maybeWarnOllamaContext("openai-compat", {
      HUNCH_SYNTH_BASE_URL: `http://127.0.0.1:${port}`,
      HUNCH_SYNTH_MODEL: "m",
    });
    assert.ok(warning?.includes("4096"), `expected a 4096-token warning, got: ${warning}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
