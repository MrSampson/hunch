# Zod causal-intervention transfer v1

All intervention predictions were frozen before fixing diffs were read. Only red-before, green-control, green-after cases are scored.

## Verdict

**reject-causal-intervention-owner**

- Authenticated: 8/9
- Scorable: 8/9
- Owner predictions: 2/8 (25.0%)
- Exact symbol precision: 1/2 (50.0%)
- Correct predicted files: 2/2
- Static adaptive top-five: 2/8

| task | authenticated | intervention owner | exact | file | adjudication | truth |
|---|:---:|---|:---:|:---:|---|---|
| zod-pr-6462 | yes | abstain | no | no | ambiguous-behavioral-owners | `packages/zod/src/v4/core/schemas.ts::$ZodCatch`<br>`packages/zod/src/v4/core/schemas.ts::$ZodOptional`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchResult`<br>`packages/zod/src/v4/core/schemas.ts::handleOptionalResult` |
| zod-pr-6459 | no | abstain | no | no | no-behavioral-owner | `packages/zod/src/v4/core/compile.ts::generateLiteralCheck`<br>`packages/zod/src/v4/core/json-schema-processors.ts::enumProcessor`<br>`packages/zod/src/v4/core/json-schema-processors.ts::literalProcessor`<br>`packages/zod/src/v4/core/schemas.ts::$ZodEnum`<br>`packages/zod/src/v4/core/schemas.ts::$ZodLiteral` |
| zod-pr-6452 | yes | abstain | no | no | no-behavioral-owner | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema`<br>`packages/zod/src/v4/classic/from-json-schema.ts::fullTime`<br>`packages/zod/src/v4/core/json-schema-processors.ts::stringProcessor`<br>`packages/zod/src/v4/core/schemas.ts::$ZodISODateTime`<br>`packages/zod/src/v4/core/schemas.ts::$ZodStringInternals` |
| zod-pr-6457 | yes | abstain | no | no | no-behavioral-owner | `packages/zod/src/v4/core/regexes.ts::datetime`<br>`packages/zod/src/v4/core/regexes.ts::timeSource` |
| zod-pr-6223 | yes | abstain | no | no | no-behavioral-owner | `packages/zod/src/v4/core/util.ts::floatSafeRemainder` |
| zod-pr-6192 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodNumber` | no | yes | unique-behavioral-owner | `packages/zod/src/v4/core/schemas.ts::$ZodCatch`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchResult` |
| zod-pr-6024 | yes | abstain | no | no | ambiguous-behavioral-owners | `packages/zod/src/v4/core/checks.ts::$ZodCheckIncludes` |
| zod-pr-6440 | yes | `packages/zod/src/v4/core/schemas.ts::$ZodCatch` | yes | yes | unique-behavioral-owner | `packages/zod/src/v4/core/schemas.ts::$ZodCatch`<br>`packages/zod/src/v4/core/schemas.ts::handleOptionalResult` |
| zod-pr-6443 | yes | abstain | no | no | ambiguous-behavioral-owners | `packages/zod/src/v4/core/memoizer.ts::attachMemoizer`<br>`packages/zod/src/v4/core/memoizer.ts::cloneIssues` |

Prediction SHA-256: `e23d5c6eb614df3d4de368add18ad78ff310e6ad2f8de02d688dd608bffe4d3f`.
