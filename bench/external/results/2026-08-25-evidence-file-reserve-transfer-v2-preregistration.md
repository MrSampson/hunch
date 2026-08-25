# Evidence file reserve transfer v2 — preregistration

Frozen before any fixing diff for the six cases in the companion task file was opened.

## Question

Does `evidence-file-reserve-v2` improve the production adaptive top-five implementation shortlist on previously unused, authenticated behavior cases?

## Frozen rule

- Authenticate the supplied claim only when the target is red and a distinct control is green before the fix.
- Prefer admitted behavior-sensitive intervention files when available.
- Otherwise admit a runtime owner only when target execution is greater than control and at least twice `max(1, control)`.
- Sum target-minus-control support by file.
- Preserve baseline ranks one through four; use only rank five for the strongest admitted runtime file.
- Let the frozen repository-adaptive static ranker select the declaration within that file.
- Never emit an exact-owner claim.

## Freshness and order

The six PR numbers were absent from every earlier frozen task set. Cases were selected and probes were written from PR title/body and merge SHA only. The evaluator must freeze predictions and per-case optimization receipts before reading a fixing diff.

## Scoring and decision

Only cases with pre-fix target red, pre-fix control green, post-fix target green, post-fix control green, and at least one changed declaration are scored.

Promote v2 only if all are true:

1. At least four cases are authenticated and declaration-scorable.
2. Optimized top-five hits exceed baseline top-five hits.
3. There are zero baseline-hit losses.
4. Optimized correct-file hits do not fall below baseline.
5. Every scored prediction contains a deterministic optimization receipt.

Otherwise reject v2. Development replay results are excluded from this decision.

## Frozen SHA-256 values

- Tasks: `5a80b0cfab6e9fbb7c9544e665f4930ad013936473f9f6bc0576cf14ea0c35bc`
- Production optimizer/ranker: `bbf79c810ca78f41ff677b32e1aecd9f407d9f062825403032153f87af7ed3b1`
- Evidence compiler: `dfe7b3f4a7ce3fa8649debe490fe1b04712550bdaefb6768988d48ff4b8494b0`
- Core static ranker: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- V8 range mapper: `1774802aecf1a814278fdf855ed64bc4f727f26a2ee9b78336eee27fb37f7bb4`
- Ground-truth declaration mapper: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`
