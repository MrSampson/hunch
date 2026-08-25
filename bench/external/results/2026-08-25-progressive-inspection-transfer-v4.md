# Progressive inspection cross-repository transfer v4

Cross-repository issue-only predictions and deterministic plan receipts were frozen from ArkType pre-fix parents before any fixing diff or post-fix source was opened.

## Verdict

**reject-progressive-inspection-v4**

- Scorable tasks: 12/12
- Baseline top-five hits: 5/12
- Hits through position ten: 5/12
- Progressive-plan hits: 5/12
- Full-cluster-union hits: 5/12
- Progressive rescues / losses against full union: 0/0
- Baseline / cluster file hits: 7/7
- Progressive average / max declarations: 11.0/11
- Full-cluster average declarations: 18.9
- Inspection reduction: 41.9%
- Flat shortlist preserved and receipts complete: yes
- Exact-owner output: disabled

| case | scorable | top five | through 10 | plan | full union | rescue | plan/full declarations | receipt | truth |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---:|---|---|
| arktypeio-arktype-pr-1579 | yes | miss | miss | miss | miss | no | 11/15 | `50550c026e336f07962af092` | `ark/type/declare.ts::finalizePreinferred` |
| arktypeio-arktype-pr-1574 | yes | hit | hit | hit | hit | no | 11/27 | `fd3758e1554113b17fd73ac5` | `ark/schema/structure/structure.ts::precompileMorphs` |
| arktypeio-arktype-pr-1553 | yes | hit | hit | hit | hit | no | 11/19 | `45e87210b15aba08a60cdf96` | `ark/repo/scratch.ts::$`<br>`ark/repo/scratch.ts::S`<br>`ark/repo/scratch.ts::baz`<br>`ark/repo/scratch.ts::r`<br>`ark/schema/roots/union.ts::UnionNode` |
| arktypeio-arktype-pr-1566 | yes | hit | hit | hit | hit | no | 11/14 | `3706173d34761f2fb5f576b6` | `ark/json-schema/common.ts::parseCommonJsonSchema` |
| arktypeio-arktype-pr-1567 | yes | miss | miss | miss | miss | no | 11/20 | `97e0feb125688bc4783941f3` | `ark/schema/constraint.ts::constraintKeyParser`<br>`ark/schema/roots/intersection.ts::writeIntersectionExpression` |
| arktypeio-arktype-pr-1535 | yes | miss | miss | miss | miss | no | 11/21 | `baa79494c0cfbe0048db77b0` | `ark/regex/quantify.ts::parsePossibleRange`<br>`ark/regex/quantify.ts::parsePossibleRangeString`<br>`ark/regex/quantify.ts::parseQuantifier`<br>`ark/regex/quantify.ts::writeUnnaturalNumberQuantifierError` |
| arktypeio-arktype-pr-1528 | yes | miss | miss | miss | miss | no | 11/18 | `7b69441d621416eb63e9150f` | `ark/type/variants/base.ts::Type` |
| arktypeio-arktype-pr-1464 | yes | miss | miss | miss | miss | no | 11/14 | `23b93492c3fc57aea66bdbf2` | `ark/schema/constraint.ts::InternalPrimitiveConstraint`<br>`ark/schema/roots/basis.ts::InternalBasis`<br>`ark/schema/roots/union.ts::UnionNode`<br>`ark/schema/shared/traversal.ts::Traversal`<br>`ark/schema/shared/traversal.ts::TraversalKind`<br>`ark/schema/shared/traversal.ts::TraversalMethodsByKind`<br>`ark/schema/structure/sequence.ts::SequenceNode` |
| arktypeio-arktype-pr-1423 | yes | miss | miss | miss | miss | no | 11/16 | `3e154e15fe4f8b57fa8663be` | `ark/type/nary.ts::NaryIntersectionParser`<br>`ark/type/nary.ts::NaryMergeParser`<br>`ark/type/nary.ts::NaryUnionParser` |
| arktypeio-arktype-pr-1401 | yes | miss | miss | miss | miss | no | 11/18 | `a12324aa09fa0b8d537e925a` | `ark/schema/node.ts::BaseNode`<br>`ark/schema/node.ts::compileMeta`<br>`ark/schema/node.ts::referenceMatcher`<br>`ark/type/attributes.ts::BuiltinTerminalObjectKind`<br>`ark/util/registry.ts::arkUtilVersion` |
| arktypeio-arktype-pr-1347 | yes | hit | hit | hit | hit | no | 11/20 | `3fe606bf255fda7050fe6b6e` | `ark/repo/scratch.ts::urDOOMed`<br>`ark/repo/scratch/fn.ts::FunctionParser`<br>`ark/schema/shared/errors.ts::ArkErrors`<br>`ark/schema/structure/structure.ts::StructureNode`<br>`ark/type/match.ts::AtParser`<br>`ark/type/match.ts::CaseEntry`<br>`ark/type/match.ts::CaseKeyKind`<br>`ark/type/match.ts::CaseMatchParser`<br>`ark/type/match.ts::ChainableMatchParser`<br>`ark/type/match.ts::InternalChainedMatchParser`<br>`ark/type/match.ts::InternalMatchParser`<br>`ark/type/match.ts::MatchParser`<br>`ark/type/match.ts::MatchParserContext`<br>`ark/type/match.ts::StringsParser`<br>`ark/type/match.ts::addCasesToContext`<br>`ark/type/match.ts::addCasesToParser`<br>`ark/type/match.ts::addDefaultToContext`<br>`ark/type/match.ts::casesToMorphTuple`<br>`ark/type/match.ts::inferCaseArg`<br>`ark/type/match.ts::maybeLiftToKey`<br>`ark/type/match.ts::stringValue`<br>`ark/type/match.ts::validateStringCases`<br>`ark/util/registry.ts::arkUtilVersion` |
| arktypeio-arktype-pr-1339 | yes | hit | hit | hit | hit | no | 11/25 | `20147a058901131c2409b16b` | `ark/repo/scratch.ts::base`<br>`ark/repo/scratch.ts::environment`<br>`ark/repo/scratch.ts::environmentSchema`<br>`ark/repo/scratch.ts::result`<br>`ark/repo/scratch.ts::types`<br>`ark/schema/structure/structure.ts::StructureNode`<br>`ark/util/registry.ts::arkUtilVersion` |

Prediction SHA-256: `d361129e05cbe45caabf407d8fd445a673cb24ef1e4adb87ef79b5d64f8237d0`.
Receipt-set SHA-256: `44e905aca46393c7602b10bdb365bcf4bb817256b6ad312e6a410fe069e396d8`.
