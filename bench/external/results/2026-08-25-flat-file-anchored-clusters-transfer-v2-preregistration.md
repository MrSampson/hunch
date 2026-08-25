# Flat-file-anchored declaration clusters transfer v2 — preregistration

This artifact was written before any fixing diff or post-fix source was opened for these twelve cases. The first cluster transfer was rejected. Its cases are development data only for v2 and do not appear here.

## Locked rule

- Keep the original flat top-five declarations unchanged and separately visible.
- Select every distinct file represented by those five candidates, up to five files. Aggregate file scoring may only fill unused file slots; it may not displace a flat-shortlist file.
- Inside each file, collapse related declaration scaffolding by non-generic camel-case symbol terms.
- Expose at most two semantic families per file and three declaration members per family: no more than 30 declarations.
- Emit a deterministic version-2 receipt containing the file-selection strategy, selected files and families, limits, candidate count, flat-shortlist-preserved flag, and disabled exact-owner flag.

## Blind scoring

Predictions and receipts must be written before a fixing diff or post-fix source is opened. A case is scorable only when the fix changes a pre-existing top-level declaration in non-test TypeScript under `packages/zod/src/v4`.

Report baseline top-five exact-declaration coverage, cluster exact-declaration coverage, their preserved union, file coverage, rescues, losses, and the actual unique-declaration inspection budget. The cluster rate is not a top-five rate because its budget is larger.

## Promotion rule

Promote only as an experimental hierarchical diagnostic if all hold:

1. At least eight scorable cases.
2. Cluster exact-declaration coverage is at least 70% and is not below baseline top-five coverage.
3. At least two baseline misses are rescued and combined coverage exceeds baseline by at least two cases.
4. Selected-file coverage is not below baseline file coverage.
5. Combined coverage has no loss relative to the separately preserved top five.
6. Every receipt is complete, uses the locked file-anchor strategy, preserves the flat shortlist, and disables exact-owner output.
7. The average cluster view contains at most 24 unique declarations and no case contains more than 30.

Passing promotes only the supplemental view. Exact-owner output and per-case confidence remain disabled. Failing rejects v2 without tuning and rescoring this holdout.

## Frozen hashes

- Task artifact SHA-256: `7e56aaa6318bb71e37260c4bbd7c6415cc9368974dffd13c24e21ee1297dc0d0`
- Cluster implementation SHA-256: `f2135d3980a2007182ae86e33e97a968be5a4ed649895338ca0aa78364f0bc86`
- Correction-stage integration SHA-256: `0153d3c930855e977a12d94a4e39f772cc33ee408116ce42009aa0db0a6b2d64`
- Static ranker SHA-256: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- Truth mapper SHA-256: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`
