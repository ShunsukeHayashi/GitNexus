# Miyabi Nexus Enterprise Edition Roadmap (Q2 2026 - Q1 2027)

## Vision
Transform the open-source \Miyabi-Nexus\ fork into a commercially viable **Enterprise Code Intelligence Platform** capable of managing massive mono/poly-repos, cross-organizational API boundaries, and providing AI-driven impact analysis for large-scale migrations.

## Milestone 1: Cross-Repo Graph & MCP Federation (Q2 2026)
**Goal:** Enable the graph to " break out\ of a single repository by federating multiple GitNexus instances via Model Context Protocol (MCP).
- [ ] **T010:** Define \CROSS_REPO_CALL\ edge types in the graph data model.
- [ ] **T011:** Implement MCP Router in \@miyabi-ai/nexus\ backend to aggregate \graph-meta.jsonl\ from multiple local repositories.
- [ ] **T012:** Update 3D UI to cluster nodes by \Repository\ namespace and draw inter-repo glowing edges.
- [ ] **T013:** Add \Blast Radius: Cross-Repo\ feature to show if changing an API in Repo A breaks a consumer in Repo B.

## Milestone 2: Enterprise Memory & RAG Integration (Q3 2026)
**Goal:** Persist knowledge across sessions so the AI doesn't have to re-index or re-ask. Implement organization-wide context.
- [ ] **T014:** Replace in-memory vector DB with a persistent vector store (e.g. LanceDB or persistent KuzuDB bindings) for embeddings.
- [ ] **T015:** Implement \ProjectMemory\ system (similar to OpenClaw's MEMORY.md but graph-aware).
- [ ] **T016:** Add \Historical PR Analysis\ node types (connect code nodes to the GitHub PRs that modified them).

## Milestone 3: Collaborative Multi-Player & Security (Q4 2026)
**Goal:** Allow a team of developers to share the same Nexus instance securely.
- [ ] **T017:** Implement WebSockets for real-time cursor/selection sharing in the 3D space (Figma-like multiplayer).
- [ ] **T018:** Implement RBAC (Role-Based Access Control) for the Nexus backend via JWT.
- [ ] **T019:** Audit and sanitize LLM prompts to prevent Prompt Injection in enterprise codebases.

## Milestone 4: CI/CD Pipeline Integration (Q1 2027)
**Goal:** Autonomous PR reviews and impact reports integrated directly into GitHub Actions.
- [ ] **T020:** Create \Miyabi-Nexus-Action\ for GitHub.
- [ ] **T021:** Generate \Blast Radius Report\ automatically as a PR comment.
- [ ] **T022:** Auto-generate Unit Tests for affected nodes and attach them to the PR.
