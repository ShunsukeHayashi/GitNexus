# GitNexus

**Graph-powered code intelligence for AI agents.** Index any codebase into a knowledge graph, then query it via MCP or CLI.

Works with **Cursor**, **Claude Code**, **Codex**, **Windsurf**, **Cline**, **OpenCode**, and any MCP-compatible tool.

[![npm version](https://img.shields.io/npm/v/gitnexus.svg)](https://www.npmjs.com/package/gitnexus)
[![License: PolyForm Noncommercial](https://img.shields.io/badge/License-PolyForm%20Noncommercial-blue.svg)](https://polyformproject.org/licenses/noncommercial/1.0.0/)

---

## Why?

AI coding tools don't understand your codebase structure. They edit a function without knowing 47 other functions depend on it. GitNexus fixes this by **precomputing every dependency, call chain, and relationship** into a queryable graph.

Before touching any code, your agent can answer:
- "What will break if I rename this function?" → `impact()`
- "What tests should I write for this change?" → `suggest_tests()`
- "Is another agent already editing this file?" → `swarm_lock()`
- "How does authentication flow through this codebase?" → `query()`

**Three commands to give your AI agent full codebase awareness.**

---

## Quick Start

```bash
# 1. Index your repo (run from repo root)
npx gitnexus analyze

# 2. Configure MCP for your editor (one-time)
npx gitnexus setup

# 3. Start using it — ask your agent:
#    "What will break if I change UserService?"
```

`gitnexus analyze` indexes the codebase, installs agent skills, registers Claude Code hooks, and creates `AGENTS.md` / `CLAUDE.md` context files — all in one command.

`gitnexus setup` auto-detects your editors and writes the correct global MCP config. You only need to run it once.

---

## Production Usage

This section covers real-world workflows for using GitNexus in a live development environment.

### Workflow 1: Safe Refactoring

Before renaming or moving a function, always check blast radius first:

```
# In your AI editor, ask:
"Before I rename `processPayment`, run gitnexus_impact and tell me what will break."
```

The agent will call:
```
impact({ target: "processPayment", direction: "upstream" })
```

**Expected response structure:**
```json
{
  "target": "processPayment",
  "direction": "upstream",
  "depth": {
    "d1": ["checkoutController.handleCheckout", "OrderService.complete"],
    "d2": ["CartRouter.post /checkout", "WebhookHandler.handleStripeEvent"],
    "d3": ["api/checkout.ts entry point"]
  },
  "riskLevel": "HIGH",
  "confidence": 0.92
}
```

- `d=1` → **WILL BREAK** — direct callers you must update
- `d=2` → **LIKELY AFFECTED** — should test
- `d=3` → **MAY NEED TESTING** — transitive effects

If risk is HIGH or CRITICAL, the agent must warn you before proceeding.

After editing, verify scope with:
```
detect_changes({ scope: "staged" })
```

### Workflow 2: Understanding Unfamiliar Code

When onboarding to a new codebase or exploring a complex area:

```
# Ask your agent:
"How does the authentication flow work? Use gitnexus_query to find it."
```

The agent calls:
```
query({ query: "authentication login JWT validation" })
```

This returns **process-grouped results** — not just symbol matches, but the execution flows those symbols belong to. You get:

```
Process: user-authentication
  1. AuthController.login  [entry]
  2. AuthService.validateCredentials
  3. JWTService.sign
  4. SessionStore.create
  5. respond with token  [exit]
```

For a 360-degree view of a specific function:
```
context({ name: "validateCredentials" })
```

Returns callers, callees, which processes it participates in, and what it imports/exports.

### Workflow 3: Test Generation

After implementing a feature, get precise test suggestions:

```
suggest_tests({ symbol: "processPayment" })
```

Returns Vitest-ready test stubs with:
- Unit tests for edge cases (null args, error paths)
- Integration test hooks (upstream/downstream effects)
- Blast radius notes (what else might break)

```typescript
// Generated stubs — fill in the assertions
describe('processPayment', () => {
  it('handles null paymentMethod gracefully', async () => { ... });
  it('throws on amount <= 0', async () => { ... });
  it('emits payment.processed event on success', async () => { ... });
  // Integration: checkoutController.handleCheckout calls this
  it('integrates with handleCheckout correctly', async () => { ... });
});
```

### Workflow 4: Multi-Agent Swarm Coordination

When multiple AI agents work in parallel on the same repository, Git conflicts are inevitable unless agents coordinate. GitNexus provides filesystem-based locking through the swarm tools.

**Lock a file before editing:**
```
swarm_lock({
  target: "src/services/payment.ts",
  agent_id: "codex-agent-1",
  task: "Refactor processPayment to support multi-currency"
})
```

Response on success:
```json
{ "status": "LOCKED", "target": "src/services/payment.ts", "agent_id": "codex-agent-1" }
```

Response when another agent holds the lock:
```json
{
  "status": "CONFLICT",
  "lockedBy": "codex-agent-2",
  "task": "Add retry logic to payment processor",
  "lockedAt": "2025-01-01T12:00:00Z",
  "suggestion": "Coordinate with codex-agent-2 or wait for unlock"
}
```

**Check all active locks before starting work:**
```
swarm_list_locks()
```

```json
{
  "locks": [
    {
      "path": "src/services/payment.ts",
      "agentId": "codex-agent-2",
      "task": "Add retry logic",
      "lockedAt": "2025-01-01T12:00:00Z",
      "ageMinutes": 3
    }
  ]
}
```

**Release the lock after committing:**
```
swarm_unlock({
  target: "src/services/payment.ts",
  agent_id: "codex-agent-1"
})
```

Lock TTL is 30 minutes. Stale locks from crashed agents are automatically expired.

**Recommended agent workflow with swarm tools:**
```
1. swarm_list_locks()           # see what's available
2. swarm_lock({ target, agent_id, task })  # claim your file
3. impact({ target: symbolName })          # check blast radius
4. [make your edits]
5. detect_changes({ scope: "staged" })    # verify scope
6. [git commit]
7. swarm_unlock({ target, agent_id })     # release
```

### Workflow 5: Cross-Repo Blast Radius

If your monorepo or multi-repo project has `CROSS_REPO_CALL` edges (function calls that cross repository boundaries), `impact()` will trace through them:

```
impact({ target: "SharedAuthService.verify", direction: "upstream" })
```

Returns calls from other repositories that depend on this symbol, helping you understand whether a change in `shared-auth` will break `api-gateway` or `mobile-backend`.

### Workflow 6: Pre-Commit Safety Check

Before every commit, run:
```
detect_changes({ scope: "staged" })
```

This maps your staged changes back to affected processes and symbols, giving you:
- Which execution flows are touched
- Whether any HIGH-risk symbols changed
- A summary of the change scope

Use `scope: "compare"` with a base ref to check your entire branch:
```
detect_changes({ scope: "compare", base_ref: "main" })
```

---

## Editor Setup

### Claude Code (recommended — full integration)

```bash
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
```

Or use `npx gitnexus setup` to configure automatically.

**What you get:**
- All MCP tools
- Agent skills installed globally
- PreToolUse hooks that auto-augment Grep/Glob/Bash calls with knowledge graph context
- PostToolUse hooks that detect stale indexes after git mutations

### Codex

```bash
codex mcp add gitnexus -- npx -y gitnexus@latest mcp
```

### Cursor / Windsurf

Add to `~/.cursor/mcp.json` (global — works for all projects):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

### OpenCode

Add to `~/.config/opencode/config.json`:

```json
{
  "mcp": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

### Editor Feature Matrix

| Editor | MCP Tools | Skills | Hooks (auto-augment) | Swarm Tools | Support |
|--------|-----------|--------|---------------------|-------------|---------|
| **Claude Code** | Yes | Yes | Yes (PreToolUse) | Yes | **Full** |
| **Cursor** | Yes | Yes | — | Yes | MCP + Skills |
| **Codex** | Yes | Yes | — | Yes | MCP + Skills |
| **Windsurf** | Yes | — | — | Yes | MCP |
| **OpenCode** | Yes | Yes | — | Yes | MCP + Skills |

> **Claude Code** gets the deepest integration: MCP tools + agent skills + PreToolUse hooks that automatically enrich grep/glob/bash calls with knowledge graph context.

### Community Integrations

| Agent | Install | Source |
|-------|---------|--------|
| [pi](https://pi.dev) | `pi install npm:pi-gitnexus` | [pi-gitnexus](https://github.com/tintinweb/pi-gitnexus) |

---

## MCP Tools Reference

Your AI agent gets these tools automatically after running `gitnexus analyze` + MCP setup.

### Core Intelligence Tools

| Tool | What It Does | `repo` Param |
|------|-------------|--------------|
| `list_repos` | Discover all indexed repositories | — |
| `query` | Process-grouped hybrid search (BM25 + semantic + RRF) | Optional |
| `context` | 360-degree symbol view — categorized refs, process participation | Optional |
| `impact` | Blast radius analysis with depth grouping and confidence | Optional |
| `detect_changes` | Git-diff impact — maps changed lines to affected processes | Optional |
| `rename` | Multi-file coordinated rename with graph + text search | Optional |
| `cypher` | Raw Cypher graph queries | Optional |
| `suggest_tests` | Generate Vitest test stubs based on blast radius | Optional |

> With one indexed repo, the `repo` param is optional. With multiple repos, specify which: `query({query: "auth", repo: "my-app"})`.

### Swarm Coordination Tools

For multi-agent environments where multiple AI agents work in parallel:

| Tool | What It Does | Required Params |
|------|-------------|----------------|
| `swarm_lock` | Claim exclusive edit intent on a file | `target`, `agent_id` |
| `swarm_unlock` | Release a file lock after committing | `target`, `agent_id` |
| `swarm_list_locks` | List all active locks across the repo | — |

Locks are stored in `.gitnexus/locks/` — local to the repo, Git-agnostic, with 30-minute TTL.

### Tool Examples

**Find code by concept:**
```
query({ query: "database connection pooling" })
query({ query: "authentication middleware", repo: "api-gateway" })
```

**Understand a symbol deeply:**
```
context({ name: "UserService" })
context({ name: "handleRequest", repo: "my-backend" })
```

**Blast radius before editing:**
```
impact({ target: "UserService", direction: "upstream" })
impact({ target: "parseConfig", direction: "both" })
```

**Verify change scope before committing:**
```
detect_changes({ scope: "staged" })
detect_changes({ scope: "all" })
detect_changes({ scope: "compare", base_ref: "main" })
```

**Safe rename:**
```
rename({ symbol_name: "oldName", new_name: "newName", dry_run: true })
rename({ symbol_name: "oldName", new_name: "newName", dry_run: false })
```

**Custom graph query:**
```
cypher({ query: "MATCH (s:Symbol {name: 'login'})-[:CALLS]->(t) RETURN t.name LIMIT 20" })
```

**Generate test stubs:**
```
suggest_tests({ symbol: "processPayment" })
suggest_tests({ symbol: "AuthService", repo: "api-gateway" })
```

---

## MCP Resources

Read these resources to understand your codebase structure before querying:

| Resource | Purpose |
|----------|---------|
| `gitnexus://repos` | List all indexed repositories (read first) |
| `gitnexus://repo/{name}/context` | Codebase stats, staleness check, and available tools |
| `gitnexus://repo/{name}/clusters` | All functional clusters with cohesion scores |
| `gitnexus://repo/{name}/cluster/{name}` | Cluster members and details |
| `gitnexus://repo/{name}/processes` | All execution flows |
| `gitnexus://repo/{name}/process/{name}` | Full process trace with steps |
| `gitnexus://repo/{name}/schema` | Graph schema for Cypher queries |

**Recommended startup sequence for agents:**
```
1. READ gitnexus://repos                          # discover indexed repos
2. READ gitnexus://repo/{name}/context            # check freshness + stats
3. query({ query: "the concept you're working on" })  # orient yourself
```

---

## MCP Prompts

| Prompt | What It Does |
|--------|-------------|
| `detect_impact` | Pre-commit change analysis — scope, affected processes, risk level |
| `generate_map` | Architecture documentation from the knowledge graph with mermaid diagrams |

---

## CLI Commands

```bash
# Setup and indexing
gitnexus setup                    # Configure MCP for your editors (one-time)
gitnexus analyze [path]           # Index a repository (or update stale index)
gitnexus analyze --force          # Force full re-index
gitnexus analyze --embeddings     # Enable embedding generation (slower, better search)
gitnexus analyze --verbose        # Log skipped files when parsers are unavailable

# MCP and serving
gitnexus mcp                      # Start MCP server (stdio) — serves all indexed repos
gitnexus serve                    # Start local HTTP server (multi-repo) for web UI

# Index management
gitnexus list                     # List all indexed repositories
gitnexus status                   # Show index status for current repo
gitnexus clean                    # Delete index for current repo
gitnexus clean --all --force      # Delete all indexes

# Documentation
gitnexus wiki [path]              # Generate LLM-powered docs from knowledge graph
gitnexus wiki --model <model>     # Wiki with custom LLM model (default: gpt-4o-mini)
```

### When to Re-index

The index becomes stale after you commit code. GitNexus will warn you when this happens. Re-index with:

```bash
npx gitnexus analyze
```

**If you use embeddings, preserve them:**
```bash
npx gitnexus analyze --embeddings
```

Check whether embeddings exist:
```bash
cat .gitnexus/meta.json | grep embeddings
```

> **Claude Code users:** A PostToolUse hook detects git mutations (commit, merge, rebase, pull) and automatically notifies the agent to re-run `npx gitnexus analyze`.

---

## How It Works

GitNexus builds a complete knowledge graph of your codebase through a multi-phase indexing pipeline:

1. **Structure** — Walks the file tree and maps folder/file relationships
2. **Parsing** — Extracts functions, classes, methods, and interfaces using Tree-sitter ASTs
3. **Resolution** — Resolves imports and function calls across files with language-aware logic
4. **Clustering** — Groups related symbols into functional communities
5. **Processes** — Traces execution flows from entry points through call chains
6. **Search** — Builds hybrid search indexes for fast retrieval

The result is a **LadybugDB graph database** stored locally in `.gitnexus/` with full-text search and semantic embeddings.

---

## Multi-Repo Support

GitNexus supports indexing multiple repositories. Each `gitnexus analyze` registers the repo in a global registry (`~/.gitnexus/registry.json`). The MCP server serves all indexed repos automatically.

```bash
# Index multiple repos
cd ~/projects/api && npx gitnexus analyze
cd ~/projects/frontend && npx gitnexus analyze
cd ~/projects/shared-lib && npx gitnexus analyze

# All are available from one MCP server
list_repos()  # → ["api", "frontend", "shared-lib"]
query({ query: "authentication", repo: "api" })
impact({ target: "SharedAuth.verify", repo: "shared-lib" })
```

**Cross-repo blast radius** is supported via `CROSS_REPO_CALL` edges — if `shared-lib` exports functions that `api` calls, `impact()` will trace through the boundary.

---

## Agent Skills

GitNexus ships with skill files that teach AI agents how to use the tools effectively. Installed automatically by `gitnexus analyze` (per-repo) and `gitnexus setup` (global).

| Skill | When to Use |
|-------|------------|
| **Exploring** | "How does X work?" / "What calls this function?" / architecture overview |
| **Impact Analysis** | "What will break if I change X?" / pre-edit safety check |
| **Debugging** | "Why is X failing?" / trace bugs through call chains |
| **Refactoring** | Rename / extract / split / move code safely |
| **CLI Guide** | `gitnexus analyze`, `status`, `clean`, `wiki` commands |

---

## Supported Languages

TypeScript, JavaScript, Python, Java, C, C++, C#, Go, Rust, PHP, Kotlin, Swift, Ruby

### Language Feature Matrix

| Language | Imports | Named Bindings | Exports | Heritage | Type Annotations | Constructor Inference | Config | Frameworks | Entry Points |
|----------|---------|----------------|---------|----------|-----------------|---------------------|--------|------------|-------------|
| TypeScript | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| JavaScript | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| Python | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Java | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Kotlin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| C# | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Go | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rust | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| PHP | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ruby | ✓ | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ |
| Swift | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| C | — | — | ✓ | — | ✓ | ✓ | — | ✓ | ✓ |
| C++ | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |

**Imports** — cross-file import resolution · **Named Bindings** — `import { X as Y }` / re-export tracking · **Exports** — public/exported symbol detection · **Heritage** — class inheritance, interfaces, mixins · **Type Annotations** — explicit type extraction for receiver resolution · **Constructor Inference** — infer receiver type from constructor calls (`self`/`this` resolution included for all languages) · **Config** — language toolchain config parsing (tsconfig, go.mod, etc.) · **Frameworks** — AST-based framework pattern detection · **Entry Points** — entry point scoring heuristics

---

## Requirements

- Node.js >= 18
- Git repository (uses git for commit tracking)

---

## Privacy

- All processing happens locally on your machine
- No code is sent to any server
- Index stored in `.gitnexus/` inside your repo (gitignored)
- Global registry at `~/.gitnexus/` stores only paths and metadata

---

## Web UI

GitNexus also has a browser-based UI at [gitnexus.vercel.app](https://gitnexus.vercel.app) — 100% client-side, your code never leaves the browser.

**Local Backend Mode:** Run `gitnexus serve` and open the web UI locally — it auto-detects the server and shows all your indexed repos, with full AI chat support. No need to re-upload or re-index. The agent's tools (Cypher queries, search, code navigation) route through the backend HTTP API automatically.

---

## License

[PolyForm Noncommercial 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0/)

Free for non-commercial use. Contact for commercial licensing.
