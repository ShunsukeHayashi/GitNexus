#!/bin/bash
export CLAUDE_CODE_OAUTH_TOKEN=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

tmux new-session -d -s nexus-wave1 'claude -p " Fix Issue 1: In src/components/GraphCanvas.tsx implement 3D node animations using requestAnimationFrame. Map node properties or states to these animations. Keep GraphCanvasHandle interface.\'

tmux split-window -h -t nexus-wave1 'claude -p \Fix Issue 2: In src/components/GraphCanvas.tsx differentiate aiCitationHighlightedNodeIds and aiToolHighlightedNodeIds to cyan and violet a855f7. Update color priority and Legend.\'

tmux select-layout -t nexus-wave1 tiled
