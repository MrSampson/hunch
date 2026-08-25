# Zod causal-intervention transfer v1 preregistration

Frozen before any fixing diff for these cases was opened.

## Question

Can deterministic single-site interventions turn an authenticated failing reproduction into a high-precision correction-owner claim, instead of merely identifying code that executes?

## Corpus

- Repository: `colinhacks/zod`
- Nine runtime bug-fix PRs merged from 2026-08-20 through 2026-08-25, after the prior runtime-owner holdout.
- Inclusion requires a public reproduction that can be compiled into one boolean red-before/green-after target and a distinct green-before control.
- No case substitution after execution starts.
- Task SHA-256: `eec7e8ac50c7759892ba442685d0cf3e355385806ec4a8ef957536bae84173cc`

## Locked mechanism

1. Authenticate each case: target is false at the first parent, control is true at the first parent, target is true at the fixing commit.
2. Build at most fourteen candidate declarations from frozen contrastive V8 evidence, the adaptive static ranker, and correction-stage routing.
3. Generate at most twenty deterministic single-site interventions per candidate: condition negation, binary-operator swap, boolean flip, or negation removal. V8 target-only lines affect ordering only.
4. An intervention is admitted only when it makes the target true and leaves the control true.
5. Generic `util.ts`, `utils.ts`, `helper(s).ts`, and `core.ts` levers cannot own a correction.
6. Predict an owner only when exactly one non-infrastructure owner has an admitted intervention. Zero or multiple owners means abstain.
7. Freeze all predictions before deriving truth from fixing diffs.

Locked SHA-256 values:

- Evaluation policy and candidate allocation: `7cc01e3e8e10a6534e94f61d926361b4d66dc091dabac5d9d4d45cadbf1dac54`
- Intervention mechanism: `e25ed0f4171c65bdab27a92b9c77debbc43af4ff23b0aba21c2d510341495cf4`
- Adaptive ranker: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`
- Runtime evidence: `1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4`
- Correction-stage router: `a86cf735f240b9440d4332b74b21f665163316eed31590bf15c0efa10346fb25`

## Promotion gate

Promote only if every condition holds:

1. At least seven authenticated, symbol-scorable cases.
2. At least two owner predictions.
3. At least 25% prediction coverage over scorable cases.
4. At least 90% exact-symbol precision.
5. Zero incorrect predicted files.

The mechanism may abstain freely. A passing result would justify only a larger cross-repository safety test in disposable checkouts; it would not authorize automatic mutation or product delivery.

## Failure policy

Any hash mismatch, changed task, post-result tuning, failed authentication, or fixing-diff access before prediction freeze invalidates the run. A failed gate is frozen as a negative result and is not rescored.
