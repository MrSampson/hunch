import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPendingRepairs, writePendingRepairs } from "../src/core/repairqueue.js";

function tmpRoot(): { root: string; cleanup(): void } {
  const root = mkdtempSync(join(tmpdir(), "hunch-repairqueue-"));
  mkdirSync(join(root, ".hunch"), { recursive: true });
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("readPendingRepairs: returns an empty array when the queue file doesn't exist", () => {
  const { root, cleanup } = tmpRoot();
  try {
    assert.deepEqual(readPendingRepairs(root), []);
  } finally { cleanup(); }
});

test("writePendingRepairs then readPendingRepairs round-trips exactly", () => {
  const { root, cleanup } = tmpRoot();
  try {
    const rewrites = [{ id: "dec_1", from: "sha_old", to: "sha_new" }];
    writePendingRepairs(root, rewrites);
    assert.deepEqual(readPendingRepairs(root), rewrites);
  } finally { cleanup(); }
});

test("readPendingRepairs: tolerant of corrupt JSON — returns an empty array, never throws", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(join(root, ".hunch", "pending-commit-repairs.json"), "{not valid json");
    assert.deepEqual(readPendingRepairs(root), []);
  } finally { cleanup(); }
});

test("readPendingRepairs: tolerant of a non-array JSON value — returns an empty array", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(join(root, ".hunch", "pending-commit-repairs.json"), JSON.stringify({ not: "an array" }));
    assert.deepEqual(readPendingRepairs(root), []);
  } finally { cleanup(); }
});

test("readPendingRepairs: filters out malformed entries but keeps valid ones", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(
      join(root, ".hunch", "pending-commit-repairs.json"),
      JSON.stringify([{ id: "dec_1", from: "a", to: "b" }, { id: "dec_2" }, "garbage", null]),
    );
    assert.deepEqual(readPendingRepairs(root), [{ id: "dec_1", from: "a", to: "b" }]);
  } finally { cleanup(); }
});

test("readPendingRepairs: filters out an entry with an empty to/from — never a useful rewrite target", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(
      join(root, ".hunch", "pending-commit-repairs.json"),
      JSON.stringify([{ id: "dec_1", from: "a", to: "b" }, { id: "dec_empty_to", from: "a", to: "" }, { id: "dec_empty_from", from: "", to: "b" }]),
    );
    assert.deepEqual(readPendingRepairs(root), [{ id: "dec_1", from: "a", to: "b" }]);
  } finally { cleanup(); }
});

test("readPendingRepairs: filters out an entry with an empty id", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(
      join(root, ".hunch", "pending-commit-repairs.json"),
      JSON.stringify([{ id: "", from: "a", to: "b" }, { id: "dec_ok", from: "a", to: "b" }]),
    );
    assert.deepEqual(readPendingRepairs(root), [{ id: "dec_ok", from: "a", to: "b" }]);
  } finally { cleanup(); }
});

test("readPendingRepairs: filters out a no-op entry (to === from) — applying it would accomplish nothing", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writeFileSync(
      join(root, ".hunch", "pending-commit-repairs.json"),
      JSON.stringify([{ id: "dec_1", from: "a", to: "b" }, { id: "dec_noop", from: "a", to: "a" }]),
    );
    assert.deepEqual(readPendingRepairs(root), [{ id: "dec_1", from: "a", to: "b" }]);
  } finally { cleanup(); }
});

test("writePendingRepairs([]) clears the queue", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writePendingRepairs(root, [{ id: "dec_1", from: "a", to: "b" }]);
    writePendingRepairs(root, []);
    assert.deepEqual(readPendingRepairs(root), []);
  } finally { cleanup(); }
});

test("writePendingRepairs: writes valid, human-readable JSON to the expected path", () => {
  const { root, cleanup } = tmpRoot();
  try {
    writePendingRepairs(root, [{ id: "dec_1", from: "a", to: "b" }]);
    const raw = readFileSync(join(root, ".hunch", "pending-commit-repairs.json"), "utf8");
    assert.deepEqual(JSON.parse(raw), [{ id: "dec_1", from: "a", to: "b" }]);
  } finally { cleanup(); }
});
