/**
 * MCP Command
 *
 * Starts the MCP server in standalone mode.
 * Loads all indexed repos from the global registry.
 * No longer depends on cwd — works from any directory.
 */

import { startMCPServer } from '../mcp/server.js';
import { LocalBackend } from '../mcp/local/local-backend.js';
import { realStdoutWrite } from '../mcp/core/lbug-adapter.js';

export const mcpCommand = async () => {
  // Belt-and-suspenders stdout guard for the MCP stdio transport.
  //
  // lbug-adapter already silences process.stdout.write around each LadybugDB
  // call (Database init, Connection creation, query execution).  However,
  // native C++ code inside the addon can write to file-descriptor 1 directly
  // via syscall, bypassing the Node.js stream layer entirely.  If that
  // happens, those bytes corrupt the JSON-RPC Content-Length framing that
  // the MCP client relies on.
  //
  // Defense: permanently redirect process.stdout.write → stderr for the
  // entire lifetime of the MCP server process.  Any code that accidentally
  // writes to stdout (logging, native addon diagnostic output caught by the
  // Node.js layer, third-party deps) is silently rerouted to stderr instead.
  //
  // The MCP transport is unaffected: it was constructed with realStdoutWrite
  // (captured in lbug-adapter at module-load time, before this patch) so its
  // JSON-RPC write path always targets the real stdout file descriptor.
  process.stdout.write = ((...args: Parameters<typeof process.stdout.write>) =>
    (process.stderr.write as typeof process.stdout.write)(...args)
  ) as typeof process.stdout.write;

  // Prevent unhandled errors from crashing the MCP server process.
  // LadybugDB lock conflicts and transient errors should degrade gracefully.
  process.on('uncaughtException', (err) => {
    process.stderr.write(`GitNexus MCP: uncaught exception — ${err.message}\n`);
    // Process is in an undefined state after uncaughtException — exit after flushing
    setTimeout(() => process.exit(1), 100);
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    process.stderr.write(`GitNexus MCP: unhandled rejection — ${msg}\n`);
  });

  // Verify that the MCP transport's write path (realStdoutWrite) still points
  // to the original stdout fd — not the stderr-redirect installed above.
  // This is a development-time assertion; it's a no-op in production if the
  // module load order is correct (lbug-adapter imported before this function runs).
  if (realStdoutWrite === (process.stdout.write as unknown)) {
    process.stderr.write(
      'GitNexus MCP warning: realStdoutWrite was captured after the stdout redirect patch. ' +
      'JSON-RPC responses may be lost. Check module load order.\n'
    );
  }

  // Initialize multi-repo backend from registry.
  // The server starts even with 0 repos — tools call refreshRepos() lazily,
  // so repos indexed after the server starts are discovered automatically.
  const backend = new LocalBackend();
  await backend.init();

  const repos = await backend.listRepos();
  if (repos.length === 0) {
    console.error('GitNexus: No indexed repos yet. Run `gitnexus analyze` in a git repo — the server will pick it up automatically.');
  } else {
    console.error(`GitNexus: MCP server starting with ${repos.length} repo(s): ${repos.map(r => r.name).join(', ')}`);
  }

  // Start MCP server (serves all repos, discovers new ones lazily)
  await startMCPServer(backend);
};
