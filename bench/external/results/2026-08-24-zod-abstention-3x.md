# Zod large time-split accuracy benchmark

Generated 2026-08-24T08:14:18.313Z. This report contains **26 distinct held-out tasks**, **78 paired runs**, and **156 valid agent sessions** (9 infrastructure rows excluded).

## Treatment mode

This is a **forced-retrieval efficacy test**: every Hunch arm had to call Hunch before diagnosis. It measures whether available memory improves accuracy when consulted, not whether agents naturally choose to use the product.

## Validity safeguards

Every attempt ran in a Git repository whose authentic ancestry ended at the pre-fix commit, with no remote or future objects. All 162 memory provenance commits were reachable. Outbound network access and Claude web tools were denied, and a separate clean checkout graded the source patch against hidden future tests.

## Source-accuracy headline

| arm | passes | accuracy | run-level Wilson 95% CI | median turns | median time |
|---|---:|---:|---:|---:|---:|
| A — no Hunch | 70/78 | 89.7% | 81.0%–94.7% | 18.5 | 114s |
| C — Hunch | 70/78 | 89.7% | 81.0%–94.7% | 24 | 128s |

Observed accuracy difference: **+0.0 percentage points**. Task-cluster bootstrap 95% CI: **0.0% to 0.0%**.

Paired runs: 0 Hunch wins, 0 Hunch losses, 70 tie-passes, 8 tie-fails; two-sided exact McNemar p=1.0000.
Task-level direction across repeats: 0 Hunch wins, 0 Hunch losses, 26 ties.
Treatment uptake: 77/78 Hunch runs made at least one Hunch call (98.7%), 119 calls total.
Memory delivery: 27/78 Hunch runs received at least one decision, 63 decisions and 285/418 attempted supplements were delivered; 0 records were omitted for stale provenance.
Retrieval abstention: 44/78 Hunch runs abstained at least once; 44 abstention responses withheld 127 weak prescriptive records.

## Interpretation

This run does **not** demonstrate an accuracy improvement under forced-retrieval. The point estimate is +0.0 percentage points, but the paired result is not statistically significant (p=1.0000). It also does not establish that Hunch is harmful; a larger repeated sample is needed to distinguish a small effect from model variance.
Source-accuracy discordances: Hunch-only wins: none; control-only wins: none.

## Protocol-compliance score

This stricter secondary metric also requires the agent not to edit any existing upstream test file.

| arm | passes | rate | observed difference | task-cluster bootstrap 95% CI |
|---|---:|---:|---:|---:|
| A — no Hunch | 70/78 | 89.7% |  |  |
| C — Hunch | 70/78 | 89.7% | +0.0% | 0.0% to 0.0% |

Protocol paired runs: 0 Hunch wins, 0 Hunch losses, 70 tie-passes, 8 tie-fails; two-sided exact McNemar p=1.0000.

## Per-task results

