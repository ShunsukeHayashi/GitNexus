# Miyabi-Nexus Enterprise: Swarm Execution Plan (DAG)
**Status:** DRAFT
**Objective:** Orchestrate autonomous agents to complete Enterprise Milestones without Git conflicts, utilizing gent-skill-bus for resource locking and gitnexus for Blast Radius pre-computation.

## 1. The Core Problem: Unplanned Blast Radius Collisions
Currently, multiple agents are spawned simultaneously on distinct features (e.g., T012, T013, T022, T025). However, these features implicitly modify the same core files (e.g., src/mcp/local/local-backend.ts, src/mcp/server.ts, graph schema constants). This results in:
- Outdated test assertions causing CI loops.
- Cannot find module errors due to uncoordinated refactoring.
- A " last-pusher-wins\ Git rebase conflict.

## 2. The Solution: Pre-Computed Execution DAG + Agent Skill Bus
Before assigning an Epic or Feature to an agent, the Commander (or a Planning Agent) must execute a **Dry Run Blast Radius Analysis** to map the \Resource Contention Zones\.

### 2.1 Pre-Computation Phase (The \Plan\)
For every pending Task (T-xxx), run gitnexus_impact on the entry points.
- **T012 (UI Clustering):** Modifies gitnexus-web/src/components/*
- **T013 (Cross-Repo Impact):** Modifies src/mcp/local/local-backend.ts
- **T022 (Unit Test Gen):** Modifies src/mcp/server.ts, src/mcp/tools.ts, tests.
- **T025 (AI Cursors):** Modifies src/mcp/server.ts (new endpoints), gitnexus-web/*

**Contention Matrix:**
- gitnexus-web/*: T012 vs T025 -> **CONFLICT**
- src/mcp/server.ts: T022 vs T025 -> **CONFLICT**
- local-backend.ts: T013 is isolated, but schema changes affect T022 tests -> **DEPENDENCY**

### 2.2 The Execution DAG (Directed Acyclic Graph)
Based on the Contention Matrix, the Swarm MUST execute tasks in the following strict order (Levels). Agents in the same Level can run in parallel. An agent cannot start a Level N task until all Level N-1 tasks are merged into main.

#### Level 1: Core Engine & Schema (Unblocks Tests & UI)
- **T013 (Cross-Repo Impact):** Modifies local-backend.ts.
 - *Lock:* gent-skill-bus lock src/mcp/local/local-backend.ts
- **T022 (Test Gen):** Modifies server.ts, ools.ts.
 - *Lock:* gent-skill-bus lock src/mcp/server.ts

*(Wait for T013 and T022 to be MERGED into main. CI passes.)*

#### Level 2: Backend API Additions (Depends on Stable Schema)
- **T025-Backend (AI Cursor Endpoints):** Modifies server.ts to add /api/active-agents.
 - *Constraint:* Must branch from main AFTER Level 1.
 - *Lock:* gent-skill-bus lock src/mcp/server.ts

*(Wait for T025-Backend to be MERGED.)*

#### Level 3: Web UI Consumption (Parallel safe, isolated components)
- **T012 (UI Clustering):** Modifies graph rendering for namespaces.
 - *Lock:* gent-skill-bus lock gitnexus-web/src/components/GraphCanvas.tsx
- **T025-Frontend (AI Cursor UI):** Consumes /api/active-agents.
 - *Lock:* gent-skill-bus lock gitnexus-web/src/components/Header.tsx (or overlay component).

## 3. Operational Protocol for Agents
When an agent is spawned via un-enterprise-sprint.sh, it will:
1. Parse this SWARM-DAG-PLAN.md file.
2. Identify its assigned Task ID (e.g., T025).
3. Check the DAG Level of its task.
4. If the task is Level 2, but Level 1 is not complete (check gh pr list --state open), the agent will **YIELD and exit** (or sleep).
5. If cleared to start, the agent executes gent-skill-bus lock <files> for its Contention Matrix zone.
6. Upon merging, the agent executes gent-skill-bus unlock <files>.
