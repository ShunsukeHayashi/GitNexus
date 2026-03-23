# Miyabi Nexus (Enterprise Edition)

<div align="center">
  <h2>The Code Intelligence Platform & Spatial Radar for Autonomous AI Swarms</h2>
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

## ✨ Enterprise Features

- **Spatial Swarm Coordination (Agent Radar)**: Real-time visualization of active AI agents (Golden Auras) editing your codebase. Agents autonomously detect locks and *Pivot* to avoid Git merge conflicts.
- **Cross-Repo Federation (MCP)**: Analyze API calls and dependencies across multiple organizational repositories simultaneously.
- **Enterprise RAG & Persistence**: Zero-cost re-indexing with persistent Vector DBs. The AI remembers historical context and architectural decisions across sessions.
- **Autonomous CI/CD Reviewer**: Automatically runs on GitHub PRs. If a PR breaks the build, the AI swarm will autonomously pull, self-heal, and push fixes without human intervention.
- **Apple-Style 3D Radar UI**: A beautiful, minimalist 3D WebGL interface that prioritizes clarity over visual noise.

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

AI Agents (such as OpenClaw or Claude Code) can interact with Miyabi Nexus via the built-in MCP (Model Context Protocol) to achieve spatial isolation:

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
