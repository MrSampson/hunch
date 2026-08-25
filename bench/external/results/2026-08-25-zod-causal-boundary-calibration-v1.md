# Zod causal-boundary calibration v1

Branch-level causal-boundary ranking was frozen before rerunning already-revealed development cases. This is not transfer evidence.

## Verdict

**keep-experimental**

- Authenticated probes: 6/7
- Exact symbol: 1/6
- Top five: 2/6
- Correct file: 2/6

| task | authenticated | top prediction | exact | top 5 | ground-truth symbols |
|---|:---:|---|:---:|:---:|---|
| zod-5968 | yes | `packages/zod/src/v4/core/to-json-schema.ts::isTransforming` | no | no | `packages/zod/src/v4/core/json-schema-processors.ts::inputOptin`<br>`packages/zod/src/v4/core/json-schema-processors.ts::objectProcessor` |
| zod-6156 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` | yes | yes | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-6176 | yes | `packages/zod/src/v4/classic/schemas.ts::_ZodString` | no | no | `packages/zod/src/v4/locales/en.ts::error` |
| zod-6342 | no | `packages/zod/src/v4/core/util.ts::unwrapMessage` | no | no | `packages/zod/src/v4/core/errors.ts::$ZodIssueInvalidUnionMultipleMatch`<br>`packages/zod/src/v4/core/schemas.ts::handleExclusiveUnionResults`<br>`packages/zod/src/v4/locales/en.ts::error` |
| zod-5980 | yes | `packages/zod/src/v4/classic/schemas.ts::ZodDate` | no | no | `packages/zod/src/v4/core/checks.ts::$ZodCheckGreaterThan`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckLessThan` |
| zod-6027 | yes | `packages/zod/src/v4/core/json-schema-processors.ts::toJSONSchema` | no | yes | `packages/zod/src/v4/core/to-json-schema.ts::encodeJSONPointerSegment`<br>`packages/zod/src/v4/core/to-json-schema.ts::extractDefs` |
| zod-6296 | yes | `packages/zod/src/v4/classic/from-json-schema.ts::fromJSONSchema` | no | no | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |

Prediction SHA-256: `9a8c60382367b06f245c9bcae6de161d6c637af2b6b4a2b58c59963e33216d84`.
