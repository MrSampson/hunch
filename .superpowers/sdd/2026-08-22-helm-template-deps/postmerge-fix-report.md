# Post-merge fix: key call-site attribution by symbol index, not startByte

PR #41 (branch `39-helm-template-deps`). Confirmed Critical correctness bug from code review.

## The bug

`attributeCalls()` in `src/extractors/parse.ts` mapped each call site to its enclosing
symbol keyed by that symbol's `startByte`, on the documented assumption that `startByte`
is "a stable per-symbol identity within the file." `src/extractors/indexer.ts` mirrored
this with a per-file `Map<startByte, id>` (`fileStartByteId`).

That assumption breaks for Helm-templated YAML: when a `.tpl`/`.yaml` file's tree-sitter
parse can't produce a real root symbol, `parseSource` synthesizes a whole-file fallback
symbol (`kind: "file"`, `startByte: 0`). Separately, `src/extractors/helm.ts` extracts
`{{ define "name" }}` blocks via regex and `indexer.ts` merges them into `parsed.symbols`.
If a `define` is literally the first bytes of the file, it *also* gets `startByte: 0` —
two distinct symbols sharing the same key. `fileStartByteId.set(0, id)` in the per-file
loop then silently let the second symbol's id clobber the first's, so a call site outside
the `define` got attributed to the wrong symbol — producing either a spurious self-edge
(silently dropped by the existing self-edge guard) or, cross-file, an edge with the wrong
`from`.

Every existing Helm test fixture had a leading newline before the first `{{`, so this
byte-0 collision was never exercised.

## The fix

Changed the per-symbol identity used by `attributeCalls`/`fileStartByteId` from
`startByte` to the symbol's **position (index) in `parsed.symbols`**, which is unique by
construction. This is safe because `parseSource()` always returns `symbols` sorted by
`startByte`, `indexer.ts` re-sorts after merging in Helm's symbols using a stable sort,
and both the symbol-id-building loop and `attributeCalls()` consume the exact same
already-sorted `parsed.symbols` array reference in the same order.

### Files changed

- **`src/extractors/parse.ts`** — `attributeCalls()` now tracks `bestIndex` (the loop
  index into `parsed.symbols`) alongside `best`, and keys its output map by `bestIndex`
  instead of `best.startByte`. Doc comment rewritten to explain the byte-0 collision
  scenario and the array-index contract.
- **`src/extractors/indexer.ts`** — `fileStartByteId` renamed to `fileSymbolIndexId`
  (comment updated to "file -> (symbol index in parsed.symbols -> id)"); the per-file
  loop renamed `startByteId` to `symbolIndexId` and now iterates with
  `parsed.symbols.entries()`, keying by `index` instead of `ps.startByte`; pass 2's
  `sbToId`/`callerStartByte` renamed to `indexToId`/`callerIndex`, with the comment
  updated to explain why `startByte` is not a valid key.
- **`src/constitution/delta.ts`** — `viewOfParsed()`'s `byStart = new Map(parsed.symbols
  .map((s) => [s.startByte, s]))` changed to `byIndex = new Map(parsed.symbols.map((s, i)
  => [i, s]))`, and the consuming loop renamed `start`/`byStart` to `index`/`byIndex` to
  match `attributeCalls()`'s new key semantics. (This file is currently scoped to TS/JS
  only via `CODE_EXT`, so it couldn't hit the byte-0 collision itself, but it consumes
  `attributeCalls()`'s map key directly and would have silently returned nothing once the
  key changed from a byte offset to an index.)

### Test updates

`test/parse.test.ts` — converted 5 existing `attributeCalls()` tests from a
`startByte`-based lookup helper to an index-based one (`findIndex` instead of `.startByte`):
- `"attributeCalls maps callee to enclosing symbol (keyed by stable symbol index)"` (TS)
- `"builtin method calls (.map/.push/...) do NOT become call edges (regression #4)"` (TS)
- `"attributeCalls resolves Python calls to their enclosing symbol"` (Python)
- `"Python builtin dict/list/str methods do NOT become call edges"` (Python)
- `"attributeCalls resolves YAML aliases to the file-root symbol..."` (YAML)

## TDD evidence

New end-to-end regression test added in `test/indexer.test.ts`: a chart where
`templates/_helpers.tpl` begins with **no leading newline** — literally
`{{- define "c.name" -}}\nfoo\n{{- end -}}\n{{ include "c.name" . }}\n` as the first bytes
— with a top-level `include` outside the define, at the end of the same file.

**RED** — ran the new test against the unfixed source (stashed the three source-file
fixes, kept the test):

```
$ npx tsx --test test/indexer.test.ts
```

Observed failure:

```
not ok 24 - a Helm define at byte 0 (no leading newline) does not collide with the YAML
  whole-file fallback symbol, and a top-level include outside the define still resolves
  (regression: startByte-keyed attribution)
  error: 'the top-level include (outside the define) must produce a references edge into c.name'
  code: 'ERR_ASSERTION'
```

This confirms the diagnosed effect exactly: the edge vanished entirely (attributed to a
self-edge and dropped by the existing guard), not just resolved to the wrong `from`.

**GREEN** — popped the stash (fix restored) and reran:

```
$ npx tsx --test test/indexer.test.ts
...
1..28
# tests 28
# pass 28
# fail 0
```

`test/parse.test.ts` (5 converted tests + the rest of the file) also passes:

```
$ npx tsx --test test/parse.test.ts
1..31
# tests 31
# pass 31
# fail 0
```

## Full-suite verification (after all changes)

```
$ npm run typecheck
> tsc -p tsconfig.json --noEmit
(clean, no errors)

$ npm test
...
1..1133
# tests 1133
# suites 0
# pass 1132
# fail 0
# cancelled 0
# skipped 1
# todo 0
# duration_ms 416472.612781
[exited with code 0]
```

1133 tests total, 1132 passed, 0 failed, 1 skipped (pre-existing, unrelated to this
change), exit code 0.

## Consumer audit

Searched the full codebase for other consumers of `attributeCalls()` or
`.startByte`-keyed symbol lookups:

```
$ grep -rn "attributeCalls\|startByte" src
```

Found exactly the three consumers named in the brief (`parse.ts`, `indexer.ts`,
`delta.ts`) — all fixed. Two other `startByte` usages exist but are unrelated to
symbol-identity map keys and were left untouched, per scope:
- `src/constitution/sourceMutation.ts` uses `definition.startByte`/`endByte` purely as a
  byte-range boundary (splicing source text, filtering calls within a definition's byte
  range) — not as a map key for symbol identity.
- `src/extractors/helm.ts` uses `startByte` internally while building its own `define`
  symbols (byte-range bookkeeping during regex extraction), not as a cross-symbol
  identity key.

No additional consumer beyond the three listed in the brief was found or needed fixing.

## Scope discipline

No changes to `resolveName()`, `nearestChartRoot`, `chartFiles`, or `importedFiles`
widening. Only symbol-identity/attribution logic (`attributeCalls`, the two
`fileStartByteId`-equivalent maps, and their test coverage) was touched.
