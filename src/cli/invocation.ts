/** Side-effect-free shared CLI logic — safe for any module (including tests)
 *  to import, unlike src/cli/index.ts, which runs the whole program at
 *  import time. Holds: how to re-invoke this CLI from a git hook / .mcp.json
 *  (working both when running the built dist and in dev via tsx), plus small
 *  formatting helpers (dim(), doctor's synthesisStatusLines()) that need the
 *  same import-safety to be unit-testable. */
import { fileURLToPath } from "node:url";
import type { Invocation } from "../integrations/scaffold.js";

export interface ResolvedInvocation {
  /** Shell command prefix for the git hook (e.g. `node /abs/dist/cli/index.js`). */
  shell: string;
  /** Structured command/args for .mcp.json (subcommand appended by the writer). */
  mcp: Invocation;
}

/** Published package name — used for OS-agnostic invocations (see below). */
const PKG = "@davesheffer/hunch";

export function dim(s: string): string {
  return `\x1b[2m${s}\x1b[0m`;
}

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

export function resolveInvocation(): ResolvedInvocation {
  const entry = fileURLToPath(import.meta.url).replace(/invocation\.(js|ts)$/, "index.$1");
  const isDev = entry.endsWith(".ts");
  // JSON.stringify yields a double-quoted, backslash-escaped token /bin/sh
  // accepts — so install paths with spaces don't break the hook command.
  const q = (s: string) => JSON.stringify(s);

  // Running from an installed copy (global, local, or npx cache — i.e. NOT a
  // source checkout we're hacking on). The MCP/provider config files we write
  // are committed and shared across a team via git, so they must NOT embed this
  // machine's absolute path or OS-specific separators. Reference Hunch by its
  // published package name instead, which `npx` resolves the same on any OS and
  // any clone. The git hook lives in per-machine .git/hooks (never committed),
  // so it keeps the PATH-robust absolute-node invocation below.
  const installed = !isDev && entry.replace(/\\/g, "/").includes("/node_modules/");
  if (installed) {
    return {
      shell: `${q(process.execPath)} ${q(entry)}`,
      mcp: { command: "npx", args: ["-y", PKG] },
    };
  }

  if (isDev) {
    return {
      shell: `npx tsx ${q(entry)}`,
      mcp: { command: "npx", args: ["tsx", entry] },
    };
  }
  // Source-checkout dist run (e.g. `node dist/cli/index.js`, npm link): inherently
  // per-machine. Use the absolute node binary (process.execPath) rather than a bare
  // `node`, so the hook works even when nvm's `node` isn't on the hook's PATH.
  return {
    shell: `${q(process.execPath)} ${q(entry)}`,
    mcp: { command: process.execPath, args: [entry] },
  };
}
