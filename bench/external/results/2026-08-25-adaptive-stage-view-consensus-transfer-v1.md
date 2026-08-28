# Adaptive shortlist cross-view consensus transfer v1

All three rankings and evidence labels were frozen from issue text and pre-fix source before any fix diff was requested.

## Verdict

**reject-cross-view-evidence**

- Scorable tasks: 11/16
- Unfiltered top-five accuracy: 5/11 (45.5%)
- Supported coverage: 9/11 (81.8%)
- Supported top-five accuracy: 4/9 (44.4%)
- Improvement over unfiltered: -1.0%
- Supported likely-file accuracy: 3/9 (33.3%) — disabled
- Exact-owner policy: disabled

| task | repo | evidence | top prediction | top 5 | file | pre-existing ground truth |
|---|---|---|---|:---:|:---:|---|
| [trpc-trpc-pr-7437](https://github.com/trpc/trpc/pull/7437) | trpc/trpc | tentative | `packages/server/src/adapters/node-http/types.ts::NodeHTTPHandlerOptions` | no | no | unscorable |
| [trpc-trpc-pr-7390](https://github.com/trpc/trpc/pull/7390) | trpc/trpc | supported | `packages/client/src/links/httpBatchStreamLink.ts::httpBatchStreamLink` | yes | yes | `packages/client/src/links/httpBatchStreamLink.ts::httpBatchStreamLink` |
| [trpc-trpc-pr-7448](https://github.com/trpc/trpc/pull/7448) | trpc/trpc | tentative | `packages/react-query/src/shared/hooks/createHooksInternal.tsx::createRootHooks` | no | no | unscorable |
| [trpc-trpc-pr-7370](https://github.com/trpc/trpc/pull/7370) | trpc/trpc | supported | `packages/tanstack-react-query/src/internals/createOptionsProxy.ts::createTRPCOptionsProxy` | yes | yes | `packages/tanstack-react-query/src/internals/createOptionsProxy.ts::createTRPCOptionsProxy`<br>`packages/tanstack-react-query/src/internals/mutationOptions.ts::trpcMutationOptions` |
| [trpc-trpc-pr-7393](https://github.com/trpc/trpc/pull/7393) | trpc/trpc | supported | `scripts/version.ts::packages` | no | no | unscorable |
| [trpc-trpc-pr-7336](https://github.com/trpc/trpc/pull/7336) | trpc/trpc | supported | `packages/react-query/src/internals/getQueryKey.ts::getQueryKeyInternal` | no | no | `packages/server/src/unstable-core-do-not-import/createProxy.ts::createInnerProxy` |
| [trpc-trpc-pr-7316](https://github.com/trpc/trpc/pull/7316) | trpc/trpc | tentative | `packages/server/src/adapters/node-http/incomingMessageToRequest.ts::createHeaders` | no | no | unscorable |
| [trpc-trpc-pr-7314](https://github.com/trpc/trpc/pull/7314) | trpc/trpc | tentative | `packages/server/src/unstable-core-do-not-import/initTRPC.ts::TRPCBuilder` | no | no | unscorable |
| [elysiajs-elysia-pr-1792](https://github.com/elysiajs/elysia/pull/1792) | elysiajs/elysia | supported | `src/error.ts::ValidationError` | yes | no | `src/compose.ts::composeValidationFactory` |
| [elysiajs-elysia-pr-1793](https://github.com/elysiajs/elysia/pull/1793) | elysiajs/elysia | supported | `src/cookies.ts::Cookie` | no | no | `src/compose.ts::composeHandler` |
| [elysiajs-elysia-pr-1795](https://github.com/elysiajs/elysia/pull/1795) | elysiajs/elysia | supported | `src/cookies.ts::Cookie` | no | no | `src/compose.ts::composeHandler` |
| [elysiajs-elysia-pr-1802](https://github.com/elysiajs/elysia/pull/1802) | elysiajs/elysia | supported | `src/adapter/utils.ts::handleFile` | yes | yes | `src/adapter/bun/handler.ts::mapCompactResponse`<br>`src/adapter/bun/handler.ts::mapEarlyResponse`<br>`src/adapter/bun/handler.ts::mapResponse`<br>`src/adapter/utils.ts::handleFile`<br>`src/adapter/web-standard/handler.ts::handleElysiaFile`<br>`src/adapter/web-standard/handler.ts::mapCompactResponse`<br>`src/adapter/web-standard/handler.ts::mapEarlyResponse`<br>`src/adapter/web-standard/handler.ts::mapResponse`<br>`src/compose.ts::composeHandler` |
| [elysiajs-elysia-pr-1805](https://github.com/elysiajs/elysia/pull/1805) | elysiajs/elysia | tentative | `src/types.ts::ElysiaConfig` | no | no | `src/index.ts::Elysia` |
| [elysiajs-elysia-pr-1803](https://github.com/elysiajs/elysia/pull/1803) | elysiajs/elysia | tentative | `src/adapter/utils.ts::createStreamHandler` | yes | yes | `src/adapter/utils.ts::createStreamHandler` |
| [elysiajs-elysia-pr-1794](https://github.com/elysiajs/elysia/pull/1794) | elysiajs/elysia | supported | `src/schema.ts::getCookieValidator` | no | no | `src/compose.ts::composeHandler` |
| [elysiajs-elysia-pr-1797](https://github.com/elysiajs/elysia/pull/1797) | elysiajs/elysia | supported | `src/types.ts::And` | no | no | `src/compose.ts::composeHandler` |

Ranker SHA-256: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`.
Policy SHA-256: `69cacc6fe39682562a9d5fc2d5075a01524549ba23ee237f80891bb81f15ebd5`.
Task SHA-256: `fd13d3596559ed429377e6c6f0198e968fa6862b8e5bbac55bf0989eedcf419a`.
Prediction SHA-256: `64591e528cb54fdfbec3a4228b49d5c16b77ccf08837300a5526375b86527dee`.

## Interpretation

The locked rule failed. Do not productize or tune and rescore this policy on this holdout.
