# Progressive inspection cross-repository transfer v4 preregistration

## Frozen rule

- Preserve the repository-adaptive flat shortlist in positions 1–5.
- Supplemental owners must already belong to one of the flat-file-anchored semantic families.
- Order supplemental owners by their frozen global adaptive rank, preferring runtime and non-scaffolding declarations only as deterministic tie-breakers.
- Stop the primary expansion at position 10 and permit one final fallback at position 11.
- Evidence, causal-owner, score-gap-confidence, and cross-view rerankers are disabled because their fresh transfers were rejected.
- Exact-owner output and per-case confidence remain disabled.

Locked implementation hashes before cohort freezing:

- `src/core/declarationClusters.ts`: `4254e044bde84287aa8ac399e81ae3bdeaddd1d6bc1ce4b340c8b84040347f95`
- `src/core/correctionStage.ts`: `2cf306fd2cb4814ad5ec5f3ca6ac79e946f0aad8e180626130559758523d942a`
- `src/core/pipeline.ts`: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- truth mapper: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`

## Blind boundary

The cohort is frozen from public PR/issue metadata. Predictions and progressive-plan receipts must be completely written from the pre-fix parent tree before any fixing diff or post-fix source is opened. The cohort uses twelve ArkType changes not present in any prior experiment artifact.

## Promotion rule

Promote the progressive plan only if all conditions hold:

- at least 8 cases have declaration-level ground truth;
- every displayed flat-shortlist owner remains in the same position at the head of the plan;
- progressive coverage is at least baseline top-five coverage and rescues at least one case;
- progressive coverage exactly retains the full cluster union on this cohort, with zero losses;
- the plan inspects at most 11 unique declarations per case;
- average inspection work is at least 35% lower than the full cluster view;
- every case has a valid deterministic receipt with rejected rerankers disabled;
- exact-owner output remains disabled.

No thresholds, order, cohort membership, or issue text may change after prediction freezing.
