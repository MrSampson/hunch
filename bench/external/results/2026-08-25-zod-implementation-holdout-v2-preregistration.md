# Zod implementation-owner holdout v2 preregistration

Locked after calibration on the fully opened v1 corpus and before the first
prediction on these 20 newer time-forward tasks.

- Evaluator SHA-256: `353ebfebf863acd9aa922783fd3b29a724a66bfc34f281b3ee3894ee9a4d407a`
- Pipeline/ranker SHA-256: `fe054b947def337f5551dc77395c75403f88dd222be68ffe155bd54018a3e482`
- Frozen task file SHA-256: `aeef3f71a450dc19b6c94768ade1ed98593e0813829c48d6f0247c8b0a2209a7`
- Corpus: the 20 newest qualifying focused fixes merged from 2026-08-13,
  mined deterministically from the first 100 recently updated merged PRs.

Prediction uses issue title/body and the first-parent pre-fix tree. The future
diff is opened only after ranking and inference for that task. Symbol labels use
the same changed-hunk/top-level-declaration rule as v1.

Two decisions are locked independently:

1. Promote a single automatic symbol hint only with at least 10 delivered
   predictions, at least 90% exact-symbol precision, at least 50% coverage, at
   least 8 true-discovery predictions, and at least 85% true-discovery precision.
2. Advance a top-five candidate shortlist to an agent experiment only with at
   least 75% overall top-five recall and at least 65% top-five recall on issues
   that do not disclose their authentic owner.

No threshold, ranker, task, or label rule may change after the run starts.
Failure or an unrepresentable label remains in the result.
