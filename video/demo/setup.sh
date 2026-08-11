#!/usr/bin/env bash
# Rig the orders-demo repo for the "What is Hunch" video.
#
#   video/demo/setup.sh [target-dir] [--stage shot3|full]
#
#   --stage shot3  (pre-init rig, for recording shot3.tape)
#       commit 1 = the "before" app (route talks to the DB directly)
#       working tree = the service-layer refactor, UNCOMMITTED
#       Hunch NOT initialized — the tape runs init/commit/sync/why on camera.
#
#   --stage full   (default — the state after shot 3 + shot 4 were recorded)
#       both commits, Hunch initialized + synced, the not-calls invariant
#       recorded, an `agent-shortcut` branch holding the bad edit:
#           git restore --source agent-shortcut -- app/api/orders.py
#
#   Both stages also create <target>-memory.git, a local bare repo used as the
#   "team memory" remote in shot 5 (works offline).
#
# Override the hunch binary with HUNCH=... (e.g. a source checkout via tsx).
set -euo pipefail

TARGET="${1:-$HOME/hunch-video-demo}"
STAGE="full"
if [ "${2:-}" = "--stage" ]; then STAGE="${3:-full}"; fi
HUNCH="${HUNCH:-hunch}"
FILES="$(cd "$(dirname "$0")/files" && pwd)"

if [ -e "$TARGET" ]; then
  echo "refusing to overwrite existing $TARGET — remove it first" >&2
  exit 1
fi

# The "team memory" remote for shot 5 — a plain local bare repo.
MEMORY="$TARGET-memory.git"
rm -rf "$MEMORY"
git init -q --bare -b main "$MEMORY"

mkdir -p "$TARGET"
cd "$TARGET"
git init -q -b main
git config user.name "Dave"
git config user.email "dave@example.com"

# Commit 1 — the "before": the route reaches the DB session directly.
cp -R "$FILES/v1-direct/." .
git add -A
git commit -qm "feat: initial orders API"

# The service-layer refactor — the decision the video is about.
cp -R "$FILES/v2-service/." .

if [ "$STAGE" = "shot3" ]; then
  echo "rigged for SHOT 3 at $TARGET (refactor uncommitted, hunch not initialized)"
  echo "team-memory remote at $MEMORY"
  exit 0
fi

git add -A
git commit -qm "refactor: route orders through the service layer for auth + batching

Direct session access from routes skipped authorization and query
batching — the root cause of the Mar-2024 orders incident. All order
reads now go through app/services/orders.fetch_orders."
REFACTOR_SHA=$(git rev-parse HEAD)

# Hunch: init quietly, commit its scaffolding (so grounding lookups see HEAD),
# then synthesize the refactor commit with the deterministic provider so
# rigging never depends on an LLM being present.
export HUNCH_SYNTH_PROVIDER=deterministic
$HUNCH init >/dev/null
git add -A
git commit -qm "chore: wire up hunch"
$HUNCH sync "$REFACTOR_SHA" >/dev/null 2>&1 || $HUNCH sync "$REFACTOR_SHA"

# Shot 4's bad edit lives on a branch; on camera:
#   git restore --source agent-shortcut -- app/api/orders.py
git switch -qc agent-shortcut
cp "$FILES/v1-direct/app/api/orders.py" app/api/orders.py
git commit -qam "perf: skip the service hop in list_orders" >/dev/null 2>&1 || true
git switch -q main

# The invariant for Shot 4. Direct edges only: the service layer is the
# sanctioned path to the session, so the rule is "no DIRECT route→session
# call", not transitive reachability.
$HUNCH conform --add "routes must not reach the DB session directly — go through the service layer" \
  --assert not-calls --subject list_orders --object get_session \
  --why "the 2am orders incident, Mar 2024 — direct access skipped auth + batching"

# Commit any remaining rigged memory (captures usually auto-commit themselves).
git add -A
git diff --cached --quiet || git commit -qm "chore: hunch memory (rigged for demo)"

echo
echo "── rig verification ─────────────────────────────────────────"
$HUNCH conform
echo
$HUNCH why app/api/orders.py
echo "─────────────────────────────────────────────────────────────"
echo "rigged at $TARGET"
echo "  shot 4 bad edit:    git restore --source agent-shortcut -- app/api/orders.py"
echo "  shot 5 team remote: $MEMORY"
