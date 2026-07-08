# Multi-Language Code Awareness (Python First) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hunch's `index`/`backfill`/`sync` pipeline understand Python (`.py`), by collapsing three duplicated JS/TS-only extension checks into one language registry and adding a `tree-sitter-python` grammar.

**Architecture:** A new `src/extractors/languages.ts` module exports a `LanguageSpec` per language (extensions, tree-sitter grammar/query, def-node types, builtin-method suppression list). `src/extractors/parse.ts` becomes a generic engine over whichever `LanguageSpec` matches a file. `src/extractors/indexer.ts`, `src/extractors/diff.ts`, and `src/synthesis/synthesize.ts` all derive their "is this a code file" check from the registry's `CODE_EXTENSIONS` instead of each hardcoding their own regex/list. `diff.ts`'s declaration/import regex scanner (separate from tree-sitter, used for the pre-LLM substance heuristic) gets its own Python-aware patterns.

**Tech Stack:** TypeScript (strict, ESM, Node ≥22.13), native `tree-sitter` 0.21.1 + `tree-sitter-typescript` ^0.23.2 (existing) + `tree-sitter-python` ^0.23.2 (new), `node:test`/`node:assert` for tests (no test framework dependency).

## Global Constraints

- Node ≥22.13.0, pure ESM, no build step at dev time (`tsx` runs source directly).
- `tsc --noEmit` (via `npm run typecheck`) must stay clean — strict mode, `noUncheckedIndexedAccess`.
- Tests run via `npm test` (`tsx --test test/*.test.ts`) — every new test file must match that glob and use `node:test`/`node:assert/strict`, matching the existing style in `test/parse.test.ts` / `test/indexer.test.ts` / `test/upgrades.test.ts` / `test/integration.test.ts`.
- No behavior change to existing TypeScript/JavaScript parsing, indexing, diffing, or synthesis — every existing test file must stay green throughout (`test/parse.test.ts`, `test/indexer.test.ts`, `test/upgrades.test.ts`, `test/synthesis.test.ts`, `test/integration.test.ts`).
- Cross-file Python import/dependency-edge resolution is explicitly OUT of scope (tracked in [#5](https://github.com/MrSampson/hunch/issues/5)) — Python imports are captured as symbol-level `imports: string[]` only, never resolved to `depends_on` component edges.
- The squash-merge/`SKIP_SUBJECT` synthesizer gap is OUT of scope (tracked in [#4](https://github.com/MrSampson/hunch/issues/4)).
- Spec: `docs/superpowers/specs/2026-07-08-multi-language-code-awareness-design.md`.

---

### Task 1: Language registry module (TypeScript-only, lossless extraction)

**Files:**
- Create: `src/extractors/languages.ts`
- Test: `test/languages.test.ts`

**Interfaces:**
- Produces:
  - `export type ParsedSymbolKind = "function" | "method" | "class" | "interface" | "type";`
  - `export interface LanguageSpec { id: string; extensions: string[]; grammarKey: string; loadGrammar(): unknown; query: string; defNodeTypes: Set<string>; defKindOf: Record<string, ParsedSymbolKind>; nameToDef: Record<string, string>; builtinMethods: Set<string>; }`
  - `export const LANGUAGES: LanguageSpec[];`
  - `export const CODE_EXTENSIONS: string[];` (flattened, deduped `LANGUAGES[].extensions`)
  - `export function languageFor(file: string): LanguageSpec | null;`

This task moves the TypeScript/JS constants that already live in `src/extractors/parse.ts` (the `QUERY_SRC` string, the `defKind`/`nameToDef` records, the `BUILTIN_METHODS` set, and the `pickLanguage()` extension list) into a `LanguageSpec` entry, with zero behavior change — `parse.ts` isn't touched yet (that's Task 2).

- [ ] **Step 1: Write the failing test**

Create `test/languages.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANGUAGES, CODE_EXTENSIONS, languageFor } from "../src/extractors/languages.js";

test("LANGUAGES has typescript entries covering both grammars (plain + tsx)", () => {
  assert.ok(LANGUAGES.length >= 2, "expected a plain-TS entry and a TSX entry");
  assert.ok(LANGUAGES.every((l) => l.id === "typescript"));
});

test("CODE_EXTENSIONS matches the existing TS/JS extension list", () => {
  assert.deepEqual(
    [...CODE_EXTENSIONS].sort(),
    [".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"].sort(),
  );
});

test("languageFor resolves every TS/JS extension to the typescript LanguageSpec", () => {
  for (const ext of [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]) {
    const lang = languageFor(`file${ext}`);
    assert.ok(lang, `no LanguageSpec for ${ext}`);
    assert.equal(lang!.id, "typescript");
  }
});

test("languageFor returns null for a non-code file", () => {
  assert.equal(languageFor("README.md"), null);
});

test("the typescript LanguageSpec's builtinMethods includes the existing JS builtin allowlist", () => {
  const ts = LANGUAGES.find((l) => l.id === "typescript")!;
  for (const m of ["map", "filter", "push", "then", "toString"]) {
    assert.ok(ts.builtinMethods.has(m), `missing builtin method ${m}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/languages.test.ts`
Expected: FAIL — `Cannot find module '../src/extractors/languages.js'`

- [ ] **Step 3: Write the implementation**

Create `src/extractors/languages.ts`:

```ts
/**
 * Language registry: one LanguageSpec per supported language, consumed by
 * parse.ts (tree-sitter grammar/query dispatch), indexer.ts / diff.ts /
 * synthesize.ts ("is this a code file?"). Adding a language is a new entry
 * here (+ a new tree-sitter-* dependency), not edits scattered across those
 * four files.
 */
import TS from "tree-sitter-typescript";

const { typescript, tsx } = TS as unknown as { typescript: unknown; tsx: unknown };

export type ParsedSymbolKind = "function" | "method" | "class" | "interface" | "type";

export interface LanguageSpec {
  /** Stable id, also used as the grammar-bundle cache key by parse.ts. */
  id: string;
  extensions: string[];
  /** Cache key parse.ts's bundleFor() uses (one grammar+query pair may serve
   *  several extensions, e.g. tsx serves both .tsx and .jsx). */
  grammarKey: string;
  /** Lazily returns the tree-sitter Language object for this spec. */
  loadGrammar(): unknown;
  /** Tree-sitter query source capturing every construct this language cares about. */
  query: string;
  /** Node types ascendToDef() walks up to when resolving a name capture's enclosing def. */
  defNodeTypes: Set<string>;
  /** Query capture-name (ending in ".def") -> the ParsedSymbolKind it represents. */
  defKindOf: Record<string, ParsedSymbolKind>;
  /** Query capture-name (ending in ".name") -> the matching ".def" capture-name. */
  nameToDef: Record<string, string>;
  /** Common builtin/stdlib method names. Member calls to these (e.g. `arr.map(...)`)
   *  must NOT create call edges to unrelated repo symbols that happen to share the
   *  name (DESIGN: keep the graph clean). */
  builtinMethods: Set<string>;
}

const TS_QUERY = `
  (function_declaration name: (identifier) @fn.name) @fn.def
  (generator_function_declaration name: (identifier) @fn.name) @fn.def
  (method_definition name: (property_identifier) @method.name) @method.def
  (class_declaration name: (type_identifier) @class.name) @class.def
  (interface_declaration name: (type_identifier) @iface.name) @iface.def
  (type_alias_declaration name: (type_identifier) @type.name) @type.def
  (variable_declarator
     name: (identifier) @arrow.name
     value: [(arrow_function) (function_expression)]) @arrow.def
  (import_statement source: (string) @import.src)
  (call_expression function: (identifier) @call.id)
  (call_expression function: (member_expression property: (property_identifier) @call.member))
`;

const TS_BUILTIN_METHODS = new Set([
  "map", "filter", "forEach", "reduce", "find", "findIndex", "some", "every", "includes",
  "push", "pop", "shift", "unshift", "slice", "splice", "concat", "join", "split", "flat", "flatMap",
  "indexOf", "lastIndexOf", "keys", "values", "entries", "sort", "reverse", "fill", "at",
  "get", "set", "has", "add", "delete", "clear",
  "then", "catch", "finally", "all", "race", "resolve", "reject",
  "toString", "valueOf", "toJSON", "hasOwnProperty",
  "replace", "replaceAll", "trim", "trimStart", "trimEnd", "padStart", "padEnd", "startsWith", "endsWith",
  "toLowerCase", "toUpperCase", "charAt", "charCodeAt", "substring", "substr", "repeat", "match", "matchAll",
  "call", "apply", "bind", "test", "exec", "now", "parse", "stringify", "from", "of", "isArray", "assign",
  "log", "error", "warn", "info", "debug",
]);

const TS_SHARED = {
  id: "typescript",
  query: TS_QUERY,
  defNodeTypes: new Set([
    "function_declaration", "generator_function_declaration", "method_definition",
    "class_declaration", "interface_declaration", "type_alias_declaration", "variable_declarator",
  ]),
  defKindOf: {
    "fn.def": "function", "method.def": "method", "class.def": "class",
    "iface.def": "interface", "type.def": "type", "arrow.def": "function",
  },
  nameToDef: {
    "fn.name": "fn.def", "method.name": "method.def", "class.name": "class.def",
    "iface.name": "iface.def", "type.name": "type.def", "arrow.name": "arrow.def",
  },
  builtinMethods: TS_BUILTIN_METHODS,
} as const;

const TYPESCRIPT: LanguageSpec = {
  ...TS_SHARED,
  extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
  grammarKey: "ts",
  loadGrammar: () => typescript,
};

/** .tsx/.jsx use the TSX grammar variant; everything else in the TS spec uses
 *  the plain typescript grammar. Both share the same query/def maps/builtins,
 *  so this is a second LanguageSpec entry with a distinct grammarKey/loadGrammar
 *  only — not a second `id` (languageFor callers only care about extension match). */
const TSX: LanguageSpec = {
  ...TS_SHARED,
  extensions: [".tsx", ".jsx"],
  grammarKey: "tsx",
  loadGrammar: () => tsx,
};

export const LANGUAGES: LanguageSpec[] = [TYPESCRIPT, TSX];

export const CODE_EXTENSIONS: string[] = [...new Set(LANGUAGES.flatMap((l) => l.extensions))];

export function languageFor(file: string): LanguageSpec | null {
  for (const lang of LANGUAGES) {
    if (lang.extensions.some((ext) => file.endsWith(ext))) return lang;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/languages.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/extractors/languages.ts test/languages.test.ts
git commit -m "feat: add language registry (TypeScript/JS entry, lossless extraction from parse.ts)"
```

---

### Task 2: `parse.ts` consumes the registry generically

**Files:**
- Modify: `src/extractors/parse.ts`
- Test: `test/parse.test.ts` (existing — must stay green, no new assertions needed for this task)

**Interfaces:**
- Consumes: `LanguageSpec`, `LANGUAGES`, `languageFor` from `./languages.js` (Task 1); `LanguageSpec.grammarKey`, `.loadGrammar()`, `.query`, `.defNodeTypes`, `.defKindOf`, `.nameToDef`, `.builtinMethods`.
- Produces: `parseSource(file, source): ParsedFile | null` and `attributeCalls(parsed): Map<...>` — UNCHANGED signatures, used by `indexer.ts` (Task 3+).

This is a pure refactor: `parse.ts`'s behavior for every existing TS/JS test case must be byte-identical.

- [ ] **Step 1: Confirm baseline is green**

Run: `npx tsx --test test/parse.test.ts`
Expected: PASS (5 tests) — this is the regression baseline the refactor must not break.

- [ ] **Step 2: Refactor `parse.ts` to dispatch through the registry**

Replace the top of `src/extractors/parse.ts` (imports, `QUERY_SRC`, `BUILTIN_METHODS`, `pickLanguage`, `bundleFor`, `ascendToDef`) with registry-driven versions:

```ts
/**
 * Deterministic tree-sitter parsing (no LLM). Extracts, per file:
 *   - symbols: functions, methods, classes, interfaces, types, arrow-fn consts
 *   - imports: module specifiers (for dependency edges)
 *   - calls:   callee names + byte offset (mapped to the enclosing symbol)
 *
 * Uses NATIVE tree-sitter (synchronous, prebuilt for Node 20 — see decision in
 * the commit history; web-tree-sitter's WASM grammars had an incompatible ABI).
 *
 * Language-specific grammar/query/builtin-method data lives in languages.ts —
 * this file is a generic engine over whichever LanguageSpec matches a file.
 */
import Parser from "tree-sitter";
import type { SyntaxNode } from "tree-sitter";
import { languageFor, type LanguageSpec, type ParsedSymbolKind } from "./languages.js";

export type { ParsedSymbolKind } from "./languages.js";

export interface ParsedSymbol {
  name: string;
  kind: ParsedSymbolKind;
  startByte: number;
  endByte: number;
  loc: number;
  bodyText: string;
}
export interface ParsedCall {
  callee: string;
  atByte: number;
  /** true for `x.foo()` (property access), false for a direct `foo()` call. */
  member: boolean;
}
export interface ParsedFile {
  symbols: ParsedSymbol[];
  imports: string[];
  calls: ParsedCall[];
}

interface LangBundle {
  parser: Parser;
  query: Parser.Query;
}
const cache = new Map<string, LangBundle>();

function bundleFor(spec: LanguageSpec): LangBundle {
  let b = cache.get(spec.grammarKey);
  if (!b) {
    const parser = new Parser();
    const grammar = spec.loadGrammar();
    parser.setLanguage(grammar as never);
    const query = new Parser.Query(grammar as never, spec.query);
    b = { parser, query };
    cache.set(spec.grammarKey, b);
  }
  return b;
}

const STR_QUOTES = /^['"`]|['"`]$/g;

export function parseSource(file: string, source: string): ParsedFile | null {
  const spec = languageFor(file);
  if (!spec) return null;
  const { parser, query } = bundleFor(spec);
  // The native binding caps its scratch buffer at 32 KB unless bufferSize is
  // given — without this, any source >= 32768 bytes throws "Invalid argument"
  // and would abort the whole index run. Guard with try/catch as a backstop.
  let tree;
  try {
    tree = parser.parse(source, undefined, { bufferSize: Math.max(32 * 1024, source.length * 2 + 1024) });
  } catch {
    return null;
  }
  const symbols: ParsedSymbol[] = [];
  const imports: string[] = [];
  const calls: ParsedCall[] = [];

  // group captures by their enclosing @*.def via a quick pass: we record names
  // keyed by the def node, then emit a symbol per def.
  const pendingDefs = new Map<number, { kind: ParsedSymbolKind; def: SyntaxNode; name?: string }>();

  for (const cap of query.captures(tree.rootNode)) {
    const cname = cap.name;
    const node = cap.node;
    if (cname.endsWith(".def")) {
      // Keep the FIRST classification a node id receives: a query may have
      // several patterns matching the same node at different specificity
      // (e.g. a Python method inside a class body matches both a class-nested
      // "method.def" pattern and a general "fn.def" pattern — Task 4 relies on
      // this to classify methods correctly without special-casing Python here).
      if (!pendingDefs.has(node.id)) pendingDefs.set(node.id, { kind: spec.defKindOf[cname]!, def: node });
    } else if (spec.nameToDef[cname]) {
      // name capture: find its parent def node id by walking up to the def type
      const defNode = ascendToDef(node, spec.defNodeTypes);
      if (defNode) {
        const existing = pendingDefs.get(defNode.id);
        if (existing) existing.name = node.text;
        else pendingDefs.set(defNode.id, { kind: spec.defKindOf[spec.nameToDef[cname]!]!, def: defNode, name: node.text });
      }
    } else if (cname === "import.src") {
      imports.push(node.text.replace(STR_QUOTES, ""));
    } else if (cname === "call.id") {
      calls.push({ callee: node.text, atByte: node.startIndex, member: false });
    } else if (cname === "call.member") {
      // skip builtin method names to avoid false edges to similarly-named symbols
      if (!spec.builtinMethods.has(node.text)) calls.push({ callee: node.text, atByte: node.startIndex, member: true });
    }
  }

  for (const { kind, def, name } of pendingDefs.values()) {
    if (!name) continue;
    const loc = def.endPosition.row - def.startPosition.row + 1;
    symbols.push({
      name, kind,
      startByte: def.startIndex, endByte: def.endIndex, loc,
      bodyText: def.text.slice(0, 4000),
    });
  }
  symbols.sort((a, b) => a.startByte - b.startByte);
  return { symbols, imports, calls };
}

/** Walk up to the nearest node whose type is a definition this language recognizes. */
function ascendToDef(node: SyntaxNode, defNodeTypes: Set<string>): SyntaxNode | null {
  let cur: SyntaxNode | null = node.parent;
  while (cur) {
    if (defNodeTypes.has(cur.type)) return cur;
    cur = cur.parent;
  }
  return null;
}
```

Leave `attributeCalls()` (the function below the old `ascendToDef`) exactly as-is — it operates on the already-generic `ParsedFile`/`ParsedSymbol` shape and has no TS-specific logic.

- [ ] **Step 3: Run test to verify the refactor is behavior-preserving**

Run: `npx tsx --test test/parse.test.ts`
Expected: PASS (5 tests), identical to Step 1's baseline.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/extractors/parse.ts
git commit -m "refactor: parse.ts dispatches through the language registry (no behavior change)"
```

---

### Task 3: Wire `CODE_EXTENSIONS` into `indexer.ts`, `diff.ts`, `synthesize.ts`

**Files:**
- Modify: `src/extractors/indexer.ts:18` (`CODE_EXTS`)
- Modify: `src/extractors/diff.ts:52-53` (`CODE_EXT`/`isCode`)
- Modify: `src/synthesis/synthesize.ts:21` (`CODE_RE`)
- Tests: `test/indexer.test.ts`, `test/upgrades.test.ts`, `test/synthesis.test.ts` (existing — must stay green)

**Interfaces:**
- Consumes: `CODE_EXTENSIONS: string[]` from `./languages.js` (Task 1).

- [ ] **Step 1: Confirm baseline is green**

Run: `npx tsx --test test/indexer.test.ts test/upgrades.test.ts test/synthesis.test.ts`
Expected: PASS (all existing tests).

- [ ] **Step 2: `indexer.ts`**

In `src/extractors/indexer.ts`, replace:

```ts
const CODE_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
```

with:

```ts
import { CODE_EXTENSIONS } from "./languages.js";
```

(placed alongside the existing imports at the top of the file), and update the two usages (`trackedFiles(root, CODE_EXTS)` and `CODE_EXTS.some((e) => name.endsWith(e))`) to reference `CODE_EXTENSIONS` instead of `CODE_EXTS`.

- [ ] **Step 3: `diff.ts`**

In `src/extractors/diff.ts`, replace:

```ts
const CODE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const isCode = (p: string) => !!p && CODE_EXT.test(p);
```

with:

```ts
import { CODE_EXTENSIONS } from "./languages.js";

const isCode = (p: string) => !!p && CODE_EXTENSIONS.some((ext) => p.endsWith(ext));
```

- [ ] **Step 4: `synthesize.ts`**

In `src/synthesis/synthesize.ts`, replace:

```ts
const CODE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
```

with:

```ts
import { CODE_EXTENSIONS } from "../extractors/languages.js";
```

(alongside existing imports), and update the one usage:

```ts
const codeFiles = meta.files.filter((f) => CODE_RE.test(f));
```

to:

```ts
const codeFiles = meta.files.filter((f) => CODE_EXTENSIONS.some((ext) => f.endsWith(ext)));
```

- [ ] **Step 5: Run tests to verify no regression**

Run: `npx tsx --test test/indexer.test.ts test/upgrades.test.ts test/synthesis.test.ts test/integration.test.ts`
Expected: PASS (all existing tests, identical results to Step 1's baseline).

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/extractors/indexer.ts src/extractors/diff.ts src/synthesis/synthesize.ts
git commit -m "refactor: derive code-file extension checks from the language registry"
```

---

### Task 4: Python `LanguageSpec` — symbols, imports, calls via `tree-sitter-python`

**Files:**
- Modify: `package.json` (add `tree-sitter-python` dependency)
- Modify: `src/extractors/languages.ts` (add the Python entry)
- Test: `test/parse.test.ts` (add Python cases)

**Interfaces:**
- Consumes: `LanguageSpec` interface from Task 1 (unchanged).
- Produces: a `"python"` entry in `LANGUAGES`, extending `CODE_EXTENSIONS` with `.py`/`.pyi` — consumed transitively by `indexer.ts`/`diff.ts`/`synthesize.ts` via Task 3's wiring (no further changes needed in those files).

- [ ] **Step 1: Add the dependency**

```bash
npm install tree-sitter-python@^0.23.2
```

This version's peer dependency (`tree-sitter: ^0.21.1`) is satisfied by the repo's pinned `tree-sitter@0.21.1`, and it mirrors `tree-sitter-typescript@0.23.2`'s peer range (`^0.21.0`) already in use.

- [ ] **Step 2: Write the failing test**

Add to `test/parse.test.ts` (below the existing TS tests, same file):

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --test test/parse.test.ts`
Expected: FAIL — `parseSource("src/auth/session.py", ...)` returns `null` (no matching `LanguageSpec` yet), so `p!` assertions throw or `assert.ok(p, ...)` fails.

- [ ] **Step 4: Add the Python `LanguageSpec`**

In `src/extractors/languages.ts`, add the import and a new query/builtin-set/spec, then append it to `LANGUAGES`.

A `function_definition` nested inside a `class_definition` body must be classified `"method"`, not `"function"`. The query below handles this with TWO patterns — a specific one matching `function_definition` nested directly in a class body (capture name `method.def`/`method.name`), and a general one matching any `function_definition` (capture name `fn.def`/`fn.name`). Because a nested method's node matches both patterns, `parse.ts`'s capture loop (updated below) must keep the FIRST classification a node id receives rather than letting a later pattern overwrite it — so the class-nested pattern is written first in the query, and tree-sitter emits same-node captures in query pattern-declaration order:

```ts
import Python from "tree-sitter-python";
```

```ts
const PY_QUERY = `
  (class_definition
    name: (identifier) @class.name
    body: (block (function_definition name: (identifier) @method.name) @method.def)) @class.def
  (function_definition name: (identifier) @fn.name) @fn.def
  (import_statement name: (dotted_name) @import.src)
  (import_statement name: (aliased_import name: (dotted_name) @import.src))
  (import_from_statement module_name: (dotted_name) @import.src)
  (import_from_statement module_name: (relative_import) @import.src)
  (call function: (identifier) @call.id)
  (call function: (attribute attribute: (identifier) @call.member))
`;

const PY_BUILTIN_METHODS = new Set([
  "get", "set", "keys", "values", "items", "pop", "popitem", "update", "setdefault", "copy", "clear",
  "append", "extend", "insert", "remove", "reverse", "sort", "count", "index",
  "add", "discard", "union", "intersection", "difference",
  "format", "join", "split", "rsplit", "splitlines", "strip", "lstrip", "rstrip",
  "startswith", "endswith", "replace", "find", "rfind", "lower", "upper", "title", "capitalize",
  "encode", "decode", "isdigit", "isalpha", "isalnum", "isspace",
  "read", "write", "close", "open", "readline", "readlines",
  "run", "wait", "poll", "communicate",
]);

const PYTHON: LanguageSpec = {
  id: "python",
  extensions: [".py", ".pyi"],
  grammarKey: "python",
  loadGrammar: () => Python,
  query: PY_QUERY,
  defNodeTypes: new Set(["function_definition", "class_definition"]),
  defKindOf: { "fn.def": "function", "method.def": "method", "class.def": "class" },
  nameToDef: { "fn.name": "fn.def", "method.name": "method.def", "class.name": "class.def" },
  builtinMethods: PY_BUILTIN_METHODS,
};
```

Append `PYTHON` to the `LANGUAGES` array:

```ts
export const LANGUAGES: LanguageSpec[] = [TYPESCRIPT, TSX, PYTHON];
```

Task 2's capture loop already keeps the first classification a node id receives (see the comment there), which is exactly what makes the class-nested-pattern-before-general-pattern query ordering above work.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test test/parse.test.ts`
Expected: PASS (all TS tests + 4 new Python tests). If the `run` method still shows up with `kind: "function"` instead of `"method"`, or a symbol is double-counted, add a `console.log(p.symbols)` temporarily to inspect actual capture output, fix the query/dedup logic above accordingly, and re-run — this is exactly the kind of grammar-shape detail that surfaces only against the real installed grammar.

If `npm run typecheck` (next step) reports `TS7016: Could not find a declaration file for module 'tree-sitter-python'`, create `src/extractors/tree-sitter-python.d.ts`:

```ts
declare module "tree-sitter-python" {
  const language: unknown;
  export default language;
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors (after adding the `.d.ts` shim above if needed).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/extractors/languages.ts src/extractors/parse.ts test/parse.test.ts
git add src/extractors/tree-sitter-python.d.ts 2>/dev/null || true
git commit -m "feat: add Python LanguageSpec via tree-sitter-python (symbols, imports, calls)"
```

---

### Task 5: `hunch index` produces a real Python symbol/call graph

**Files:**
- Modify: `test/indexer.test.ts` (add Python fixture test)

**Interfaces:**
- Consumes: `indexRepo(store, root, opts)` from `src/extractors/indexer.ts` — unchanged signature (Task 3 already wired `CODE_EXTENSIONS` through it; Task 4 already made `parseSource` handle `.py`). No production code changes in this task — it's the end-to-end regression test proving Tasks 1–4 compose correctly.

- [ ] **Step 1: Write the failing test**

Add to `test/indexer.test.ts`:

```ts
function pythonFixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "hunch-idx-py-"));
  mkdirSync(join(root, "src/auth"), { recursive: true });
  mkdirSync(join(root, "src/billing"), { recursive: true });
  writeFileSync(
    join(root, "src/auth/session.py"),
    `from .jwt import decode_token\n\ndef verify_session(t):\n    return decode_token(t)\n`,
  );
  writeFileSync(join(root, "src/auth/jwt.py"), `def decode_token(t):\n    return t\n`);
  writeFileSync(
    join(root, "src/billing/charge.py"),
    `def charge(t):\n    return t\n`,
  );
  return root;
}

test("indexRepo builds symbols and same-file call edges for a Python repo", () => {
  const root = pythonFixtureRepo();
  const store = new HunchStore(hunchPaths(root));
  store.json.ensureDirs();
  const res = indexRepo(store, root, { churn: false });
  store.reindex();

  assert.equal(res.files, 3);
  assert.ok(res.symbols >= 3);

  const syms = store.json.loadAll("symbols");
  const verify = syms.find((s) => s.name === "verify_session");
  assert.ok(verify, "verify_session indexed");
  assert.equal(verify!.file, "src/auth/session.py");

  const decode = syms.find((s) => s.name === "decode_token");
  assert.ok(decode, "decode_token indexed");

  // components derived from src/<dir>, same as TS
  const comps = store.json.loadAll("components").map((c) => c.name).sort();
  assert.deepEqual(comps, ["Auth", "Billing"]);

  // NO depends_on edge from Python's `from .jwt import decode_token` — cross-file
  // Python import resolution is explicitly out of scope (issue #5). auth.session
  // and auth.jwt are in the SAME component (src/auth) anyway, so this also
  // confirms no same-component false edge is fabricated.
  const edges = store.json.loadAll("edges");
  assert.ok(
    !edges.some((e) => e.type === "depends_on" && (e.from.includes("billing") || e.to.includes("billing"))),
    "no fabricated cross-component depends_on edge for Python imports",
  );

  store.close();
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails (or passes — confirming Tasks 1-4 already did the work)**

Run: `npx tsx --test test/indexer.test.ts`
Expected: This SHOULD already pass, since Tasks 1–4 wired everything it depends on. If it fails, the failure pinpoints exactly which earlier task's wiring is incomplete (e.g. `res.files` is 0 → `CODE_EXTENSIONS` isn't reaching `listCodeFiles()`; `verify` is undefined → `parseSource` isn't being invoked for `.py`). Fix the relevant Task 1-4 file, not this test.

- [ ] **Step 3: Confirm full test file passes**

Run: `npx tsx --test test/indexer.test.ts`
Expected: PASS (all existing TS tests + the new Python test).

- [ ] **Step 4: Commit**

```bash
git add test/indexer.test.ts
git commit -m "test: hunch index produces Python symbols and same-file call edges"
```

---

### Task 6: Python-aware structural-delta signal in `diff.ts`

**Files:**
- Modify: `src/extractors/diff.ts`
- Test: `test/upgrades.test.ts` (add Python diff fixtures)

**Interfaces:**
- Consumes: nothing new (extends existing `DECL_PATTERNS`/`importOf()` internals of `diff.ts`).
- Produces: no signature change — `analyzeDiff(diff: string): DiffAnalysis` and `summarizeDiff(a: DiffAnalysis): string` are unchanged; Python `def`/`class`/`import` lines now populate `addedSymbols`/`removedSymbols`/`addedDeps`/`removedDeps` the same way TS declarations already do.

- [ ] **Step 1: Write the failing test**

Add to `test/upgrades.test.ts`:

```ts
test("analyzeDiff recognizes Python def/class declarations and import/from-import deps", () => {
  const diff = [
    "diff --git a/src/auth.py b/src/auth.py",
    "--- a/src/auth.py",
    "+++ b/src/auth.py",
    "@@ -1,3 +1,5 @@",
    "+import redis",
    "+from .jwt import decode_token",
    "-def login():",
    "+def verify_session(t):",
    "+    return decode_token(t)",
    "+class SessionError(Exception):",
    "-from legacy import old_helper",
  ].join("\n");
  const a = analyzeDiff(diff);
  assert.deepEqual(a.addedSymbols.map((s) => s.name).sort(), ["SessionError", "verify_session"]);
  assert.deepEqual(a.removedSymbols.map((s) => s.name), ["login"]);
  assert.deepEqual(a.addedDeps, ["redis"]);
  assert.deepEqual(a.removedDeps, ["legacy"]);
  // relative import (leading '.') is NOT counted as an external dep, same convention as JS
  assert.ok(!a.addedDeps.includes(".jwt") && !a.addedDeps.includes("jwt"));
  const sum = summarizeDiff(a);
  assert.ok(sum.includes("verify_session") && sum.includes("redis"));
});

test("analyzeDiff ignores .py files just like other code files pre-registry (sanity: extension gate wired)", () => {
  const diff = [
    "diff --git a/notes.txt b/notes.txt",
    "--- a/notes.txt",
    "+++ b/notes.txt",
    "@@ -1 +1 @@",
    "+def not_code():",
  ].join("\n");
  const a = analyzeDiff(diff);
  assert.deepEqual(a.addedSymbols, [], "non-code extension is still ignored");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/upgrades.test.ts`
Expected: FAIL — `addedSymbols`/`addedDeps` are empty for the Python diff (no `def`/`class`/`import` regex patterns match yet).

- [ ] **Step 3: Add Python patterns to `diff.ts`**

In `src/extractors/diff.ts`, extend `DECL_PATTERNS`:

```ts
const DECL_PATTERNS: Array<{ kind: SymbolChange["kind"]; re: RegExp }> = [
  { kind: "function", re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/ },
  { kind: "class", re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
  { kind: "interface", re: /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
  { kind: "type", re: /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*[=<]/ },
  { kind: "const", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/ },
  { kind: "const", re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/ },
  { kind: "function", re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/ },
  { kind: "class", re: /^\s*class\s+([A-Za-z_]\w*)\s*[:(]/ },
];
```

and update `importOf()` to also check Python's `import x` / `from x import y` forms:

```ts
const IMPORT_RE = /^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/;
const CONT_IMPORT_RE = /^\s*\}?\s*from\s+['"]([^'"]+)['"]/; // multi-line: "} from 'x'"
const REQUIRE_RE = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/;
const PY_IMPORT_RE = /^\s*import\s+([A-Za-z_][\w.]*)/;               // "import os" / "import a.b.c"
const PY_FROM_IMPORT_RE = /^\s*from\s+([.\w]+)\s+import\s+/;         // "from os import path" / "from . import x"

function importOf(line: string): string | null {
  const m =
    IMPORT_RE.exec(line) ??
    CONT_IMPORT_RE.exec(line) ??
    REQUIRE_RE.exec(line) ??
    PY_FROM_IMPORT_RE.exec(line) ??
    PY_IMPORT_RE.exec(line);
  return m ? m[1]! : null;
}
```

(`PY_FROM_IMPORT_RE` is checked before `PY_IMPORT_RE` so `from x import y` doesn't get misread by a hypothetical looser `import` pattern — with the patterns as written here they wouldn't collide since `PY_IMPORT_RE` requires the line to start with `import`, but keeping `from` checked first matches this file's existing convention of checking more specific multi-word forms before general ones.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/upgrades.test.ts`
Expected: PASS (all existing TS tests + 2 new Python tests).

- [ ] **Step 5: Run the full existing regression suite for this file's consumers**

Run: `npx tsx --test test/tripwires.test.ts test/veto.test.ts test/synthesis.test.ts`
Expected: PASS — these consume `analyzeDiff` indirectly; confirms the new Python patterns don't misfire against existing JS/TS fixtures in those files.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/extractors/diff.ts test/upgrades.test.ts
git commit -m "feat: recognize Python def/class/import in the diff structural-delta scanner"
```

---

### Task 7: `hunch sync` synthesizes a decision from a Python commit

**Files:**
- Modify: `test/integration.test.ts` (add a Python commit fixture test)

**Interfaces:**
- Consumes: `syncCommit(store, root, sha?, opts?)` from `src/synthesis/synthesize.ts` — unchanged signature. No production code changes in this task — end-to-end proof that Tasks 1–6 compose: a real Python commit reaches `isSignificant()` with real structural-delta signal and produces a written decision instead of `skipped: no code files changed`.

- [ ] **Step 1: Write the failing (or already-passing) test**

Add to `test/integration.test.ts`:

```ts
function pythonGitRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "hunch-int-py-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: ["ignore", "ignore", "ignore"] });
  g("init");
  g("config", "user.email", "t@t.co");
  g("config", "user.name", "t");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.py"), "def a():\n    return 1\n");
  g("add", "-A");
  g("commit", "-m", "feat: add a");
  return root;
}

test("syncCommit synthesizes a decision from a Python commit (regression: was 'no code files changed')", async () => {
  const root = pythonGitRepo();
  const store = new HunchStore(hunchPaths(root));
  store.json.ensureDirs();

  // second commit with enough structural delta to be significant: a new function
  // definition is itself a structural-delta signal per Task 6's DECL_PATTERNS fix.
  writeFileSync(
    join(root, "src/a.py"),
    "def a():\n    return 1\n\ndef b(x):\n    return a() + x\n",
  );
  execFileSync("git", ["add", "-A"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "feat: add b"], { cwd: root, stdio: "ignore" });

  const r = await syncCommit(store, root);
  assert.equal(r.status, "written", `expected written, got skipped: ${r.reason}`);
  assert.ok(r.decision, "decision was recorded");

  store.close();
  rmSync(root, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test**

Run: `npx tsx --test test/integration.test.ts`
Expected: PASS — since Task 3 already wired `CODE_EXTENSIONS` into `synthesize.ts`'s `codeFiles` filter and Task 6 gave the Python commit real structural-delta signal via `analyzeDiff`, `isSignificant()` should return `true` (structural delta > 0 from the added `b` function) and `syncCommit` should write a decision. If it instead returns `status: "skipped", reason: "no code files changed"`, the `CODE_EXTENSIONS` wiring from Task 3 regressed — check `src/synthesis/synthesize.ts`'s `codeFiles` filter. If it returns `skipped` for a different reason (e.g. trivial), check `isSignificant()`'s inputs — confirm `analyzeDiff` produced non-empty `addedSymbols` for this diff (Task 6).

- [ ] **Step 3: Confirm full file passes**

Run: `npx tsx --test test/integration.test.ts`
Expected: PASS (all existing tests + the new Python test).

- [ ] **Step 4: Full suite + typecheck (final gate)**

Run: `npm test`
Expected: all test files pass, 0 fail.

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: builds cleanly to `dist/`.

- [ ] **Step 5: Commit**

```bash
git add test/integration.test.ts
git commit -m "test: hunch sync synthesizes a decision from a Python commit end-to-end"
```

---

## Post-plan: update issue #2 and CLAUDE.md

Not a task with its own test cycle — housekeeping once all 7 tasks are merged:

- Comment on [issue #2](https://github.com/MrSampson/hunch/issues/2) confirming each acceptance criterion, linking the commits/PR.
- If this repo's own `.hunch/` graph and `CLAUDE.md` decision-count block are regenerated by `hunch sync`/`hunch heal` post-commit hooks (per `src/integrations/claudemd.ts`), no manual edit is needed — verify the hook fired rather than hand-editing `CLAUDE.md`.
