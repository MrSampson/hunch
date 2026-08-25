# Flat-file-anchored declaration clusters transfer v2

Predictions and deterministic receipts were frozen from issue text and pre-fix source before any fixing diff or post-fix source was opened. Cluster coverage has an explicitly larger inspection budget than the flat top five.

## Verdict

**reject-flat-file-anchored-clusters-v2**

- Scorable tasks: 12/12
- Baseline top five: 4/12 (33.3%)
- Supplemental cluster families: 6/12 (50.0%)
- Combined preserved-top-five plus clusters: 7/12 (58.3%)
- Cluster rescues/losses relative to top five: 3/1
- Baseline/cluster file coverage: 7/9 (75.0% cluster)
- Cluster inspection budget, average/max declarations: 20.0/25
- Receipts complete and flat shortlist preserved: yes
- Exact-owner output: disabled

The cluster percentage is not a top-five accuracy number: it measures a bounded hierarchical view anchored to up to five flat-shortlist files, with two families and three declarations per file.

| case | scorable | top five | clusters | rescue | file | declarations | receipt | truth |
|---|:---:|:---:|:---:|:---:|:---:|---:|---|---|
| zod-pr-6267 | yes | hit | hit | no | yes | 23 | `cbc3b22d348e092cefc1fd2d` | `packages/zod/src/v4/core/schemas.ts::$ZodFunction` |
| zod-pr-6012 | yes | miss | miss | no | yes | 14 | `b25f58add990537eef326781` | `packages/zod/src/v4/core/api.ts::_stringFormat` |
| zod-pr-6357 | yes | hit | hit | no | yes | 16 | `cbcb3781e23d674b46fe7e5c` | `packages/zod/src/v4/core/api.ts::_stringbool` |
| zod-pr-5913 | yes | miss | miss | no | no | 25 | `b64bbe166547fe45cdfda812` | `packages/zod/src/v4/core/util.ts::ToZodExpand`<br>`packages/zod/src/v4/core/util.ts::ToZodKeyMismatch`<br>`packages/zod/src/v4/core/util.ts::ToZodMismatch`<br>`packages/zod/src/v4/core/util.ts::ToZodShape`<br>`packages/zod/src/v4/core/util.ts::ToZodTarget`<br>`packages/zod/src/v4/core/util.ts::toZod` |
| zod-pr-6339 | yes | miss | hit | yes | yes | 22 | `698027ece81c4c29b0435109` | `packages/zod/src/v4/core/json-schema.ts::JSONSchema`<br>`packages/zod/src/v4/core/json-schema.ts::SchemaType`<br>`packages/zod/src/v4/core/to-json-schema.ts::compactTypeUnion`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize` |
| zod-pr-6394 | yes | hit | miss | no | yes | 22 | `c0de4b03c92a8c003d3ac895` | `packages/zod/src/v4/core/checks.ts::$ZodCheckLengthEquals`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMaxLength`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMaxSize`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMinLength`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMinSize`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckSizeEquals`<br>`packages/zod/src/v4/core/checks.ts::_whenHasLength`<br>`packages/zod/src/v4/core/checks.ts::_whenHasSize` |
| zod-pr-5912 | yes | miss | miss | no | no | 15 | `d3dc2e29e8347b1e9bb50dcf` | `packages/zod/src/v4/core/api.ts::_properties` |
| zod-pr-5947 | yes | miss | miss | no | yes | 24 | `3267fe17bd7b99bfe98bb256` | `packages/zod/src/v4/core/schemas.ts::$DiscriminatedOption`<br>`packages/zod/src/v4/core/schemas.ts::$DiscriminatorValue`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDiscriminatedUnionInternals`<br>`packages/zod/src/v4/core/schemas.ts::getDiscriminatedOption` |
| zod-pr-6337 | yes | miss | miss | no | no | 19 | `cfd8358f00c6fddba598f0c0` | `packages/zod/src/v4/classic/schemas.ts::ZodType`<br>`packages/zod/src/v4/classic/schemas.ts::_zodTypeMethods`<br>`packages/zod/src/v4/mini/schemas.ts::ZodMiniType`<br>`packages/zod/src/v4/mini/schemas.ts::_zodMiniTypeMethods` |
| zod-pr-6435 | yes | miss | hit | yes | yes | 23 | `3732c425273fc19e8c83109a` | `packages/zod/src/v4/core/core.ts::$constructor`<br>`packages/zod/src/v4/core/core.ts::built`<br>`packages/zod/src/v4/core/util.ts::breaker`<br>`packages/zod/src/v4/core/util.ts::broke`<br>`packages/zod/src/v4/core/util.ts::cycleBreaks`<br>`packages/zod/src/v4/core/util.ts::defineLazyInternal`<br>`packages/zod/src/v4/core/util.ts::installing` |
| zod-pr-6029 | yes | miss | hit | yes | yes | 15 | `2e33a565c665332dbee35377` | `packages/zod/src/v4/core/to-json-schema.ts::extractDefs`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize` |
| zod-pr-6415 | yes | hit | hit | no | yes | 22 | `a9bbc60f6094955e4ca4db31` | `packages/zod/src/v4/core/core.ts::$constructor`<br>`packages/zod/src/v4/core/schemas.ts::$ZodCatch`<br>`packages/zod/src/v4/core/schemas.ts::$ZodCodec`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDefault`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDiscriminatedUnion`<br>`packages/zod/src/v4/core/schemas.ts::$ZodExactOptional`<br>`packages/zod/src/v4/core/schemas.ts::$ZodLazy`<br>`packages/zod/src/v4/core/schemas.ts::$ZodNonOptional`<br>`packages/zod/src/v4/core/schemas.ts::$ZodNullable`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObject`<br>`packages/zod/src/v4/core/schemas.ts::$ZodOptional`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPipe`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPrefault`<br>`packages/zod/src/v4/core/schemas.ts::$ZodReadonly`<br>`packages/zod/src/v4/core/schemas.ts::$ZodUnion`<br>`packages/zod/src/v4/core/util.ts::defineLazyInternal` |

Prediction SHA-256: `018077e3537634fd4902dba776f7a4a49f693355279c017a8a5a6f34cbe23b40`.
Receipt-set SHA-256: `df15379b461c0207cc6daa1a2c7d0e23b5a1b7f21e859da2d058ed30a8f632e3`.
