# Additive same-file frontier cross-repository transfer v5 preregistration

## Frozen rule

- Preserve the repository-adaptive top five and the complete promoted semantic-cluster plan in positions 1–11.
- Append exactly the first two globally ranked declarations from files already represented by the top five, excluding owners already in the plan.
- Stop after position 13 and report uncertainty; never widen to a new file.
- Evidence, causal-owner, score-gap-confidence, cross-view, relationship, and product-source rerankers remain disabled.
- Exact-owner output and per-case confidence remain disabled.

Development-only selection evidence: across 48 previously revealed cases, the 11-item promoted plan hit 26, the 13-item additive plan hit 30, with four rescues and zero losses. Its mean/max work was 12.9/13 declarations versus 19.8 for the earlier full-cluster sweep.

Locked hashes before any fresh prediction or fixing diff was opened:

- task cohort: `18d5bceeb0290dc56cbaac281103f677c0e1ed51970048ed78bebdee02807b5f`
- additive rule: `bfb4b9093b0ed27942069e6bb790c92e47e4835baf8709d4c48754eda0a19351`
- frontier rule: `4825e4c91d3fb6e25584297351bd2ec2d545fca7bd9c64becdb2f3338ed185f2`
- declaration clusters: `4254e044bde84287aa8ac399e81ae3bdeaddd1d6bc1ce4b340c8b84040347f95`
- correction stage: `2cf306fd2cb4814ad5ec5f3ca6ac79e946f0aad8e180626130559758523d942a`
- static ranker: `15312c497cbc887251b5cd32ae6f0d15d85a0a85bff0dfcddc55889cee8fea2c`
- truth mapper: `42a93f3fe80be666f7170d9fc4c7829843c6fd8803bbb9d3367e76d40b149f52`

## Blind boundary

The cohort contains twelve ArkType changes absent from prior experiment artifacts. Only public PR/issue metadata and the pre-fix parent tree may be opened until all candidate lists and deterministic receipts are written to the prediction artifact. Only then may the fixing diff and post-fix source be opened for scoring.

## Promotion rule

Promote only if every condition holds:

- at least 8 cases have declaration-level ground truth;
- positions 1–11 exactly preserve the promoted plan, which itself preserves the top five;
- additive coverage is at least promoted-plan coverage, rescues at least one case, and loses zero promoted hits;
- every appended declaration belongs to a file already represented by the top five;
- the hard cap is 13 unique declarations;
- mean inspection work is at least 20% below the complete flat-file cluster union;
- every case has a valid deterministic receipt and rejected rerankers stay disabled;
- exact-owner output stays disabled.

No threshold, order, cohort member, or issue text may change after prediction freezing.
