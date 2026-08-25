# Zod correction-stage calibration v1

Correction-stage routing was frozen before rerunning already-revealed development cases. This is not transfer evidence.

## Verdict

**keep-experimental**

- Authenticated probes: 6/7
- Exact symbol: 3/6
- Top five: 5/6
- Correct file: 5/6

| task | authenticated | top prediction | exact | top 5 | ground-truth symbols |
|---|:---:|---|:---:|:---:|---|
| zod-5968 | yes | `packages/zod/src/v4/core/json-schema-processors.ts::objectProcessor` | yes | yes | `packages/zod/src/v4/core/json-schema-processors.ts::inputOptin`<br>`packages/zod/src/v4/core/json-schema-processors.ts::objectProcessor` |
| zod-6156 | yes | `packages/zod/src/v4/classic/schemas.ts::ZodEnum` | no | yes | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-6176 | yes | `packages/zod/src/v4/locales/en.ts::error` | yes | yes | `packages/zod/src/v4/locales/en.ts::error` |
| zod-6342 | no | `packages/zod/src/v4/classic/schemas.ts::strictObject` | no | no | `packages/zod/src/v4/core/errors.ts::$ZodIssueInvalidUnionMultipleMatch`<br>`packages/zod/src/v4/core/schemas.ts::handleExclusiveUnionResults`<br>`packages/zod/src/v4/locales/en.ts::error` |
| zod-5980 | yes | `packages/zod/src/v4/core/checks.ts::numericOriginMap` | no | no | `packages/zod/src/v4/core/checks.ts::$ZodCheckGreaterThan`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckLessThan` |
| zod-6027 | yes | `packages/zod/src/v4/core/to-json-schema.ts::extractDefs` | yes | yes | `packages/zod/src/v4/core/to-json-schema.ts::encodeJSONPointerSegment`<br>`packages/zod/src/v4/core/to-json-schema.ts::extractDefs` |
| zod-6296 | yes | `packages/zod/src/v4/classic/from-json-schema.ts::resolveRef` | no | yes | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |

Prediction SHA-256: `e49018685765ec37838e41456b5d619c1df2a25e580dd8b9b5bae428c2e4209c`.
