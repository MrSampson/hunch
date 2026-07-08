// Stop hook: the enforcement wall. Turn may not end with unverified product edits.
// Max 2 blocks per turn — a broken gate degrades to advisory, never a lockout.
import { loadState, readStdin, saveState } from "./engine.mjs";

try {
  const input = readStdin();
  if (!input?.session_id) process.exit(0);

  const state = loadState(input.session_id);

  const mustBlock = state.editedFiles.length > 0 && !state.verifyAfterEdit && state.blocks < 2;
  if (!mustBlock) process.exit(0);

  state.blocks += 1;
  saveState(input.session_id, state);

  const domains = Object.keys(state.domains).join(", ") || "generic";
  process.stdout.write(JSON.stringify({
    decision: "block",
    reason:
      `PIPELINE GATE — VERIFY unsatisfied. Product files were edited (${state.editedFiles.slice(-5).join(", ")}) ` +
      `but no verifying command ran afterwards (domain: ${domains}). Do now, in order: ` +
      `(1) run the relevant test/build/typecheck for those files; ` +
      `(2) one honest paragraph attacking your own conclusion — what would make it wrong; ` +
      `(3) report what ran, what passed, what stays unverified. If verification is truly impossible here, say so explicitly and why.`,
  }));
} catch { /* never trap the user in a loop */ }
process.exit(0);
