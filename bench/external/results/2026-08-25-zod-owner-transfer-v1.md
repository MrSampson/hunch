# Zod blind owner-ranking transfer result

Evaluator: `zod-owner-transfer-v1` (SHA-256 `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`).
Prediction used issue text plus the pre-fix tree only; labels came from the future fix diff after prediction.

## Decision

**keep-diagnostic-only**

- Exact-symbol precision: 0/6 (0.0%)
- Exact-symbol coverage: 6/21 (28.6%)
- True-discovery symbol precision: 0/3 (0.0%)
- File accuracy when any inference was emitted: 3/9 (33.3%)
- Abstentions: 12/21 (57.1%)

## Rows

| task | category | inference | exact symbol | file | disclosed | ground-truth symbols |
|---|---|---|:---:|:---:|:---:|---|
| zod-5619 | behavior | abstain | no | no | no | `packages/zod/src/v4/locales/ro.ts::error` |
| zod-5842 | types | symbol: `packages/zod/src/v4/core/standard-schema.ts::Types` | no | no | yes | `packages/zod/src/v4/core/util.ts::merge` |
| zod-5944 | serialization | symbol: `packages/zod/src/v4/core/json-schema-processors.ts::toJSONSchema` | no | no | yes | `packages/zod/src/v4/core/regexes.ts::cidrv6` |
| zod-5275 | behavior | file: `packages/zod/src/v4/classic/from-json-schema.ts` | no | no | yes | `packages/zod/src/v4/classic/iso.ts::ZodISODate`<br>`packages/zod/src/v4/classic/iso.ts::ZodISODateTime`<br>`packages/zod/src/v4/classic/iso.ts::ZodISODuration`<br>`packages/zod/src/v4/classic/iso.ts::ZodISOTime`<br>`packages/zod/src/v4/classic/schemas.ts::ZodISODate`<br>`packages/zod/src/v4/classic/schemas.ts::ZodISODateTime`<br>`packages/zod/src/v4/classic/schemas.ts::ZodISODuration`<br>`packages/zod/src/v4/classic/schemas.ts::ZodISOTime`<br>`packages/zod/src/v4/classic/schemas.ts::ZodString` |
| zod-5273 | serialization | symbol: `packages/zod/src/v4/core/json-schema-processors.ts::toJSONSchema` | no | yes | no | `packages/zod/src/v4/core/json-schema-processors.ts::catchProcessor` |
| zod-5826 | behavior | abstain | no | no | no | `packages/zod/src/v4/core/util.ts::shallowClone` |
| zod-5466 | behavior | symbol: `packages/zod/src/v4/core/schemas.ts::$ZodFunctionParams` | no | no | no | `packages/zod/src/v4/core/parse.ts::_encode`<br>`packages/zod/src/v4/core/parse.ts::_encodeAsync`<br>`packages/zod/src/v4/core/parse.ts::_parse`<br>`packages/zod/src/v4/core/parse.ts::_parseAsync`<br>`packages/zod/src/v4/core/parse.ts::_safeEncode`<br>`packages/zod/src/v4/core/parse.ts::_safeEncodeAsync`<br>`packages/zod/src/v4/core/parse.ts::_safeParseAsync` |
| zod-5617 | behavior | abstain | no | no | yes | `packages/zod/src/v4/locales/ka.ts::error` |
| zod-4461 | behavior | abstain | no | no | yes | `packages/zod/src/v4/core/util.ts::allowsEval` |
| zod-5678 | types | abstain | no | no | yes | `packages/zod/src/v4/classic/schemas.ts::transform` |
| zod-5593 | behavior | abstain | no | no | no | `packages/zod/src/v4/core/schemas.ts::$ZodDiscriminatedUnion` |
| zod-5732 | serialization | symbol: `packages/zod/src/v4/classic/from-json-schema.ts::fromJSONSchema` | no | yes | yes | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertSchema` |
| zod-5714 | serialization | abstain | no | no | no | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-5296 | types | abstain | no | no | no | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-5670 | behavior | abstain | no | no | yes | `packages/zod/src/v4/core/errors.ts::$ZodIssueInvalidUnionNoMatch`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDiscriminatedUnion`<br>`packages/zod/src/v4/locales/en.ts::error` |
| zod-5824 | serialization | file: `packages/zod/src/v4/core/schemas.ts` | no | no | yes | `packages/zod/src/v4/core/to-json-schema.ts::process` |
| zod-5777 | serialization | abstain | no | no | no | `packages/zod/src/v4/core/schemas.ts::$ZodLazy` |
| zod-5731 | serialization | symbol: `packages/zod/src/v4/core/json-schema-processors.ts::toJSONSchema` | no | no | no | `packages/zod/src/v4/core/to-json-schema.ts::finalize` |
| zod-5229 | behavior | file: `packages/zod/src/v4/core/schemas.ts` | no | yes | yes | `packages/zod/src/v4/core/schemas.ts::$ZodObject`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObjectJIT`<br>`packages/zod/src/v4/core/schemas.ts::$ZodTuple`<br>`packages/zod/src/v4/core/schemas.ts::$ZodUndefined`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchall`<br>`packages/zod/src/v4/core/schemas.ts::handlePropertyResult`<br>`packages/zod/src/v4/core/schemas.ts::handleTupleResults` |
| zod-5792 | behavior | abstain | no | no | yes | `packages/zod/src/v3/types.ts::floatSafeRemainder`<br>`packages/zod/src/v4/core/util.ts::floatSafeRemainder` |
| zod-352 | serialization | abstain | no | no | yes | `packages/zod/src/v4/core/to-json-schema.ts::finalize` |

## Locked promotion rule

Promote automatic symbol hints only with at least 10 symbol outputs, at least 90% exact-symbol precision, at least 50% exact-symbol coverage, at least 8 true-discovery symbol outputs, and at least 85% true-discovery precision. File-level output is diagnostic regardless of score.
