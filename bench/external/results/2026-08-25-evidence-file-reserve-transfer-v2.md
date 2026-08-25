# Evidence file reserve transfer v2

Predictions and optimization receipts were frozen from issue text, pre-fix source, and authenticated target/control execution before post-fix source or fixing diffs were opened.

## Verdict

**reject-evidence-file-reserve-v2**

- Authenticated/scorable: 6/6 of 6
- Baseline top five: 4/6 (66.7%)
- Optimized top five: 3/6 (50.0%)
- Improvement: -16.7% points
- Baseline/optimized correct file: 5/4
- File improvement: -16.7% points
- Rescues/losses: 0/1
- Receipts complete: yes
- Exact-owner output: disabled

| case | baseline | optimized | rescue | file | strategy | receipt | truth |
|---|:---:|:---:|:---:|:---:|---|---|---|
| zod-pr-6432 | hit | hit | no | yes | strong-differential-execution | `6889abdfbe541509e1636dac` | `packages/zod/src/v4/core/compile.ts::generateDiscriminatedUnionCheck`<br>`packages/zod/src/v4/core/schemas.ts::$ZodExactOptional`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObject` |
| zod-pr-6429 | miss | miss | no | yes | no-actionable-evidence | `50a578ad305a8e5e5229dad4` | `packages/zod/src/v4/core/core.ts::$constructor`<br>`packages/zod/src/v4/core/core.ts::built`<br>`packages/zod/src/v4/core/util.ts::cycleBreaks`<br>`packages/zod/src/v4/core/util.ts::defineLazyInternal` |
| zod-pr-6418 | hit | hit | no | yes | strong-differential-execution | `95671094bf5f50a3d27deb51` | `packages/zod/src/v4/core/json-schema-processors.ts::tupleProcessor` |
| zod-pr-6409 | miss | miss | no | no | strong-differential-execution | `5f5093b750e757ebf381fcf1` | `packages/zod/src/v4/core/to-json-schema.ts::isTransforming` |
| zod-pr-6407 | hit | hit | no | yes | strong-differential-execution | `35fc00e33575f20020066eec` | `packages/zod/src/v4/core/schemas.ts::$ZodObjectJIT` |
| zod-pr-6412 | hit | miss | no | no | strong-differential-execution | `23bd972279e788953c92339f` | `packages/zod/src/v4/core/schemas.ts::$ZodRecord`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchall`<br>`packages/zod/src/v4/core/schemas.ts::handleIntersectionResults`<br>`packages/zod/src/v4/core/schemas.ts::handlePipeResult` |

Prediction SHA-256: `a7a391f9628cde9b4b5aab2ac9fa5285342aa110eefaccce2a98575a01437e0a`.
Optimization-receipt SHA-256: `c3d91e555c035cc85bd81c78e81c2bfce555e3303841e7791e3b233884044154`.
