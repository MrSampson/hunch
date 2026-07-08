# Multi-language code awareness (Python first)

**Origin:** [MrSampson/hunch#2](https://github.com/MrSampson/hunch/issues/2)
**Status:** Approved, pending implementation plan
**Follow-ups split out:** [#4](https://github.com/MrSampson/hunch/issues/4) (squash-merge/SKIP_SUBJECT), [#5](https://github.com/MrSampson/hunch/issues/5) (Python cross-file import resolution)

## Problem

Hunch's automated, code-aware half — `index` (symbol/dependency graph), `backfill`/`sync` (decision synthesis from commits), and code enforcement — is effectively JavaScript/TypeScript-only. On a Python codebase:

- `hunch sync <python-commit> --force` → `skipped: no code files changed`.
- `hunch backfill` seeds nothing from `.py`-only commits — every commit is filtered before the LLM stage.
- `hunch index` produces no Python symbols, so `why`/`blast_radius`/`conform` have nothing to resolve against.

The root cause is that "code" is defined by a JS/TS file-extension regex, duplicated in three places, plus a single TypeScript-only tree-sitter grammar in the parser:

| Location | Current shape |
|---|---|
| `src/synthesis/synthesize.ts` | `CODE_RE = /\.(ts\|tsx\|mts\|cts\|js\|jsx\|mjs\|cjs)$/` — gates whether `syncCommit` even attempts synthesis |
| `src/extractors/indexer.ts` | `CODE_EXTS = [".ts", ".tsx", ...]` — gates which files `hunch index` walks/parses |
| `src/extractors/diff.ts` | `CODE_EXT` / `isCode()` — gates which changed files feed `analyzeDiff`'s structural-delta computation |
| `src/extractors/parse.ts` | `pickLanguage()` hardcoded to `tree-sitter-typescript`'s `typescript`/`tsx` grammars only; `BUILTIN_METHODS` is a JS-only builtin-method allowlist; `resolveImport()` in `indexer.ts` only understands relative `./` JS/TS specifiers |

`tree-sitter-typescript` is a required (non-optional) dependency in `package.json` today.

## Goals

1. Make "code" a language registry, not a hardcoded regex — collapse the three duplicated extension lists into one source of truth.
2. Add `tree-sitter-python` so `hunch index` produces real Python symbols, calls, and same-file import lists.
3. Keep the existing substance heuristic (`isSignificant` in `synthesize.ts`) language-agnostic — it already is, once the `CODE_RE` gate ahead of it is fixed.
4. Make a further language addition a registry entry + a new `tree-sitter-*` dependency, not edits scattered across four files.

## Non-goals (explicitly out of scope)

- **Python cross-file import/dependency-edge resolution.** Python's import system (packages, `__init__.py`, relative dots, `sys.path`) is fundamentally different from JS/TS's relative-file resolution and is a meaningfully larger project on its own. Tracked separately in [#5](https://github.com/MrSampson/hunch/issues/5).
- **The squash-merge/`SKIP_SUBJECT` synthesizer gap.** Unrelated root cause (commit-subject/body filtering, not language support). Tracked separately in [#4](https://github.com/MrSampson/hunch/issues/4).
- **Any language beyond Python** (Go, Rust, etc.). The registry makes them cheap later; this design ships exactly one new `LanguageSpec`.
- **New `ParsedSymbolKind` values.** Python decorators (e.g. `@dataclass`), async functions, and nested functions are captured as existing kinds (`class`, `function`, `method`) — no new taxonomy.

## Design

### Language registry

New module `src/extractors/languages.ts`:

```ts
export type ParsedSymbolKind = "function" | "method" | "class" | "interface" | "type"; // moved here from parse.ts

export interface LanguageSpec {
  id: string;                                  // "typescript" | "python"
  extensions: string[];                        // [".py", ".pyi"]
  grammarKey: string;                           // cache key for parse.ts's bundle cache
  loadGrammar(): unknown;                       // require()'s the tree-sitter-* package lazily
  query: string;                                // tree-sitter query source for this grammar
  defNodeTypes: Set<string>;                    // node types ascendToDef() walks up to
  defKindOf: Record<string, ParsedSymbolKind>;  // capture-name -> ParsedSymbolKind
  nameToDef: Record<string, string>;            // capture-name -> def capture-name
  builtinMethods: Set<string>;                  // suppress false call edges (per-language)
}

export const LANGUAGES: LanguageSpec[];
export const CODE_EXTENSIONS: string[];         // flattened LANGUAGES[].extensions
export function languageFor(file: string): LanguageSpec | null;
```

The existing TypeScript/JS behavior becomes the first `LanguageSpec` entry — a lossless refactor of what `parse.ts` already does (same query, same `BUILTIN_METHODS` list, same extension list), not a behavior change.

### `parse.ts` becomes a generic engine

- `pickLanguage()` → `languageFor()` from the registry.
- `bundleFor()` keys its cache off `LanguageSpec.grammarKey` and calls `loadGrammar()` instead of importing `tree-sitter-typescript` directly.
- `ascendToDef()` takes the matched language's `defNodeTypes` instead of a hardcoded `defTypes` set.
- The per-file symbol/import/call extraction loop (lines ~127–160 today) is unchanged in shape; it just reads `defKindOf`/`nameToDef` from the matched `LanguageSpec` instead of the module-level TS-only constants.
- `BUILTIN_METHODS` moves into each `LanguageSpec.builtinMethods`; the call-edge suppression check in the capture loop reads it off the matched language.

### Callers switch to the registry

- `src/extractors/indexer.ts`: `CODE_EXTS` → `CODE_EXTENSIONS` from `languages.ts`. No other change — `listCodeFiles()`, `parseSource()` calls, etc. are already extension/grammar-agnostic.
- `src/extractors/diff.ts`: `CODE_EXT`/`isCode()` → derived from `CODE_EXTENSIONS`.
- `src/synthesis/synthesize.ts`: `CODE_RE` → derived from `CODE_EXTENSIONS` (a small regex built from the registry's extension list, or a `.some(ext => f.endsWith(ext))` check — implementation detail for the plan).

### Python `LanguageSpec`

- **Dependency:** `tree-sitter-python` added to `package.json` `dependencies`, same tier as `tree-sitter-typescript` (required install, not optional/peer — consistent with the existing precedent, and native grammar packages are small).
- **Query:** captures `function_definition` (top-level and nested-in-class → `method` when its parent chain reaches a `class_definition`), `class_definition`, `import_statement` / `import_from_statement` (source text, no resolution), and `call` nodes (direct and attribute-access, e.g. `x.get(...)`).
- **Symbol kind mapping:** `class_definition` → `class`; `function_definition` → `function` at module scope, `method` when nested inside a class body. No `interface`/`type` equivalents in Python — not emitted.
- **`builtinMethods`:** a Python-specific set (dict/list/str/set builtins: `get`, `append`, `keys`, `values`, `items`, `format`, `join`, `startswith`, `endswith`, `split`, `strip`, `pop`, `update`, `sort`, `copy`, ...) to suppress the same false-call-edge problem the JS list already solves (e.g. a repo-level `get()` function colliding with `dict.get(...)`).
- **Imports:** captured into `ParsedFile.imports` (feeds `analyzeDiff`'s structural-delta count — satisfies the language-agnostic substance heuristic goal) but **not** resolved to `depends_on` component edges. `indexer.ts`'s `resolveImport()` stays JS/TS-only: a Python relative specifier (e.g. `.jwt`) DOES pass the leading-`.` shape check, but `resolveImport()`'s candidate list only ever builds `.ts`/`.tsx`/`.js`/`index.*` paths, so no candidate can match a `.py` file and it correctly returns `null` — the "don't guess" behavior for an unresolvable import, achieved by the candidate list's extension scope, not by the `.startsWith(".")` check itself.

### Substance heuristic — `diff.ts` needs Python-aware patterns too

Correction from the original draft: `analyzeDiff()` in `src/extractors/diff.ts` is **not** grammar-derived — it's a regex scan of raw unified-diff text (`DECL_PATTERNS` for `function`/`class`/`interface`/`type`/`const` declarations, `IMPORT_RE`/`CONT_IMPORT_RE`/`REQUIRE_RE` for imports), independent of `parse.ts`/tree-sitter. Fixing only `diff.ts`'s `CODE_EXT`/`isCode()` gate (via `CODE_EXTENSIONS` from the registry, same as the other three call sites) lets Python files reach the scanner, but `DECL_PATTERNS`/`IMPORT_RE` still wouldn't recognize `def foo():`, `class Foo:`, `import x`, or `from x import y` as structural changes — `addedSymbols`/`removedSymbols`/`addedDeps` would stay empty for Python diffs even though the files are now "code".

This degrades, but doesn't fully break, `isSignificant()`: its line-count (`SIG_MIN_LINES`) and file-count (`codeFiles.length >= 3`) fallbacks still fire off raw diff stats. But it does defeat the issue's acceptance criterion that the substance signal be language-agnostic, and it starves `summarizeDiff()`'s prose (used in the deterministic, no-LLM decision draft) of any symbol/dependency detail for Python-only commits.

**Fix:** add Python entries to `DECL_PATTERNS` and a Python-aware branch to `importOf()` in `diff.ts`, analogous to the existing JS/TS ones — a flat regex-list extension, not a rewire through the tree-sitter `LanguageSpec` registry (that registry is for grammar-based parsing; `diff.ts`'s heuristic is deliberately lightweight text scanning and stays that way):

```ts
// added to DECL_PATTERNS:
{ kind: "function", re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/ },
{ kind: "class", re: /^\s*class\s+([A-Za-z_]\w*)\s*[:(]/ },
```

```ts
// new regexes, checked in importOf() alongside the existing ones:
const PY_IMPORT_RE = /^\s*import\s+([A-Za-z_][\w.]*)/;          // "import os" / "import a.b.c"
const PY_FROM_IMPORT_RE = /^\s*from\s+([.\w]+)\s+import\s+/;    // "from os import path" / "from . import x" / "from ..pkg import y"
```

Python's relative-import convention (a leading `.`) already matches the existing `addedDeps`/`removedDeps` filter (`!imp.startsWith(".")` — only non-relative specifiers count as an external "dep"), so no change is needed there.

## Testing

Mirror the existing `test/parse.test.ts` pattern with a parallel Python fixture set (functions, classes, methods, imports, calls, builtin-method suppression regression, `>=32KB` buffer-size regression — the buffer guard in `parseSource` is already generic).

- `test/parse.test.ts`: add Python cases alongside existing TS cases (or a sibling `test/parse.python.test.ts` if the plan finds that cleaner).
- `test/indexer.test.ts`: extend with a Python fixture confirming `hunch index` produces non-zero Python symbols/edges (component-level, same-file call edges) and confirming no `depends_on` edges are fabricated across Python files.
- `test/upgrades.test.ts` (where `analyzeDiff`/`summarizeDiff` are unit-tested against real unified-diff text today): add Python diff fixtures confirming `def`/`class`/`import`/`from ... import` are recognized as structural changes.
- `test/integration.test.ts` (where `syncCommit` is exercised end-to-end against real git commits today): add a Python-commit fixture confirming `syncCommit` no longer skips with `no code files changed`.

## Acceptance criteria (from issue #2, restated against this design)

- [ ] On a Python repo, `hunch index` reports non-zero Python symbols/edges (via `tree-sitter-python`).
- [ ] `hunch sync <python-commit> --force` synthesizes a decision instead of `no code files changed`.
- [ ] `hunch backfill` seeds decisions from `.py` commits (reports `via LLM` when a provider is available).
- [ ] `hunch why <python-symbol>` / `blast_radius` resolve against the Python graph for same-file symbols/calls (cross-file Python dependency edges are explicitly deferred to #5).
- [ ] Adding a further language is a `languages.ts` registry entry + a new `tree-sitter-*` dependency, not edits scattered across `parse.ts`/`indexer.ts`/`diff.ts`/`synthesize.ts`.
