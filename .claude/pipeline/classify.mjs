// UserPromptSubmit hook: inject the operating loop (once) + reset per-turn gate counters.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, readStdin, saveState } from "./engine.mjs";

try {
  const input = readStdin();
  if (!input?.session_id) process.exit(0);

  const state = loadState(input.session_id);
  state.turn += 1;
  state.blocks = 0; // fresh turn, fresh block budget

  let context = "";
  if (!state.soulInjected) {
    context = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "soul.md"), "utf8");
    state.soulInjected = true;
  } else if (!state.verifyAfterEdit) {
    context = "PIPELINE: product edits from earlier are still UNVERIFIED — run the relevant test/build/typecheck before claiming anything about them.";
  }

  saveState(input.session_id, state);
  if (context) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: context },
    }));
  }
} catch { /* never block on malfunction */ }
process.exit(0);
