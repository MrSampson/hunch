// Shared state + profile logic for the pipeline hooks.
// Invariant (mirrors hunch hookpolicy): any error anywhere -> caller emits nothing, exit 0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(tmpdir(), "claude-pipeline");

export function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return null; }
}

export function loadProfiles() {
  return JSON.parse(readFileSync(join(HERE, "profiles.json"), "utf8"));
}

const defaultState = () => ({
  turn: 0,
  soulInjected: false,
  blocks: 0,
  domains: {},          // { backend: true, ... } — activated by edited paths
  editedFiles: [],
  lastEditTs: 0,
  verifyAfterEdit: true, // vacuously true until a product edit happens
  evidenceObserved: false,
});

export function loadState(sessionId) {
  try {
    const s = JSON.parse(readFileSync(join(STATE_DIR, `${sessionId}.json`), "utf8"));
    return { ...defaultState(), ...s };
  } catch { return defaultState(); }
}

export function saveState(sessionId, state) {
  mkdirSync(STATE_DIR, { recursive: true });
  const p = join(STATE_DIR, `${sessionId}.json`);
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  writeFileSync(p, JSON.stringify(state)); // tmp+rename not critical for scratch state
}

export function classifyPath(path, profiles) {
  const hits = [];
  for (const [name, d] of Object.entries(profiles.domains)) {
    if (new RegExp(d.paths, "i").test(path)) hits.push(name);
  }
  return hits;
}

// product code = things whose behavior ships; docs/config-of-this-engine excluded
export function isProductPath(p) {
  const norm = String(p).replace(/\\/g, "/");
  if (/\.(md|txt|json)$/i.test(norm) && !/package\.json$/i.test(norm)) return false;
  if (/\/\.claude\/|\/\.hunch\//.test(norm)) return false;
  return true;
}

export function verifyPatternFor(state, profiles) {
  const active = Object.keys(state.domains);
  const pats = (active.length ? active : Object.keys(profiles.domains))
    .map((d) => profiles.domains[d]?.verify)
    .filter(Boolean);
  return new RegExp(pats.join("|"), "i");
}

export function payloadFiles(state, profiles) {
  return Object.keys(state.domains)
    .map((d) => profiles.domains[d]?.payload)
    .filter(Boolean)
    .map((f) => join(HERE, "..", "skills", "fable-mode", "references", f))
    .filter((p) => existsSync(p));
}
