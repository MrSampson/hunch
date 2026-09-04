/** Opt-out-able check for a newer published `@davesheffer/hunch` release. Wired
 *  into the CLI (never `hunch mcp`, which has no interactive human reading
 *  stderr) as a fire-and-forget preAction hook — this never delays or fails a
 *  command. Every failure mode (network, malformed cache, malformed registry
 *  response) degrades to `null`, same posture as the agent hook's own
 *  never-block invariant (con_03a0b94b2e), even though this isn't that hook. */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HUNCH_VERSION } from "./version.js";

const REGISTRY_URL = "https://registry.npmjs.org/@davesheffer/hunch/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 1500;

export interface UpdateCheckResult {
  current: string;
  latest: string;
}

export interface UpdateCheckOptions {
  cacheFile?: string;
  currentVersion?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

interface UpdateCheckCache {
  lastCheckedAt: number;
  latestSeen: string;
}

function defaultCacheFile(): string {
  return join(homedir(), ".hunch-update-check.json");
}

function readCache(file: string): UpdateCheckCache | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<UpdateCheckCache>;
    if (typeof parsed.lastCheckedAt === "number" && typeof parsed.latestSeen === "string") {
      return { lastCheckedAt: parsed.lastCheckedAt, latestSeen: parsed.latestSeen };
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(file: string, cache: UpdateCheckCache): void {
  try {
    writeFileSync(file, JSON.stringify(cache));
  } catch {
    // Best-effort — a lost cache write just means the next invocation re-checks.
  }
}

/** Split a semver-shaped string into its numeric release core and an optional
 *  prerelease tag. Build metadata (`+...`) is dropped per semver, since it
 *  carries no ordering meaning. */
function parseVersion(v: string): { core: number[]; prerelease: string | null } {
  const withoutBuildMeta = v.split("+")[0] ?? "";
  const [main, ...prereleaseParts] = withoutBuildMeta.split("-");
  return {
    core: (main ?? "").split(".").map((p) => Number.parseInt(p, 10) || 0),
    prerelease: prereleaseParts.length > 0 ? prereleaseParts.join("-") : null,
  };
}

/** True if `a` is a strictly newer semver-shaped version than `b`. Non-numeric
 *  release segments compare as 0, so malformed input degrades to "not newer"
 *  rather than throwing. A prerelease (`-beta.1`) is always older than its own
 *  base release, matching semver precedence — otherwise an accidental `latest`
 *  dist-tag promotion of a prerelease would tell users already on the real
 *  release to "upgrade" to something older. */
function isNewerVersion(a: string, b: string): boolean {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < Math.max(va.core.length, vb.core.length); i++) {
    const diff = (va.core[i] ?? 0) - (vb.core[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  if (va.prerelease === vb.prerelease) return false;
  if (va.prerelease === null) return true; // release beats any prerelease of the same core
  if (vb.prerelease === null) return false; // prerelease never beats a release of the same core
  return va.prerelease > vb.prerelease;
}

async function fetchLatestVersion(fetchImpl: typeof fetch): Promise<string | null> {
  try {
    const res = await fetchImpl(REGISTRY_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

export interface UpdateCheckGateOptions {
  commandName: string;
  isTTY: boolean;
}

/** Gates whether the CLI should even attempt `checkForUpdate` — kept separate
 *  and pure so the wiring itself (not just checkForUpdate's own logic) is unit
 *  testable without spawning a real process or depending on network
 *  reachability. `hunch mcp` has no interactive human reading stderr; neither
 *  does any piped/redirected/spawned invocation (isTTY false) — the latter is
 *  what keeps this repo's own spawnSync(...)-based CLI tests (piped stdio) from
 *  making a real registry call and writing a real cache file to $HOME as a side
 *  effect of running the test suite. */
export function shouldCheckForUpdate({ commandName, isTTY }: UpdateCheckGateOptions): boolean {
  return commandName !== "mcp" && isTTY;
}

export function formatUpdateNotice(result: UpdateCheckResult): string {
  return (
    `A newer version of hunch is available: ${result.current} -> ${result.latest}\n` +
    "Run `npm install -g @davesheffer/hunch@latest` to update."
  );
}

export async function checkForUpdate(opts: UpdateCheckOptions = {}): Promise<UpdateCheckResult | null> {
  const env = opts.env ?? process.env;
  if (env.CI || env.HUNCH_NO_UPDATE_CHECK) return null;

  const cacheFile = opts.cacheFile ?? defaultCacheFile();
  const currentVersion = opts.currentVersion ?? HUNCH_VERSION;
  const now = opts.now ?? (() => Date.now());
  const fetchImpl = opts.fetchImpl ?? fetch;

  const cached = readCache(cacheFile);
  let latest: string | null;
  if (cached && now() - cached.lastCheckedAt < CHECK_INTERVAL_MS) {
    latest = cached.latestSeen;
  } else {
    latest = await fetchLatestVersion(fetchImpl);
    if (latest === null) return null;
    writeCache(cacheFile, { lastCheckedAt: now(), latestSeen: latest });
  }

  return isNewerVersion(latest, currentVersion) ? { current: currentVersion, latest } : null;
}
