# Miyabi Nexus (Enterprise Edition)

<div align="center">
  <img src="https://raw.githubusercontent.com/ShunsukeHayashi/Miyabi-Nexus/main/docs/assets/radar-demo.png" alt="Agent Radar UI" width="800" />
  <h2>The Spatial Radar & Air Traffic Control for Autonomous AI Swarms</h2>
  <p>
    <b>Miyabi Nexus</b> is an advanced enterprise fork of the GitNexus project. It transforms your entire codebase into a 3D-navigable knowledge graph and provides real-time Blast Radius analysis.
    Crucially, it acts as an <b>Air Traffic Control Radar for AI Agents</b>, enabling over 40 autonomous AI agents to edit code simultaneously without Git conflicts via the <i>Spatial Swarm Coordination Protocol</i>.
  </p>
</div>

<div align="center">
  <a href="https://www.npmjs.com/package/@miyabi-ai/nexus">
    <img src="https://img.shields.io/npm/v/%40miyabi-ai%2Fnexus.svg" alt="npm version"/>
  </a>
  <a href="https://polyformproject.org/licenses/noncommercial/1.0.0/">
    <img src="https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg" alt="License: PolyForm Noncommercial"/>
  </a>
</div>

## 🌌 The Problem: The AI Deadlock
When you unleash 40 AI agents on a repository, they all try to edit the same core files. The result? Endless Git merge conflicts, broken CI pipelines, and agents stuck in a loop trying to fix each other's code. **Sequential waiting (DAGs) is too slow.**

## 🛸 The Solution: Spatial Isolation (Agent Radar)
Miyabi Nexus solves this using **physics-based Spatial Isolation**.
1. **Observe**: Agents use the 3D graph to calculate the "Blast Radius" of their intended changes.
2. **Claim (Lock)**: Agents project a "Magnetic Field" (Lock) over the files they need via the MCP backend.
3. **Pivot**: If an agent encounters another agent's magnetic field, it doesn't wait. It instantly **pivots** to a different task.

## ✨ Enterprise Features

- **Apple-Style 3D Radar UI**: A beautiful, minimalist 3D WebGL interface (System Grays, White Background) that prioritizes clarity. Watch AI agents work in real-time (Golden Auras = Locked regions).
- **Backend-Native Swarm Control**: All lock coordination (`gitnexus_lock_resource`) happens natively at the CLI/MCP layer. The UI is just a radar; it cannot crash the swarm.
- **Cross-Repo Federation (MCP)**: Analyze API calls and dependencies across multiple organizational repositories simultaneously.
- **Enterprise RAG & Persistence**: Zero-cost re-indexing with persistent Vector DBs. The AI remembers historical context and architectural decisions across sessions.
- **Autonomous CI/CD Reviewer**: Automatically runs on GitHub PRs. If a PR breaks the build, the AI swarm will autonomously pull, self-heal, and push fixes without human intervention.

## 🚀 Quick Start

```bash
# Install Miyabi Nexus globally
npm install -g @miyabi-ai/nexus

# Analyze your repository (Creates Knowledge Graph & Vector DB)
miyabi-nexus analyze .

# Launch the Enterprise 3D Radar & Backend
miyabi-nexus start
```

## 🤖 Swarm API (For AI Agents)

AI Agents (such as OpenClaw, Claude Code, or Cursor) interact with Miyabi Nexus via the built-in MCP (Model Context Protocol) to achieve spatial isolation:

- `gitnexus_lock_resource`: Claim a spatial region (Blast Radius) before editing.
- `gitnexus_list_locks`: Observe active locks to Pivot away from crowded files.

## 🗺️ Documentation

- [Production Requirements Document (REQUIREMENT.md)](./REQUIREMENT.md) - Full architecture and Phase 1-4 roadmap.
- [Enterprise Roadmap (Epic.md)](./Epic.md) - Current epic breakdown.

## 📄 License

This fork is maintained by **Miyabi LLC**.
For commercial inquiries and Enterprise partnerships, contact [shunsuke.hayashi@miyabi-ai.jp](mailto:shunsuke.hayashi@miyabi-ai.jp).

---
*Note: This is an enterprise fork of the original [GitNexus](https://github.com/abhigyanpatwari/GitNexus) project. Important Notice: Neither Miyabi Nexus nor GitNexus has any official cryptocurrency or token.*
