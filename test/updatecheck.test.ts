import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkForUpdate, formatUpdateNotice, shouldCheckForUpdate } from "../src/core/updatecheck.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function tmpCacheFile(): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "hunch-updatecheck-"));
  return { dir, file: join(dir, "cache.json") };
}

function fakeFetchOk(version: string): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => ({ version }),
  })) as unknown as typeof fetch;
}

function fetchShouldNotBeCalled(): typeof fetch {
  return (async () => {
    throw new Error("fetch should not have been called");
  }) as unknown as typeof fetch;
}

test("reports a newer version when the registry has one", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 0,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null when already on the latest version", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("1.0.0"),
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null when the local build is ahead of the registry", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "2.0.0",
      fetchImpl: fakeFetchOk("1.0.0"),
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("does not treat a prerelease as newer than its own base release", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.24.0",
      fetchImpl: fakeFetchOk("1.24.0-beta.1"),
      now: () => 0,
      env: {},
    });
    assert.equal(result, null, "a prerelease of the currently-installed version is not an upgrade");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reports a real release as newer than a prerelease of the same version currently installed", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.24.0-beta.1",
      fetchImpl: fakeFetchOk("1.24.0"),
      now: () => 0,
      env: {},
    });
    assert.deepEqual(result, { current: "1.24.0-beta.1", latest: "1.24.0" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("persists the latest-seen version to the cache file after a successful check", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 12345,
      env: {},
    });
    const cached = JSON.parse(readFileSync(file, "utf8")) as { lastCheckedAt: number; latestSeen: string };
    assert.equal(cached.lastCheckedAt, 12345);
    assert.equal(cached.latestSeen, "9.9.9");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips the network call within the 24h cache window", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, JSON.stringify({ lastCheckedAt: 1_000_000, latestSeen: "9.9.9" }));
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fetchShouldNotBeCalled(),
      now: () => 1_000_000 + DAY_MS - 1,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("re-checks once the cache entry is older than 24h", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, JSON.stringify({ lastCheckedAt: 1_000_000, latestSeen: "1.0.0" }));
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 1_000_000 + DAY_MS + 1,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("re-checks exactly on the 24h cache boundary (treats it as expired)", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, JSON.stringify({ lastCheckedAt: 1_000_000, latestSeen: "1.0.0" }));
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 1_000_000 + DAY_MS,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" }, "exactly 24h old counts as expired, not fresh");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("treats a valid-JSON but wrong-shaped cache file as absent and re-fetches", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, JSON.stringify({ lastCheckedAt: "not-a-number" }));
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 0,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null, not a thrown rejection, when the registry response body fails to parse as JSON", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const brokenJsonFetch = (async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected end of JSON input");
      },
    })) as unknown as typeof fetch;
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: brokenJsonFetch,
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("still returns the correct result when persisting the cache fails", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    // A cache path inside a nonexistent directory makes the write fail (ENOENT).
    const unwritableFile = join(dir, "does-not-exist", "cache.json");
    const result = await checkForUpdate({
      cacheFile: unwritableFile,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 0,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" }, "a lost cache write must not affect the returned result");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null and never throws on a network failure", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: failingFetch,
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null on a non-OK registry response", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const notOkFetch = (async () => ({
      ok: false,
      json: async () => ({ version: "9.9.9" }),
    })) as unknown as typeof fetch;
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: notOkFetch,
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null on a malformed registry response", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const malformedFetch = (async () => ({
      ok: true,
      json: async () => ({ notVersion: "oops" }),
    })) as unknown as typeof fetch;
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: malformedFetch,
      now: () => 0,
      env: {},
    });
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returns null on a corrupt cache file, without throwing", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    writeFileSync(file, "{not json");
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fakeFetchOk("9.9.9"),
      now: () => 0,
      env: {},
    });
    assert.deepEqual(result, { current: "1.0.0", latest: "9.9.9" }, "recovers by treating a corrupt cache as absent");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("shouldCheckForUpdate: false for hunch mcp, regardless of TTY", () => {
  assert.equal(shouldCheckForUpdate({ commandName: "mcp", isTTY: true }), false);
  assert.equal(shouldCheckForUpdate({ commandName: "mcp", isTTY: false }), false);
});

test("shouldCheckForUpdate: false when stderr is not a TTY — this is what keeps every spawnSync(...)-based CLI test in this suite (piped stdio, so never a TTY) from making a real registry call and writing a real cache file to $HOME as a side effect of running `npm test`", () => {
  assert.equal(shouldCheckForUpdate({ commandName: "doctor", isTTY: false }), false);
});

test("shouldCheckForUpdate: true for an ordinary command run at an interactive terminal", () => {
  assert.equal(shouldCheckForUpdate({ commandName: "doctor", isTTY: true }), true);
});

test("skips the check entirely when CI is set", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fetchShouldNotBeCalled(),
      now: () => 0,
      env: { CI: "true" },
    });
    assert.equal(result, null);
    assert.equal(existsSync(file), false, "no cache file written when skipped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("formats the update notice with the current and latest versions and an upgrade command", () => {
  const message = formatUpdateNotice({ current: "1.0.0", latest: "1.2.0" });
  assert.match(message, /1\.0\.0/);
  assert.match(message, /1\.2\.0/);
  assert.match(message, /npm install -g @davesheffer\/hunch@latest/);
});

test("skips the check entirely when HUNCH_NO_UPDATE_CHECK is set", async () => {
  const { dir, file } = tmpCacheFile();
  try {
    const result = await checkForUpdate({
      cacheFile: file,
      currentVersion: "1.0.0",
      fetchImpl: fetchShouldNotBeCalled(),
      now: () => 0,
      env: { HUNCH_NO_UPDATE_CHECK: "1" },
    });
    assert.equal(result, null);
    assert.equal(existsSync(file), false, "no cache file written when skipped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
