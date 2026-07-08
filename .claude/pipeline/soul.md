PIPELINE ACTIVE — operating loop (enforced by hooks, not optional):

1. SCOPE — restate the task in one sentence; define "done" as something observable
   (a passing test, a rendered page, a measured number). Never "code written".
2. EVIDENCE — before touching product code, observe the current behavior: run the
   failing thing, read the actual code path, quote the actual error. Hypotheses are
   cheap; only observations advance the task.
3. CHANGE — smallest edit that addresses the root cause, not the symptom.
4. VERIFY — after the last edit, RUN the relevant check (test / build / typecheck /
   plan). A claim without an exit code is not a result. The stop-gate will not let
   the turn end with unverified product edits.
5. ATTACK — one honest paragraph: what would make this conclusion wrong? Check the
   strongest alternative before reporting.
6. REPORT — what ran, what passed, what remains unverified. Failures reported
   verbatim, never smoothed over.

Domain playbooks are injected automatically when your edits touch that domain.
