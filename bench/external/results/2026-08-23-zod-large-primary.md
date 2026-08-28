# Zod large time-split accuracy benchmark

Generated 2026-08-23T10:00:52.499Z. This report contains **26 distinct held-out tasks**, **26 paired runs**, and **52 valid agent sessions** (3 infrastructure rows excluded).

## Validity warning

**HARNESS AUDIT ONLY — do not use these numbers as an unseen-future accuracy claim.** These source files do not record a history-free checkout and deny-all network policy, so later Git objects or GitHub may have been reachable.

## Source-accuracy headline

| arm | passes | accuracy | run-level Wilson 95% CI | median turns | median time |
|---|---:|---:|---:|---:|---:|
| A — no Hunch | 16/26 | 61.5% | 42.5%–77.6% | 35.5 | 221s |
| C — Hunch | 14/26 | 53.8% | 35.5%–71.2% | 36.5 | 223s |

Observed accuracy difference: **-7.7%**. Task-cluster bootstrap 95% CI: **-23.1% to 7.7%**.

Paired runs: 1 Hunch wins, 3 Hunch losses, 13 tie-passes, 9 tie-fails; two-sided exact McNemar p=0.6250.
Task-level direction across repeats: 1 Hunch wins, 3 Hunch losses, 22 ties.
Treatment uptake: 26/26 Hunch runs made at least one Hunch call (100.0%), 50 calls total.

## Protocol-compliance score

This stricter secondary metric also requires the agent not to edit any existing upstream test file.

| arm | passes | rate | observed difference | task-cluster bootstrap 95% CI |
|---|---:|---:|---:|---:|
| A — no Hunch | 13/26 | 50.0% |  |  |
| C — Hunch | 13/26 | 50.0% | +0.0% | -15.4% to 15.4% |

Protocol paired runs: 2 Hunch wins, 2 Hunch losses, 11 tie-passes, 11 tie-fails; two-sided exact McNemar p=1.0000.

## Per-task results

| task | issue | source A | source C | protocol A | protocol C | source effect | Hunch calls |
|---|---|---:|---:|---:|---:|---:|---:|
| zod-352 | [[Zod v4.3+] Cannot use 'in' operator to search for 'description' in undefined](https://github.com/colinhacks/zod/issues/352) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-4461 | [Zod triggers unsafe-eval CSP error](https://github.com/colinhacks/zod/issues/4461) | 1/1 | 0/1 | 0/1 | 0/1 | -1.0 | 3 |
| zod-5229 | [Tuple Ignoring Default Values](https://github.com/colinhacks/zod/issues/5229) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 5 |
| zod-5273 | [Workaround for "Dynamic catch values are not supported in JSON Schema"](https://github.com/colinhacks/zod/issues/5273) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5275 | [Circular imports between `schemas` and `iso`](https://github.com/colinhacks/zod/issues/5275) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 4 |
| zod-5296 | [Records do not transform keys, even though the Typescript types says it does.](https://github.com/colinhacks/zod/issues/5296) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 3 |
| zod-5466 | [Mutation of ctx param is unintuitive](https://github.com/colinhacks/zod/issues/5466) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5593 | [discriminatedUnion fails on encode() when discriminator is a ZodCodec](https://github.com/colinhacks/zod/issues/5593) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 3 |
| zod-5617 | ["სტრინგი" is not correct translation for word "string" in ka ( Georgian )](https://github.com/colinhacks/zod/issues/5617) | 0/1 | 1/1 | 0/1 | 0/1 | +1.0 | 2 |
| zod-5619 | [Add Romanian (ro) locale](https://github.com/colinhacks/zod/issues/5619) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 1 |
| zod-5625 | [Feature Request: add `.invert()` method to codecs](https://github.com/colinhacks/zod/issues/5625) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 1 |
| zod-5670 | [Invalid discriminator errors in Zod 4 do not list possible options like Zod 3](https://github.com/colinhacks/zod/issues/5670) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5678 | [`transform` callback `ctx.addIssue` not in Typescript](https://github.com/colinhacks/zod/issues/5678) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5714 | [z.toJSONSchema() output has non-enumerable ~standard property that breaks z.json() validation](https://github.com/colinhacks/zod/issues/5714) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 3 |
| zod-5731 | [z.toJSONSchema: .meta({ id }) leaks id into $defs entries — should use $id or omit it](https://github.com/colinhacks/zod/issues/5731) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5732 | [`z.fromJSONSchema()` does not support metadata for enums, literals and not/never](https://github.com/colinhacks/zod/issues/5732) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 2 |
| zod-5775 | [discriminatedUnion no longer warns with invalid variant at compile time (zod 4)](https://github.com/colinhacks/zod/issues/5775) | 1/1 | 0/1 | 1/1 | 0/1 | -1.0 | 1 |
| zod-5777 | [z.toJSONSchema() stack overflows on recursive z.lazy() union schemas when recursive branches use .describe()](https://github.com/colinhacks/zod/issues/5777) | 1/1 | 0/1 | 1/1 | 0/1 | -1.0 | 1 |
| zod-5792 | [`multipleOf` silently accepts non-multiples for small numbers (scientific notation bug in `floatSafeRemainder`)](https://github.com/colinhacks/zod/issues/5792) | 1/1 | 1/1 | 0/1 | 1/1 | 0.0 | 4 |
| zod-5824 | [Falsy prefault() values are not emitted by toJsonSchema()](https://github.com/colinhacks/zod/issues/5824) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5826 | [`.default()` shallow-copies](https://github.com/colinhacks/zod/issues/5826) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |
| zod-5842 | [.merge() silently drops .refine() — should it throw like .pick()/.omit() do?](https://github.com/colinhacks/zod/issues/5842) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 5 |
| zod-5868 | [`z.union([])` and `z.xor([])` throw internal error on parse](https://github.com/colinhacks/zod/issues/5868) | 1/1 | 1/1 | 0/1 | 1/1 | 0.0 | 1 |
| zod-5917 | [The results vary depending on the position of the “optional” in the schema with preprocess since v4.4.0](https://github.com/colinhacks/zod/issues/5917) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 1 |
| zod-5937 | [Upgrading from 4.3.6 to 4.4.x causes issues with preprocess + catch](https://github.com/colinhacks/zod/issues/5937) | 0/1 | 0/1 | 0/1 | 0/1 | 0.0 | 1 |
| zod-5944 | [cidrv6 JSON schema emits an incomplete pattern that rejects valid IPv6 CIDRs](https://github.com/colinhacks/zod/issues/5944) | 1/1 | 1/1 | 1/1 | 1/1 | 0.0 | 1 |

## Provenance

- Model: `claude-sonnet-5`
- Zod mining checkout: `e516c3baf22615e20934116abebfed6c000222c2`
- Frozen Hunch executable: `f499d7e90b01568ed8383c3de331509750f67ca8`
- Memory cutoff: 2026-01-08; last eligible Zod code commit: `0cdc0b8597999fd9ca99767b912c1e82c1ff2d6c`
- Frozen memory commit: `394510c83e5c7cca0417865a54b563a276115595`
- Diagnosis mode: future regression tests hidden until scoring
- Validity status: unsealed-harness-audit
- Agent checkout: unsealed or unrecorded
- Network policy: unrecorded; Claude web tools denied: false
- Arm order alternated; test-file integrity checked before hidden tests were installed

## Raw result files

- `2026-08-23T06-59-20-196Z.json`
- `2026-08-23T06-59-26-800Z.json`
- `2026-08-23T06-59-32-406Z.json`
- `2026-08-23T08-14-40-206Z.json`
- `2026-08-23T08-16-00-854Z.json`
