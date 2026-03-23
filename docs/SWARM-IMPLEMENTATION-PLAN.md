# Miyabi-Nexus Enterprise: Spatial Swarm Implementation Plan
**Status:** DRAFT -> ACTIVE
**Objective:** Implement the " Spatial Swarm Coordination Protocol\ using gent-skill-bus and Miyabi-Nexus to enable 40+ AI agents to work concurrently without Git conflicts.

## Phase 1: Infrastructure Setup (The Radio & The Map)
Before agents can coordinate, the underlying tools must be integrated into the Miyabi-Nexus repository.

### Step 1.1: Install and Configure gent-skill-bus
- **Action:** Add @shuhayas/agent-skill-bus as a devDependency to the Miyabi-Nexus package.json.
- **Action:** Create a wrapper script scripts/swarm-lock.sh and scripts/swarm-unlock.sh that agents can easily call from their terminal sessions to lock/unlock files or subgraphs.
- **Verification:** Run a local test simulating two agents trying to lock src/mcp/server.ts simultaneously.

### Step 1.2: Expose Active Locks to the Nexus API (The Map)
- **Action:** Modify the backend (e.g., src/mcp/server.ts or a new endpoints file) to read the current lock state from gent-skill-bus (e.g., via gent-skill-bus list-locks).
- **Action:** Create a new API endpoint GET /api/swarm-state that returns a list of currently locked files/symbols and the agent ID holding the lock.
- **Verification:** Start the backend and verify /api/swarm-state returns correct JSON when a lock is active.

## Phase 2: UI Visualization (The Radar)
Agents (and human commanders) need to see the locks in real-time on the 3D graph.

### Step 2.1: Render \Locked\ Nodes in 3D
- **Action:** Modify gitnexus-web/src/components/GraphCanvas.tsx to poll /api/swarm-state every 2 seconds.
- **Action:** Apply a distinct visual style (e.g., a pulsing red or golden aura) to nodes whose file paths match the active locks.
- **Verification:** Lock a file via CLI and watch the corresponding node light up in the browser.

### Step 2.2: The \Agent Control Tower\ Dashboard
- **Action:** Add a floating UI panel in the Web UI listing all active agents, their current task ID, and the files they have locked.
- **Verification:** Ensure the UI accurately reflects the output of gent-skill-bus list-locks.

## Phase 3: Agent Protocol Enforcement (The Rules of Engagement)
Agents must be trained (via prompts and system instructions) to use this new infrastructure.

### Step 3.1: Update CLAUDE.md and System Prompts
- **Action:** Rewrite the CLAUDE.md instructions to mandate the **Observe, Claim, Execute, Pivot** protocol.
- **Action:** Explicitly instruct agents to use scripts/swarm-lock.sh <filepath> *before* editing any file.
- **Action:** Instruct agents to query gitnexus_impact to ensure their intended changes don't overlap with a currently locked file's blast radius.

### Step 3.2: Implement the \Pivot\ Fallback
- **Action:** Add examples to the prompt showing how an agent should react if a file is locked (e.g., \If server.ts is locked create src/mcp/tools/my_new_tool.ts and leave a TODO comment\).

## Phase 4: Swarm Testing (The Live Fire Exercise)
- **Action:** Spawn 5 Claude Code agents simultaneously, assigning them tasks that intentionally overlap (e.g., adding 5 different MCP tools to server.ts).
- **Observation:** Monitor the 3D graph. We should see one agent lock server.ts (it glows), while the other 4 agents pivot and create separate files.
- **Success Criteria:** All 5 PRs are created, CI passes for all, and no Git conflicts occur in server.ts.

## Execution Steps for the Commander (You)
1. Approve this plan.
2. I will execute Phase 1 (installing gent-skill-bus and creating the API wrapper).
3. We will then deploy Phase 2 (UI Visualization).
