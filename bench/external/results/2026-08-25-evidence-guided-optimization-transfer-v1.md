# Evidence-guided shortlist optimization transfer v1

Predictions, interventions, and optimization receipts were frozen from issue text and pre-fix source before fixing diffs were opened. Only authenticated, declaration-scorable cases are scored.

## Verdict

**reject-evidence-guided-shortlist-v1**

- Authenticated: 6/6
- Scorable: 6/6
- Baseline top five: 4/6 (66.7%)
- Optimized top five: 4/6 (66.7%)
- Improvement: 0.0% points
- Baseline correct file: 5/6
- Optimized correct file: 5/6 (0.0% points)
- Rescues/losses: 0/0
- Optimization receipts complete: yes
- Exact-owner output: disabled

| case | baseline | optimized | rescue | file | optimization | receipt | truth |
|---|:---:|:---:|:---:|:---:|---|---|---|
| zod-pr-6461 | hit | hit | no | yes | no-behavior-sensitive-evidence | `c24d7fbc02decc290a74c679` | `packages/zod/src/v4/core/json-schema-processors.ts::intersectionProcessor`<br>`packages/zod/src/v4/core/to-json-schema.ts::FOLDABLE_KEYS`<br>`packages/zod/src/v4/core/to-json-schema.ts::ToJSONSchemaContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::UNION_KEYS`<br>`packages/zod/src/v4/core/to-json-schema.ts::finalize`<br>`packages/zod/src/v4/core/to-json-schema.ts::foldIntersection`<br>`packages/zod/src/v4/core/to-json-schema.ts::foldObjects`<br>`packages/zod/src/v4/core/to-json-schema.ts::initializeContext`<br>`packages/zod/src/v4/core/to-json-schema.ts::undeclaredConstraint` |
| zod-pr-6460 | hit | hit | no | yes | no-behavior-sensitive-evidence | `8843883ef63b68d5a69c7a1f` | `packages/zod/src/v4/core/json-schema-processors.ts::recordProcessor`<br>`packages/zod/src/v4/core/schemas.ts::$InferZodRecordInput` |
| zod-pr-6442 | hit | hit | no | yes | no-behavior-sensitive-evidence | `6ff489601fd0f07609aea086` | `packages/zod/src/v4/core/compile.ts::generateStringFormatCheck`<br>`packages/zod/src/v4/core/schemas.ts::$ZodURL`<br>`packages/zod/src/v4/core/schemas.ts::asciiTabOrNewline`<br>`packages/zod/src/v4/core/schemas.ts::ipv6Alphabet`<br>`packages/zod/src/v4/core/schemas.ts::isValidCIDRv6`<br>`packages/zod/src/v4/core/schemas.ts::isValidIPv6`<br>`packages/zod/src/v4/core/schemas.ts::stripTabAndNewline` |
| zod-pr-6441 | hit | hit | no | yes | no-behavior-sensitive-evidence | `62ce356ee96d71163a28a51c` | `packages/zod/src/v4/core/checks.ts::$ZodCheckLengthEquals`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMaxLength`<br>`packages/zod/src/v4/core/checks.ts::$ZodCheckMinLength`<br>`packages/zod/src/v4/core/compile.ts::codePointLengthVar`<br>`packages/zod/src/v4/core/compile.ts::generateChecks`<br>`packages/zod/src/v4/core/util.ts::codePointLength`<br>`packages/zod/src/v4/core/util.ts::highSurrogate` |
| zod-pr-6434 | miss | miss | no | yes | no-behavior-sensitive-evidence | `718686a2dcb8295dc012a371` | `packages/zod/src/v4/core/compile.ts::dropsWhenAbsent`<br>`packages/zod/src/v4/core/compile.ts::generateObjectCheck`<br>`packages/zod/src/v4/core/compile.ts::generateTupleCheck`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObject`<br>`packages/zod/src/v4/core/schemas.ts::$ZodObjectJIT`<br>`packages/zod/src/v4/core/schemas.ts::handleCatchall`<br>`packages/zod/src/v4/core/schemas.ts::handlePropertyResult`<br>`packages/zod/src/v4/core/schemas.ts::handleTupleResults` |
| zod-pr-6426 | miss | miss | no | no | no-behavior-sensitive-evidence | `2b2d1d15b4b50844774d8d52` | `packages/zod/src/v4/core/util.ts::finalizeIssue` |

Prediction SHA-256: `8548e0c60b77fd65015e5a291d784090d1554f61af285f50a8c7c5581bf6b2b6`.
Optimization-receipt SHA-256: `cb55dcf27c6999b4ab95f4d1bfc84c5cf7a60828b590439c02d7e9116cfbbcc6`.
