# Miyabi-Nexus Enterprise: Spatial Swarm Coordination Protocol
**Status:** ACTIVE
**Objective:** Orchestrate autonomous agents to concurrently modify a shared codebase by utilizing Miyabi-Nexus as a real-time spatial map and agent-skill-bus as the synchronization layer.

## 1. The Paradigm Shift: Spatial Isolation over Sequential Waiting
The traditional human approach to Git conflicts is sequential merging (DAGs and waiting). 
In **Agentic Engineering**, this is a bottleneck. We do not want 40 AI agents waiting in line; we want 40 agents working simultaneously without ever colliding.

**The Solution:** Agents do not wait for each other. Instead, they use the GitNexus Knowledge Graph to find isolated areas of the codebase (subgraphs) where their Blast Radius does not overlap with any other active agent.

## 2. The Protocol: Observe, Claim, Execute, Pivot

### Phase 1: Observe (The Nexus Map)
Before starting a task or touching a file, the agent queries the Miyabi-Nexus API (e.g., /api/active-agents from T025) or uses agent-skill-bus list-locks.
- *Question:* Is anyone currently modifying the files I need, or the files that directly depend on my files (Blast Radius)?

### Phase 2: Claim (The Skill Bus Lock)
If the required subgraph is clear, the agent claims it.
- agent-skill-bus lock /src/mcp/server.ts
- The Miyabi-Nexus Web UI will instantly render a glowing golden aura over server.ts and float the agent's badge in 3D space. All other agents now see this territory as claimed.

### Phase 3: Pivot (Collision Avoidance)
If an agent attempts to start a task (e.g., T022: Test Gen) and sees that its required files (server.ts) are currently glowing/locked by another agent (e.g., T025: AI Cursor API):
- **DO NOT WAIT.** Waiting wastes compute.
- **PIVOT:** The agent dynamically alters its execution plan.
  - *Example:* Instead of injecting code directly into server.ts, the agent creates a new, isolated file src/mcp/tools/suggest_tests.ts, writes all the logic there, and leaves a single comment (TODO: import and register in server.ts).
- Once the original lock on server.ts is released, the agent swoops in, makes the 1-line injection, and finishes.

## 3. Applying the Protocol to Current Tasks
We are abandoning the previous sequential DAG. Instead, agents will resolve the current traffic jam using spatial pivots.

- **T012 (UI Clustering):** Safe to execute. Locks gitnexus-web/src/components/GraphCanvas.tsx.
- **T013 (Cross-Repo Impact):** Safe to execute. Locks src/mcp/local/local-backend.ts.
- **T022 (Test Gen) vs T025 (AI Cursors):** Both need server.ts.
  - T025 claims server.ts first.
  - T022 *pivots*, building its logic in isolated files, avoiding CI conflicts, and linking them only when T025 releases the lock.

## 4. Conclusion
Miyabi-Nexus is not just a visualization tool for humans. It is the **Air Traffic Control (ATC) radar for AI Swarms**. By combining this map with the agent-skill-bus radio, we achieve true massively parallel software development.
