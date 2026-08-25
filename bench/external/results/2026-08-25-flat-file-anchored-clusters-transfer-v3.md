# Flat-file-anchored declaration clusters transfer v3

Predictions and deterministic receipts were frozen from issue text and pre-fix source before any fixing diff or post-fix source was opened. Cluster coverage has an explicitly larger inspection budget than the flat top five.

## Verdict

**promote-flat-file-anchored-clusters-v3**

- Scorable tasks: 12/12
- Baseline top five: 3/12 (25.0%)
- Supplemental cluster families: 5/12 (41.7%)
- Combined preserved-top-five plus clusters: 6/12 (50.0%)
- Combined improvement over the flat top five: +25.0 percentage points
- Cluster rescues/losses relative to top five: 3/1
- Baseline/cluster file coverage: 8/10 (83.3% cluster)
- Cluster inspection budget, average/max declarations: 18.8/24
- Receipts complete and flat shortlist preserved: yes
- Exact-owner output: disabled

The cluster percentage is not a top-five accuracy number: it measures a bounded hierarchical view anchored to up to five flat-shortlist files, with two families and three declarations per file.

| case | scorable | top five | clusters | rescue | file | declarations | receipt | truth |
|---|:---:|:---:|:---:|:---:|:---:|---:|---|---|
| zod-pr-6419 | yes | miss | hit | yes | yes | 24 | `5ac452d05be779d6ec2e0e48` | `packages/zod/src/v4/classic/schemas.ts::ZodTransform`<br>`packages/zod/src/v4/core/json-schema-processors.ts::inputOptin`<br>`packages/zod/src/v4/core/json-schema-processors.ts::tupleProcessor`<br>`packages/zod/src/v4/core/schemas.ts::$ZodCatch`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDefault`<br>`packages/zod/src/v4/core/schemas.ts::$ZodDefaultInternals`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObject`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObjectJIT`<br>`packages/zod/src/v4/core/schemas.ts::$ZodOptional`<br>`packages/zod/src/v4/core/schemas.ts::$ZodOptionalInternals`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPrefault`<br>`packages/zod/src/v4/core/schemas.ts::$ZodPrefaultInternals`<br>`packages/zod/src/v4/core/schemas.ts::$ZodTransform`<br>`packages/zod/src/v4/core/schemas.ts::$ZodUnion`<br>`packages/zod/src/v4/core/schemas.ts::$ZodUnionInternals`<br>`packages/zod/src/v4/core/schemas.ts::OptionalInSchema`<br>`packages/zod/src/v4/core/schemas.ts::ParsePayload`<br>`packages/zod/src/v4/core/schemas.ts::TupleInputTypeWithOptionals`<br>`packages/zod/src/v4/core/schemas.ts::_$ZodTypeInternals`<br>`packages/zod/src/v4/core/schemas.ts::getTupleOptStart`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchall`<br>`packages/zod/src/v4/core/schemas.ts::handleOptionalResult`<br>`packages/zod/src/v4/core/schemas.ts::handlePipeResult`<br>`packages/zod/src/v4/core/util.ts::optionalKeys` |
| zod-pr-6420 | yes | hit | miss | no | yes | 21 | `39ebd351fe960185cc58e0f5` | `packages/zod/src/v4/core/errors.ts::RawIssue`<br>`packages/zod/src/v4/core/schemas.ts::$ZodType`<br>`packages/zod/src/v4/core/util.ts::attachSchema`<br>`packages/zod/src/v4/core/util.ts::finalizeIssue` |
| zod-pr-6305 | yes | miss | miss | no | yes | 15 | `fccfa2490a627c4638b9b80c` | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |
| zod-pr-6387 | yes | miss | miss | no | yes | 15 | `9866d5f174f6057e47b2a180` | `packages/zod/src/v4/classic/schemas.ts::ZodArray`<br>`packages/zod/src/v4/classic/schemas.ts::ZodMap`<br>`packages/zod/src/v4/classic/schemas.ts::ZodObject`<br>`packages/zod/src/v4/classic/schemas.ts::ZodRecord`<br>`packages/zod/src/v4/classic/schemas.ts::ZodSet`<br>`packages/zod/src/v4/classic/schemas.ts::ZodTransform`<br>`packages/zod/src/v4/classic/schemas.ts::ZodTuple`<br>`packages/zod/src/v4/core/memoizer.ts::$ZodCyclicError`<br>`packages/zod/src/v4/core/memoizer.ts::Entry`<br>`packages/zod/src/v4/core/memoizer.ts::Memoizer`<br>`packages/zod/src/v4/core/memoizer.ts::NO_ISSUES`<br>`packages/zod/src/v4/core/memoizer.ts::STATE`<br>`packages/zod/src/v4/core/memoizer.ts::State`<br>`packages/zod/src/v4/core/memoizer.ts::WithState`<br>`packages/zod/src/v4/core/memoizer.ts::attachMemoizer`<br>`packages/zod/src/v4/core/memoizer.ts::bucketFor`<br>`packages/zod/src/v4/core/memoizer.ts::isBackEdge`<br>`packages/zod/src/v4/core/memoizer.ts::isRecursive`<br>`packages/zod/src/v4/core/memoizer.ts::recursive`<br>`packages/zod/src/v4/core/schemas.ts::$ZodArray`<br>`packages/zod/src/v4/core/schemas.ts::$ZodMap`<br>`packages/zod/src/v4/core/schemas.ts::$ZodMemoizer`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObject`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObjectJIT`<br>`packages/zod/src/v4/core/schemas.ts::$ZodRecord`<br>`packages/zod/src/v4/core/schemas.ts::$ZodSet`<br>`packages/zod/src/v4/core/schemas.ts::$ZodTuple`<br>`packages/zod/src/v4/core/schemas.ts::$ZodType`<br>`packages/zod/src/v4/core/schemas.ts::ParsePayload`<br>`packages/zod/src/v4/core/schemas.ts::_$ZodTypeInternals`<br>`packages/zod/src/v4/core/schemas.ts::handleReadonlyResult` |
| zod-pr-6133 | yes | miss | hit | yes | yes | 14 | `5db998adc5885ce7d510b025` | `packages/zod/src/v4/core/json-schema-processors.ts::inputOptin`<br>`packages/zod/src/v4/core/json-schema-processors.ts::objectProcessor` |
| zod-pr-5928 | yes | miss | miss | no | no | 18 | `a30dd8d8efac5ae67da288a0` | `packages/zod/src/v4/classic/deep-partial.ts::DeepPartial`<br>`packages/zod/src/v4/classic/deep-partial.ts::deepPartial`<br>`packages/zod/src/v4/classic/in-out.ts::input`<br>`packages/zod/src/v4/classic/in-out.ts::output`<br>`packages/zod/src/v4/core/visit.ts::AnyZod`<br>`packages/zod/src/v4/core/visit.ts::Kind`<br>`packages/zod/src/v4/core/visit.ts::RESOLVING`<br>`packages/zod/src/v4/core/visit.ts::Resolving`<br>`packages/zod/src/v4/core/visit.ts::SchemaOfKind`<br>`packages/zod/src/v4/core/visit.ts::VisitFn`<br>`packages/zod/src/v4/core/visit.ts::VisitHandlers`<br>`packages/zod/src/v4/core/visit.ts::visit`<br>`packages/zod/src/v4/mini/deep-partial.ts::DeepPartial`<br>`packages/zod/src/v4/mini/deep-partial.ts::deepPartial`<br>`packages/zod/src/v4/mini/in-out.ts::input`<br>`packages/zod/src/v4/mini/in-out.ts::output` |
| zod-pr-6157 | yes | miss | miss | no | yes | 23 | `947a12b238e08f97db506f90` | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-pr-6408 | yes | hit | hit | no | yes | 17 | `736a6d71c9777e9d99f90361` | `packages/zod/src/v4/core/json-schema-generator.ts::JSONSchemaGenerator`<br>`packages/zod/src/v4/core/to-json-schema.ts::ToJSONSchemaContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::extractDefs`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize`<br>`packages/zod/src/v4/core/to-json-schema.ts::initializeContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::process` |
| zod-pr-6411 | yes | miss | miss | no | yes | 19 | `5de85eb1a7c436d5055b4c81` | `packages/zod/src/v4/classic/from-json-schema.ts::checkPropertyNames`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema`<br>`packages/zod/src/v4/classic/from-json-schema.ts::convertSchema` |
| zod-pr-6404 | yes | hit | hit | no | yes | 20 | `0df9a749f0bbab14680d7a3d` | `packages/zod/src/v4/core/util.ts::merge`<br>`packages/zod/src/v4/mini/schemas.ts::merge` |
| zod-pr-6177 | yes | miss | miss | no | no | 22 | `02ed4390fda0d2946e895592` | `packages/zod/src/v4/locales/en.ts::error` |
| zod-pr-6402 | yes | miss | hit | yes | yes | 18 | `010c046b43fab4656bad3456` | `packages/zod/src/v4/classic/from-json-schema.ts::decodeJSONPointerSegment`<br>`packages/zod/src/v4/classic/from-json-schema.ts::resolveRef` |

Prediction SHA-256: `85549f691d56ea3f3048212ba5d947f6522a1828cbca5c3bad4abf9c9f05fa80`.
Receipt-set SHA-256: `1397f285864e90d3fb1850667fa600cd7c275c587307de376aac3a25547c0fdf`.
