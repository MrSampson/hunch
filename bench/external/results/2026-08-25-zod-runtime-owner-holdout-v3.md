# Zod runtime-evidence owner holdout v3

All predictions were written before future source diffs were read. Only red-before, green-after, passing-control probes are scored.

## Verdict

**keep-experimental**

- Authenticated probes: 6/7
- Exact symbol: 0/6
- Top five: 2/6
- Correct file: 1/6

| task | authenticated | top prediction | exact | top 5 | ground-truth symbols |
|---|:---:|---|:---:|:---:|---|
| zod-5968 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodPreprocess` | no | no | `packages/zod/src/v4/core/json-schema-processors.ts::inputOptin`<br>`packages/zod/src/v4/core/json-schema-processors.ts::objectProcessor` |
| zod-6156 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodEnum` | no | yes | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-6176 | yes | `packages/zod/src/v4/core/checks.ts::$ZodCheckLengthEquals` | no | no | `packages/zod/src/v4/locales/en.ts::error` |
| zod-6342 | no | `packages/zod/src/v4/classic/schemas.ts::object` | no | no | `packages/zod/src/v4/core/errors.ts::$ZodIssueInvalidUnionMultipleMatch`<br>`packages/zod/src/v4/core/schemas.ts::handleExclusiveUnionResults`<br>`packages/zod/src/v4/locales/en.ts::error` |
| zod-5980 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodDate` | no | yes | `packages/zod/src/v4/core/checks.ts::$ZodCheckGreaterThan`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckLessThan` |
| zod-6027 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodObject` | no | no | `packages/zod/src/v4/core/to-json-schema.ts::encodeJSONPointerSegment`<br>`packages/zod/src/v4/core/to-json-schema.ts::extractDefs` |
| zod-6296 | yes | `packages/zod/src/v4/classic/schemas.ts::_zodTypeMethods` | no | no | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |

Prediction SHA-256: `3b68377fa3d8dc431effea8b73a9faecba84e30b217496ab734f7e9ad7bdaffb`.

## Interpretation

The 2/2 calibration result did not transfer. Runtime coverage reliably identifies code involved in producing the symptom, but that code is often not where the correction belongs. The misses crossed representation boundaries: parsing to JSON Schema conversion, validation checks to locale rendering, and parsed formats to schema construction.

Do not emit automatic correction-owner hints from this mechanism. Stack frames remain useful for direct throws; coverage candidates are an execution slice only.

## Next experiment

Replace owner guessing with a causal intervention tournament:

1. Keep separate candidates for the symptom site, transformation boundary, and output/policy boundary.
2. Perturb one candidate at a time and rerun the authenticated red probe plus its green control.
3. Name a correction owner only when the intervention flips the target without breaking the control; otherwise report the evidence slice and abstain.

Freeze that mechanism before using the remaining untouched tasks.
