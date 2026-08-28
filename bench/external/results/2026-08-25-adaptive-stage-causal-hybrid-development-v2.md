# Adaptive causal-slot hybrid development v2

Development-only: weights and slot allocation were selected on the already-consumed ArkType, class-validator, Effect, react-hook-form, tRPC, and Elysia results. This is not fresh evidence.

- Scorable cases: 35
- Adaptive top-five hits: 24/35 (68.6%)
- Hybrid top-five hits: 25/35 (71.4%)
- Allocation: retain adaptive ranks 1–4; fill rank 5 with the highest graph-conditioned alternative not already present.
- Repository regressions: none at aggregate level.
- Rescue: one Elysia case.

The graph score combines bounded caller/callee distance with fan-in/fan-out centrality. The observed gain is deliberately treated as a weak development signal; a fresh holdout requires at least two task-level rescues and zero task-level losses.
