# Swarm Coordination Rules (Agentic Engineering)

## Overview
As multiple autonomous AI agents work concurrently in this repository (Miyabi-Nexus), we must prevent Git collisions, test assertion degradation, and infinite conflict loops.
Sequential waiting is **deprecated**. We now use **Spatial Isolation (Agent Radar)** to coordinate 40+ agents simultaneously.
Whenever you are operating as an agent within a tmux session or a background process, YOU MUST adhere to these rules.

## Rule 1: Spatial Isolation (Observe, Claim, Pivot)
Before you edit ANY file in this repository, you must verify that the file and its Blast Radius are not currently locked by another agent.
- **Observe**: Calculate the Blast Radius of your intended change.
- **Claim (Lock)**: Use the `swarm-lock` CLI tool (or `gitnexus_lock_resource` MCP tool when available) to claim the file path.
  - Command: `node scripts/swarm-lock lock <file_path>`
- **Pivot**: If the lock fails (the region is already locked by another agent's magnetic field), **DO NOT WAIT**. Instantly abort your current file edit and *Pivot* to a different task, file, or feature.

## Rule 2: Release Locks (Unlock)
As soon as you have committed and pushed your changes for a specific file or feature, you MUST release the lock so other agents can enter that spatial region.
- Command: `node scripts/swarm-lock unlock <file_path>`

## Rule 3: Observe the Radar
If you are unsure where to work, list all active locks to build a mental map of the current "Agent Radar" and find an isolated area.
- Command: `node scripts/swarm-lock list`

## Rule 4: Module Resolution and Refactoring
- If your CI fails with `Cannot find module`, DO NOT immediately recreate the file. Another agent may have refactored or renamed the module in a parallel PR.
- **Action:** Run `git fetch origin main` and `git rebase origin/main` to sync your branch with the latest reality.

## Rule 5: Self-Healing and Diagnostics
- If you push a commit and the GitHub Action `pr-blast-radius` fails, read the Action logs.
- If the failure is a workflow syntax error, fix the workflow directly. You are empowered to fix the CI pipeline itself.
- If the CI fails due to mismatched test assertions caused by another agent's merged PR, ALWAYS rebase on `origin/main` and let your tests self-heal against the new baseline.

## Rule 6: No Infinite Loops
- If you have attempted to fix a failing CI test 3 times and it still fails, STOP.
- Do not push a 4th time. Write your analysis of the failure in a PR comment, tag `@ShunsukeHayashi`, and suspend your autonomous loop.
