# Repository-adaptive correction shortlist transfer v1

Predictions were frozen from issue text and pre-fix source before any fix diff was requested.

## Verdict

**promote-adaptive-diagnostic**

- Scorable tasks: 11/12
- Exact declaration: 7/11 (63.6%)
- Top five: 9/11 (81.8%)
- Correct file: 8/11 (72.7%)
- Exact-owner policy: disabled

| task | repo | stage | top prediction | exact | top 5 | file | pre-existing ground truth |
|---|---|---|---|:---:|:---:|:---:|---|
| [arktypeio-arktype-pr-1586](https://github.com/arktypeio/arktype/pull/1586) | arktypeio/arktype | runtime-policy | `ark/json-schema/object.ts::parseRequiredAndOptionalKeys` | no | no | no | `ark/schema/structure/structure.ts::implementation` |
| [arktypeio-arktype-pr-1602](https://github.com/arktypeio/arktype/pull/1602) | arktypeio/arktype | runtime-policy | `ark/type/keywords/string.ts::uuid` | yes | yes | yes | `ark/type/keywords/string.ts::uuid` |
| [arktypeio-arktype-pr-1631](https://github.com/arktypeio/arktype/pull/1631) | arktypeio/arktype | runtime-policy | `ark/type/type.ts::InternalTypeParser` | no | no | no | `ark/type/fn.ts::InternalFnParser` |
| [arktypeio-arktype-pr-1619](https://github.com/arktypeio/arktype/pull/1619) | arktypeio/arktype | runtime-policy | `ark/schema/shared/errors.ts::ArkErrors` | yes | yes | yes | `ark/schema/shared/errors.ts::ArkErrors` |
| [arktypeio-arktype-pr-1632](https://github.com/arktypeio/arktype/pull/1632) | arktypeio/arktype | runtime-policy | `ark/repo/mocha.globalSetup.ts::mochaGlobalSetup` | no | yes | no | `ark/schema/scope.ts::BaseScope`<br>`ark/schema/scope.ts::bindPrecompilation` |
| [arktypeio-arktype-pr-1628](https://github.com/arktypeio/arktype/pull/1628) | arktypeio/arktype | runtime-policy | `ark/regex/quantify.ts::tryFastPath` | yes | yes | yes | `ark/regex/quantify.ts::tryFastPath` |
| [typestack-class-validator-pr-2596](https://github.com/typestack/class-validator/pull/2596) | typestack/class-validator | runtime-policy | `src/decorator/string/IsPostalCode.ts::isPostalCode` | no | no | no | unscorable |
| [typestack-class-validator-pr-2647](https://github.com/typestack/class-validator/pull/2647) | typestack/class-validator | runtime-policy | `src/decorator/string/IsUUID.ts::isUUID` | yes | yes | yes | `src/decorator/string/IsUUID.ts::IS_UUID`<br>`src/decorator/string/IsUUID.ts::IsUUID`<br>`src/decorator/string/IsUUID.ts::isUUID` |
| [typestack-class-validator-pr-2574](https://github.com/typestack/class-validator/pull/2574) | typestack/class-validator | runtime-policy | `src/decorator/string/IsBase64.ts::isBase64` | no | yes | yes | `src/decorator/string/IsBase64.ts::IsBase64` |
| [typestack-class-validator-pr-2549](https://github.com/typestack/class-validator/pull/2549) | typestack/class-validator | constraint-definition | `src/decorator/string/IsBase64.ts::IsBase64` | yes | yes | yes | `src/decorator/string/IsBase64.ts::IsBase64` |
| [typestack-class-validator-pr-2423](https://github.com/typestack/class-validator/pull/2423) | typestack/class-validator | runtime-policy | `src/decorator/date/MaxDate.ts::maxDate` | yes | yes | yes | `src/decorator/date/MaxDate.ts::MaxDate`<br>`src/decorator/date/MaxDate.ts::maxDate` |
| [typestack-class-validator-pr-2044](https://github.com/typestack/class-validator/pull/2044) | typestack/class-validator | constraint-definition | `src/decorator/common/IsOptional.ts::IsOptional` | yes | yes | yes | `src/decorator/common/IsOptional.ts::IsOptional` |

Algorithm SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`.
Task SHA-256: `90616e2a5d45a73bf1f8b389e203a2f857b514d8122f96828a2273e56dbdb1fa`.
Prediction SHA-256: `3c2d88f76378dc15f245b03f4aae8be19130d50ff61523c286c4f53d3fdec7db`.

## Interpretation

The locked transfer rule passed. The adaptive ranker may replace the Zod-specific path router as an experimental stage + likely-file + bounded-shortlist diagnostic; exact-owner output remains disabled.
