import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSource, attributeCalls } from "../src/extractors/parse.js";

const SRC = `
import { jwtDecode } from "./jwt.js";
import bare from "external";
export function verifySession(token: string): string | null {
  const id = jwtDecode(token);
  return id;
}
export const helper = (x: number) => verifySession(String(x));
class Service { run() { return helper(1); } }
interface Shape { a: number }
type Alias = string;
`;

test("parseSource extracts symbols, imports, calls", () => {
  const p = parseSource("src/auth/session.ts", SRC)!;
  const names = p.symbols.map((s) => s.name).sort();
  assert.deepEqual(names, ["Alias", "Service", "Shape", "helper", "run", "verifySession"].sort());
  assert.deepEqual(p.imports.sort(), ["./jwt.js", "external"].sort());
  assert.ok(p.calls.some((c) => c.callee === "jwtDecode"));
});

test("attributeCalls maps callee to enclosing symbol (keyed by stable byte offset)", () => {
  const p = parseSource("f.ts", SRC)!;
  const attr = attributeCalls(p); // Map<startByte, Set<callee>>
  const sb = (name: string) => p.symbols.find((s) => s.name === name)!.startByte;
  assert.ok(attr.get(sb("verifySession"))?.has("jwtDecode"));
  assert.ok(attr.get(sb("helper"))?.has("verifySession"));
  assert.ok(attr.get(sb("run"))?.has("helper"));
});

test("non-code files return null", () => {
  assert.equal(parseSource("readme.md", "# hi"), null);
});

test("parses files >= 32 KB without throwing (regression: critical bufferSize bug)", () => {
  const big = "export function f0(){ return 0; }\n" + "const x=1;\n".repeat(5000); // ~55 KB
  assert.ok(big.length > 32768);
  const p = parseSource("big.ts", big);
  assert.ok(p, "did not return null/throw on a 55 KB file");
  assert.ok(p!.symbols.some((s) => s.name === "f0"), "still extracts symbols from a large file");
});

test("builtin method calls (.map/.push/...) do NOT become call edges (regression #4)", () => {
  const src = `function f(xs){ return xs.map(g).filter(h).push(1); }\nfunction g(){} function h(){}`;
  const p = parseSource("m.ts", src)!;
  const attr = attributeCalls(p); // Map<startByte, Map<callee, memberOnly>>
  const sb = p.symbols.find((s) => s.name === "f")!.startByte;
  const callees = attr.get(sb) ?? new Map<string, boolean>();
  assert.ok(!callees.has("map") && !callees.has("filter") && !callees.has("push"), "no builtin-method edges");
});

const PY_SRC = `
import os
from .jwt import decode_token
import external_pkg

def verify_session(token):
    id = decode_token(token)
    return id

class Service:
    def run(self):
        return verify_session("x")

async def async_helper():
    return verify_session("y")
`;

test("parseSource extracts Python symbols, imports, calls", () => {
  const p = parseSource("src/auth/session.py", PY_SRC)!;
  assert.ok(p, "python file did not parse");
  const names = p.symbols.map((s) => s.name).sort();
  assert.deepEqual(names, ["async_helper", "run", "verify_session", "Service"].sort());
  const kindOf = (n: string) => p.symbols.find((s) => s.name === n)!.kind;
  assert.equal(kindOf("verify_session"), "function");
  assert.equal(kindOf("async_helper"), "function");
  assert.equal(kindOf("Service"), "class");
  assert.equal(kindOf("run"), "method");
  assert.deepEqual(p.imports.sort(), [".jwt", "external_pkg", "os"].sort());
  assert.ok(p.calls.some((c) => c.callee === "decode_token"));
});

test("attributeCalls resolves Python calls to their enclosing symbol", () => {
  const p = parseSource("f.py", PY_SRC)!;
  const attr = attributeCalls(p);
  const sb = (name: string) => p.symbols.find((s) => s.name === name)!.startByte;
  assert.ok(attr.get(sb("verify_session"))?.has("decode_token"));
  assert.ok(attr.get(sb("run"))?.has("verify_session"));
  assert.ok(attr.get(sb("async_helper"))?.has("verify_session"));
});

test("Python builtin dict/list/str methods do NOT become call edges", () => {
  const src = `def f(xs):\n    return xs.get("k").strip().append(1)\n\ndef g():\n    pass\n`;
  const p = parseSource("m.py", src)!;
  const attr = attributeCalls(p);
  const sb = p.symbols.find((s) => s.name === "f")!.startByte;
  const callees = attr.get(sb) ?? new Map<string, boolean>();
  assert.ok(!callees.has("get") && !callees.has("strip") && !callees.has("append"), "no builtin-method edges");
});

test("parses a >=32KB Python file without throwing", () => {
  const big = "def f0():\n    return 0\n" + "x = 1\n".repeat(6000); // well over 32 KB
  assert.ok(big.length > 32768);
  const p = parseSource("big.py", big);
  assert.ok(p, "did not return null/throw on a large Python file");
  assert.ok(p!.symbols.some((s) => s.name === "f0"));
});
