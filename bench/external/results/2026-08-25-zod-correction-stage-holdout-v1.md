# Zod correction-stage blind holdout v1

All predictions were frozen before future source diffs were read.

## Verdict

**retain-diagnostic-stage-shortlist**

- Exact symbol: 6/11
- Top five: 8/11 (72.7%)
- Correct file: 9/11 (81.8%)
- Exact-owner policy: disabled

| task | stage | top prediction | exact | top 5 | file | ground truth |
|---|---|---|:---:|:---:|:---:|---|
| zod-2854 | runtime-policy | `packages/zod/src/v4/mini/schemas.ts::ZodMiniAny` | no | no | no | `packages/zod/src/v4/classic/deep-partial.ts::DeepPartial`<br>`packages/zod/src/v4/classic/deep-partial.ts::deepPartial`<br>`packages/zod/src/v4/classic/in-out.ts::input`<br>`packages/zod/src/v4/classic/in-out.ts::output`<br>`packages/zod/src/v4/core/visit.ts::AnyZod`<br>`packages/zod/src/v4/core/visit.ts::Kind`<br>`packages/zod/src/v4/core/visit.ts::RESOLVING`<br>`packages/zod/src/v4/core/visit.ts::Resolving`<br>`packages/zod/src/v4/core/visit.ts::SchemaOfKind`<br>`packages/zod/src/v4/core/visit.ts::VisitFn`<br>`packages/zod/src/v4/core/visit.ts::VisitHandlers`<br>`packages/zod/src/v4/core/visit.ts::visit`<br>`packages/zod/src/v4/mini/deep-partial.ts::DeepPartial`<br>`packages/zod/src/v4/mini/deep-partial.ts::deepPartial`<br>`packages/zod/src/v4/mini/in-out.ts::input`<br>`packages/zod/src/v4/mini/in-out.ts::output` |
| zod-2200 | runtime-policy | `packages/zod/src/v4/core/schemas.ts::$ZodCustomStringFormat` | no | no | yes | `packages/zod/src/v4/core/schemas.ts::$ZodRecord`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchall`<br>`packages/zod/src/v4/core/schemas.ts::handleIntersectionResults`<br>`packages/zod/src/v4/core/schemas.ts::handlePipeResult` |
| zod-6161 | schema-emission | `packages/zod/src/v4/core/to-json-schema.ts::finalize` | yes | yes | yes | `packages/zod/src/v4/core/json-schema-generator.ts::JSONSchemaGenerator`<br>`packages/zod/src/v4/core/to-json-schema.ts::ToJSONSchemaContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::extractDefs`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize`<br>`packages/zod/src/v4/core/to-json-schema.ts::initializeContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::process` |
| zod-6323 | schema-ingestion | `packages/zod/src/v4/classic/from-json-schema.ts::applyMinItems` | no | yes | yes | `packages/zod/src/v4/classic/from-json-schema.ts::checkPropertyNames`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertSchema` |
| zod-6200 | schema-ingestion | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` | yes | yes | yes | `packages/zod/src/v4/classic/from-json-schema.ts::applyMinItems`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |
| zod-6193 | schema-emission | `packages/zod/src/v4/core/json-schema-processors.ts::tupleProcessor` | yes | yes | yes | `packages/zod/src/v4/core/json-schema-processors.ts::tupleProcessor` |
| zod-5965 | runtime-policy | `packages/zod/src/v4/core/checks.ts::$ZodCheckLengthEquals` | no | no | no | `packages/zod/src/v4/core/regexes.ts::domain` |
| zod-6198 | schema-ingestion | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` | yes | yes | yes | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |
| zod-5697 | presentation | `packages/zod/src/v4/locales/en.ts::error` | yes | yes | yes | `packages/zod/src/v4/core/schemas.ts::$ZodNumber`<br>`packages/zod/src/v4/locales/en.ts::error` |
| zod-5234 | schema-emission | `packages/zod/src/v4/core/to-json-schema.ts::handleUnrepresentable` | yes | yes | yes | `packages/zod/src/v4/core/json-schema-generator.ts::JSONSchemaGenerator`<br>`packages/zod/src/v4/core/json-schema-processors.ts::bigintProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::catchProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::customProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::dateProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::functionProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::literalProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::mapProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::nanProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::setProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::symbolProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::transformProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::undefinedProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::voidProcessor`<br>`packages/zod/src/v4/core/to-json-schema.ts::ANNOTATION_KEYS`<br>`packages/zod/src/v4/core/to-json-schema.ts::JSONSchemaGeneratorParams`<br>`packages/zod/src/v4/core/to-json-schema.ts::Seen`<br>`packages/zod/src/v4/core/to-json-schema.ts::ToJSONSchemaContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::UnrepresentableHandler`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize`<br>`packages/zod/src/v4/core/to-json-schema.ts::handleUnrepresentable`<br>`packages/zod/src/v4/core/to-json-schema.ts::initializeContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::structuralSnapshot` |
| zod-5966 | runtime-policy | `packages/zod/src/v4/classic/schemas.ts::unknown` | no | yes | yes | `packages/zod/src/v4/classic/schemas.ts::ZodPreprocess`<br>`packages/zod/src/v4/classic/schemas.ts::preprocess`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPreprocess`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPreprocessDef`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPreprocessInternals` |

Prediction SHA-256: `650fd6284bf81166b618733ba4d8ba25593b99619464c75e16fc6b52f5ac113a`.

## Interpretation

The correction-stage router passed its locked diagnostic rule. It may identify a likely repository layer, show the top file, and offer up to five declarations as an investigation shortlist.

It must not claim an exact correction owner. Exact accuracy was only 6/11, and one miss involved a subsystem that did not exist in the pre-fix tree.

The safe output contract is: **stage + likely file + bounded candidate shortlist + explicit uncertainty**.
