# Shot 4 — the gate (terminal beats; the agent segment is Screen Studio/OBS).
# Prereqs: video/demo/setup.sh ~/hunch-video-demo    (full stage)
# Re-running conform --add is safe: the invariant id is deterministic.
Output shot4-gate.mp4
Set FontSize 18
Set Width 1920
Set Height 1080
Set Padding 40
Set TypingSpeed 55ms
Set Shell bash

Hide
Type "cd ~/hunch-video-demo && export HUNCH_SYNTH_PROVIDER=deterministic && clear"
Enter
Show

Type `hunch conform --add "routes must not reach the DB session directly — go through the service layer" --assert not-calls --subject list_orders --object get_session --why "the 2am orders incident, Mar 2024 — direct access skipped auth + batching"`
Enter
Sleep 6s

Type "# the agent's 'optimization', replayed:"
Enter
Type "git restore --source agent-shortcut -- app/api/orders.py"
Enter
Sleep 2s

Type "hunch conform --strict"
Enter
Sleep 9s

Type "git checkout -- app/api/orders.py && hunch conform"
Enter
Sleep 7s
