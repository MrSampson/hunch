# Guarded evidence bridge transfer v3

Predictions and optimization receipts were frozen from issue text, pre-fix source, and authenticated target/control execution before post-fix source or fixing diffs were opened.

## Verdict

**reject-guarded-evidence-bridge-v3**

- Authenticated/scorable: 5/5 of 6
- Baseline top five: 1/5 (20.0%)
- Optimized top five: 1/5 (20.0%)
- Improvement: 0.0% points
- Baseline/optimized correct file: 4/4
- File improvement: 0.0% points
- Rescues/losses: 0/0
- Receipts complete: yes
- Exact-owner output: disabled

| case | baseline | optimized | rescue | file | strategy | receipt | truth |
|---|:---:|:---:|:---:|:---:|---|---|---|
| zod-pr-6022 | miss | miss | no | no | guarded-execution-file-peer | `02e7b31bc70ba58260ea2040` | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema` |
| zod-pr-5900 | hit | hit | no | yes | no-actionable-evidence | `6330353fb3c985c92aea65f7` | `packages/zod/src/v4/core/schemas.ts::$ZodTuple`<br>`packages/zod/src/v4/core/schemas.ts::getTupleOptStart`<br>`packages/zod/src/v4/core/schemas.ts::handleTupleResults` |
| zod-pr-5934 | miss | miss | no | yes | no-actionable-evidence | `523a2dac56dff89449400d9c` | `packages/zod/src/v4/core/schemas.ts::$ZodEnum` |
| zod-pr-6020 | miss | miss | no | yes | no-actionable-evidence | `5424047a5b942e9b1cb07a41` | `packages/zod/src/v4/classic/from-json-schema.ts::convertBaseSchema`<br>`packages/zod/src/v4/classic/from-json-schema.ts::getTupleRest` |
| zod-pr-6355 | miss | miss | no | yes | no-actionable-evidence | `f3b3cf935146fb6ce7c9c21d` | `packages/zod/src/v4/core/schemas.ts::$ZodRecord` |
| zod-pr-6367 | hit | hit | no | yes | probe-unverified | `50ed9c067f82665d06a9c312` | `packages/zod/src/v4/core/errors.ts::formatError`<br>`packages/zod/src/v4/core/errors.ts::treeifyError` |

Prediction SHA-256: `4a47ca63bb6148983ece530a1ce56153507610e2f5a0501e956333737d490c85`.
Optimization-receipt SHA-256: `81b09677ffef9e5a5dc523c92e69a1974b12f331af6f2b90d0ad781da8c9b843`.