| task | issue | source A | source C | protocol A | protocol C | source effect | Hunch calls | abstentions |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| zod-352 | [\[Zod v4.3+\] Cannot use 'in' operator to search for 'description' in undefined](https://github.com/colinhacks/zod/issues/352) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 5 | 2 |
| zod-4461 | [Zod triggers unsafe-eval CSP error](https://github.com/colinhacks/zod/issues/4461) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 2 |
| zod-5229 | [Tuple Ignoring Default Values](https://github.com/colinhacks/zod/issues/5229) | 0/3 | 0/3 | 0/3 | 0/3 | 0.0 | 9 | 3 |
| zod-5273 | [Workaround for "Dynamic catch values are not supported in JSON Schema"](https://github.com/colinhacks/zod/issues/5273) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 0 |
| zod-5275 | [Circular imports between `schemas` and `iso`](https://github.com/colinhacks/zod/issues/5275) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 7 | 2 |
| zod-5296 | [Records do not transform keys, even though the Typescript types says it does.](https://github.com/colinhacks/zod/issues/5296) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 7 | 1 |
| zod-5466 | [Mutation of ctx param is unintuitive](https://github.com/colinhacks/zod/issues/5466) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 4 | 2 |
| zod-5593 | [discriminatedUnion fails on encode() when discriminator is a ZodCodec](https://github.com/colinhacks/zod/issues/5593) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 5 | 1 |
| zod-5617 | ["სტრინგი" is not correct translation for word "string" in ka ( Georgian )](https://github.com/colinhacks/zod/issues/5617) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 3 |
| zod-5619 | [Add Romanian (ro) locale](https://github.com/colinhacks/zod/issues/5619) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 3 |
| zod-5625 | [Feature Request: add `.invert()` method to codecs](https://github.com/colinhacks/zod/issues/5625) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 0 |
| zod-5670 | [Invalid discriminator errors in Zod 4 do not list possible options like Zod 3](https://github.com/colinhacks/zod/issues/5670) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 1 |
| zod-5678 | [`transform` callback `ctx.addIssue` not in Typescript](https://github.com/colinhacks/zod/issues/5678) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 0 |
| zod-5714 | [z.toJSONSchema() output has non-enumerable ~standard property that breaks z.json() validation](https://github.com/colinhacks/zod/issues/5714) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 10 | 0 |
| zod-5731 | [z.toJSONSchema: .meta({ id }) leaks id into $defs entries — should use $id or omit it](https://github.com/colinhacks/zod/issues/5731) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 3 |
| zod-5732 | [`z.fromJSONSchema()` does not support metadata for enums, literals and not/never](https://github.com/colinhacks/zod/issues/5732) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 3 |
| zod-5775 | [discriminatedUnion no longer warns with invalid variant at compile time (zod 4)](https://github.com/colinhacks/zod/issues/5775) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 2 |
| zod-5777 | [z.toJSONSchema() stack overflows on recursive z.lazy() union schemas when recursive branches use .describe()](https://github.com/colinhacks/zod/issues/5777) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 4 | 3 |
| zod-5792 | [`multipleOf` silently accepts non-multiples for small numbers (scientific notation bug in `floatSafeRemainder`)](https://github.com/colinhacks/zod/issues/5792) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 2 | 2 |
| zod-5824 | [Falsy prefault() values are not emitted by toJsonSchema()](https://github.com/colinhacks/zod/issues/5824) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 2 |
| zod-5826 | [`.default()` shallow-copies](https://github.com/colinhacks/zod/issues/5826) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 3 | 3 |
| zod-5842 | [.merge() silently drops .refine() — should it throw like .pick()/.omit() do?](https://github.com/colinhacks/zod/issues/5842) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 6 | 1 |
| zod-5868 | [`z.union(\[\])` and `z.xor(\[\])` throw internal error on parse](https://github.com/colinhacks/zod/issues/5868) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 5 | 1 |
| zod-5917 | [The results vary depending on the position of the “optional” in the schema with preprocess since v4.4.0](https://github.com/colinhacks/zod/issues/5917) | 1/3 | 1/3 | 1/3 | 1/3 | 0.0 | 5 | 1 |
| zod-5937 | [Upgrading from 4.3.6 to 4.4.x causes issues with preprocess + catch](https://github.com/colinhacks/zod/issues/5937) | 0/3 | 0/3 | 0/3 | 0/3 | 0.0 | 5 | 1 |
| zod-5944 | [cidrv6 JSON schema emits an incomplete pattern that rejects valid IPv6 CIDRs](https://github.com/colinhacks/zod/issues/5944) | 3/3 | 3/3 | 3/3 | 3/3 | 0.0 | 9 | 2 |

## Provenance

- Model: `claude-sonnet-5`
- Zod mining checkout: `e516c3baf22615e20934116abebfed6c000222c2`
- Frozen Hunch executable: `64deceaf5833a2f359d08d48d54d347cd020daf1`
- Memory cutoff: 2026-01-08; last eligible Zod code commit: `0cdc0b8597999fd9ca99767b912c1e82c1ff2d6c`
- Frozen memory commit: `394510c83e5c7cca0417865a54b563a276115595`
- Diagnosis mode: future regression tests hidden until scoring
- Treatment mode: forced-retrieval
- Validity status: sealed
- Agent checkout: authentic history through pre-fix only; no remote or future Git objects
- Memory provenance: 162 commits verified reachable
- Scoring: separate clean checkout
- Network policy: deny-all; Claude web tools denied: true
- Arm order alternated; test-file integrity checked before hidden tests were installed

## Raw result files

- `2026-08-24T04-22-16-362Z-p22963.json`
- `2026-08-24T04-22-16-362Z-p22964.json`
- `2026-08-24T04-22-16-362Z-p22965.json`
- `2026-08-24T08-01-49-444Z-p77481.json`
- `2026-08-24T08-01-49-444Z-p77482.json`
- `2026-08-24T08-01-49-444Z-p77483.json`
