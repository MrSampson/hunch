// PostToolUse hook (Edit|Write|MultiEdit|Bash|Skill): record observable facts.
// Gates read these facts; the model's claims are never consulted.
import { classifyPath, isProductPath, loadProfiles, loadState, readStdin, saveState, verifyPatternFor } from "./engine.mjs";

try {
  const input = readStdin();
  if (!input?.session_id || !input.tool_name) process.exit(0);

  const state = loadState(input.session_id);
  const profiles = loadProfiles();

  if (/^(Edit|Write|MultiEdit)$/.test(input.tool_name)) {
    const p = input.tool_input?.file_path ?? "";
    if (p && isProductPath(p)) {
      state.lastEditTs = Date.now();
      state.verifyAfterEdit = false;
      if (!state.editedFiles.includes(p)) state.editedFiles.push(p);
      for (const d of classifyPath(p.replace(/\\/g, "/"), profiles)) state.domains[d] = true;
    }
  }

  if (input.tool_name === "Bash" || input.tool_name === "PowerShell") {
    const cmd = String(input.tool_input?.command ?? "");
    const resp = JSON.stringify(input.tool_response ?? "");
    // 1.4.1 credit rules: generic runners and commands naming an edited file
    // are verification too — uncredited real checks breed gate fatigue.
    const editedNamed = state.editedFiles.some((f) => {
      const base = String(f).replace(/\\/g, "/").split("/").pop();
      return !!base && cmd.includes(base);
    });
    if (verifyPatternFor(state, profiles).test(cmd) || /node (--test|-e\b)/.test(cmd) || editedNamed) {
      if (state.lastEditTs > 0) state.verifyAfterEdit = true;
      else state.evidenceObserved = true;
    }
    if (/FAIL|failed|Error|AssertionError|exit code [1-9]/.test(resp) && state.lastEditTs === 0) {
      state.evidenceObserved = true; // saw the breakage before editing — evidence gate
    }
  }

  if (input.tool_name === "Skill") {
    const s = String(input.tool_input?.skill ?? "");
    if (/code-review|verify|review/.test(s)) state.verifyAfterEdit = true;
  }

  saveState(input.session_id, state);
} catch { /* facts missed beat work blocked */ }
process.exit(0);
