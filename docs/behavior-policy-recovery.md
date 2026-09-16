# Recover unavailable behavior-policy dependencies

An executable behavior policy binds its test source and exact dependency snapshots. Evaluation
returns `error` if those inputs cannot be validated. An advisory error is non-blocking; it is
still unevaluated evidence, never a passing policy.

First distinguish missing or damaged cache from changed dependency inputs. A missing cache is
reported as `dependency-snapshot-cache-absent`. A present cache without a unique validated match
is `dependency-snapshot-unavailable`; that alone does not prove `package.json` changed.
Restore or explicitly provision the policy's exact reviewed snapshots, then evaluate again.
Do not edit manifests, pinned IDs, integrity hashes or lifecycle flags to make a check pass.

If the current dependency inputs differ from every pinned snapshot, re-planning or re-proving
the active policy cannot renew its authority. The lifecycle accepts a proof for compiled,
validating or proposed policies, and does not mutate an active policy's semantics in place.

Prepare a replacement through the existing behavior workflow:

1. Inspect `hunch constitution g2 --behavior-candidates 30`. Retain the exact review content
   hash and candidate ID; the report may contain private evidence.
2. Provision with `--behavior-deps <candidate> --behavior-review-hash <hash>`, then replay with
   `--behavior-replay <candidate> --behavior-review-hash <hash>`. Inspect the exact known-bad and
   known-good results. Dependency lifecycle scripts require their explicit package allowlist.
3. Present the candidate, source changes, dependency snapshots and replay to the human. Only
   an explicit selection authorizes `--behavior-attest ... --disposition selected --actor human:<id>`.
   A prior selection for different evidence is not a selection of this review hash.
4. Assess `--behavior-materialize`, then use `--behavior-policy-materialize` for the selected
   evidence. Review the resulting non-active proposal and its P3 proof. Materialization may
   refuse incompatible existing artifacts; do not overwrite them to continue.
5. Obtain explicit human activation of the exact replacement and withdrawal or retirement of
   the old policy. [The lifecycle](autonomy-ladder.md) describes those separate authority changes.

If no current grounded candidate represents the intended rule, retain the error and collect
the missing human evidence. A broad request to maintain the code or repair a cache does not
supply that evidence or choose new policy authority.
