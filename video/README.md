# "What is Hunch" — video kit

Everything for recording day. The full script (narration + shot list) lives in
the session notes; this folder holds the runnable parts.

## Layout

- `demo/setup.sh` — rigs the orders-demo repo (two stages, see below)
- `demo/files/` — the demo app: `v1-direct` (route hits the DB) and
  `v2-service` (the service-layer refactor)
- `tapes/` — [VHS](https://github.com/charmbracelet/vhs) scripts for the three
  terminal segments; render each with `vhs tapes/<name>.tape`

## Recording day, in order

```bash
npm i -g @davesheffer/hunch        # the published release, not a dev build
brew install vhs                    # or: go install github.com/charmbracelet/vhs@latest

# 1. Shot 3 (init → commit → sync → why) runs on the PRE-INIT rig:
video/demo/setup.sh ~/hunch-video-demo --stage shot3
vhs video/tapes/shot3-init.tape

# 2. Shots 4 + 5 run on the FULL rig (fresh, so state is exact):
rm -rf ~/hunch-video-demo ~/hunch-video-demo-memory.git ~/hunch-video-clone2
video/demo/setup.sh ~/hunch-video-demo
vhs video/tapes/shot4-gate.tape
vhs video/tapes/shot5-team.tape
```

Shots 1, 2, and the agent segment of Shot 4 are live captures (Screen
Studio / OBS) in the same rigged repo:

- Shot 1 (cold open): open `app/api/orders.py` on the `agent-shortcut` branch's
  parent state and let your agent "optimize" the endpoint — record 3–4 takes.
- Shot 4 (agent, with Hunch on): same prompt on `main`; the pre-edit hook
  injects the invariant, so the agent optimizes within the boundary.
- The bad edit, any time: `git restore --source agent-shortcut -- app/api/orders.py`

## Notes

- Tapes pin `HUNCH_SYNTH_PROVIDER=deterministic` so every render is
  reproducible with no LLM in the loop. Unset it (and have `claude` installed)
  for richer synthesized decision text — slower and nondeterministic.
- The whole team segment (shot 5) runs offline: `setup.sh` creates
  `~/hunch-video-demo-memory.git`, a local bare repo standing in for the
  private team-memory remote.
- Every command in the tapes was verified against v1.10.5; if a future release
  changes output shapes, re-run `setup.sh` and eyeball before rendering.
