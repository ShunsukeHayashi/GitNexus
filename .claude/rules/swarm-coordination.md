# Swarm Coordination Rules (Agentic Engineering)

## Overview
As multiple autonomous AI agents work concurrently in this repository (Miyabi-Nexus), we must prevent CI collisions, test assertion degradation, and infinite conflict loops. 
Whenever you are operating as an agent within a tmux session or a background process, YOU MUST adhere to these rules.

## Rule 1: Sequential Feature Merging
- Do not blindly overwrite core modules (e.g., local-backend.ts, graph schemas, VALID_RELATION_TYPES) if another PR is currently modifying them.
- If your CI fails due to mismatched test assertions (e.g., expected 9 to be 8), IT IS LIKELY another agent has merged a PR that changed the baseline schema.
- **Action:** Before fixing tests, ALWAYS run git fetch origin main and git rebase origin/main (or git pull --rebase origin main) to sync your branch with the latest reality. Do not manually downgrade assertions to pass outdated tests.

## Rule 2: Module Resolution and Refactoring
- If your CI fails with Cannot find module './some-module.js', DO NOT immediately recreate the file or delete the import unless you are 100% sure the module was deprecated.
- Another agent may have refactored or renamed the module in a parallel PR.
- **Action:** Use gh pr list --state merged --limit 5 or check main history to understand where the module went. Sync your branch before attempting to fix it.

## Rule 3: Yield to Core Engine Changes
- UI changes (3D graph, clustering, WebGL) MUST yield to Core Engine changes (MCP router, KuzuDB schema, Blast Radius graph traversal).
- If you are a UI agent and you encounter a Git conflict in a core file (server.ts, local-backend.ts), discard your core changes and rely on the implementation provided by the Core Engine agent.

## Rule 4: Self-Healing and Diagnostics
- If you push a commit and the GitHub Action pr-blast-radius fails, read the Action logs.
- If the failure is a workflow syntax error or a repository setup error (e.g., Not a git repository), fix the workflow or script in .github/workflows/ directly. 
- You are empowered to fix the CI pipeline itself to ensure your PR can be validated.

## Rule 5: Blast Radius Awareness
- Every PR must generate a Blast Radius comment. If the bot fails to post it, your task is NOT complete.
- Ensure your changes do not break downstream consumers mapped by the impact() tool.

## Rule 6: No Infinite Loops
- If you have attempted to fix a failing CI test 3 times and it still fails, STOP.
- Do not push a 4th time. Write your analysis of the failure in a PR comment, tag @ShunsukeHayashi, and suspend your autonomous loop.
