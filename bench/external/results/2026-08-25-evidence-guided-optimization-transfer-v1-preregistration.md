# Evidence-guided shortlist optimization transfer v1 — preregistration

## Question

Does the frozen `behavior-sensitive-file-reserve-v1` rule improve the production adaptive top-five shortlist on previously unused authenticated behavior cases without losing a baseline hit?

## Freeze boundary

The six tasks were selected from PR title/body evidence only. Their fixing source diffs and changed declarations must not be opened until baseline predictions, intervention observations, optimized predictions, and per-case optimization receipts have been written and hashed.

Frozen hashes before repository fetch:

- Task artifact: `dfb13178b0d2a0152e85bceb8d9f73ca0f8e41ce00cda8948a09c7c8635e1f86`
- Production correction-stage implementation: `1250b92093c2444a0b91097734eaea6816e95c70b023e4eadcb83d2613f039ae`
- Causal intervention implementation: `e25ed0f4171c65bdab27a92b9c77debbc43af4ff23b0aba21c2d510341495cf4`
- Adaptive ranker: `40ceb9b4e0baf826793705dfd377fee2fe11f0c5401d9bd64085dba960be996f`
- Runtime evidence ranker: `1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4`

## Protocol

1. Resolve each fixing commit's first parent without opening the diff.
2. Run the target and control on the pre-fix source and both again on the fixed source.
3. A case is authenticated only when pre-fix target is red, pre-fix control is green, fixed target is green, and fixed control is green.
4. Freeze the production baseline top five from issue text and pre-fix source.
5. Attempt at most eight deterministic interventions for each of at most ten candidates assembled from pre-fix runtime, adaptive, and correction-stage evidence.
6. Compile the observations through the production verified-evidence map, then run the production evidence-guided optimizer with the exact same issue claim.
7. Write and hash every optimization receipt and the complete prediction artifact before reading fixing diffs.
8. Open the fixing diffs only to derive changed declaration/file ground truth, then score baseline and optimized predictions.

## Primary metrics and locked gate

- Authenticated, declaration-scorable cases must be at least four.
- Optimized top-five declaration hits must be strictly greater than baseline top-five hits.
- Baseline-to-optimized declaration losses must be zero.
- Optimized correct-file hits must be at least baseline correct-file hits.
- Every scored row must carry a deterministic optimization receipt.

Pass: `promote-evidence-guided-shortlist-v1`. Any failed condition: `reject-evidence-guided-shortlist-v1`.

Exact-owner output remains disabled regardless of outcome. Execution-only evidence is recorded but cannot change ranking; only authenticated, same-claim behavior-sensitive evidence can reserve slots, and at least two baseline slots remain.
