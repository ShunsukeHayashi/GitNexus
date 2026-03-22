/**
 * useActiveAgents.ts
 * T025: Poll the server for AI agents currently reading/writing graph nodes.
 *
 * Polls GET /api/agents/active every `pollIntervalMs` milliseconds.
 * Returns an empty array when the server is unreachable or returns no data.
 */

import { useState, useEffect } from 'react';
import type { ActiveAgentWork } from '../core/graph/types';

/**
 * Hook: poll the active-agent work registry on the local GitNexus server.
 *
 * @param serverUrl     - Base URL of the GitNexus server (e.g. "http://localhost:4747")
 * @param pollIntervalMs - How often to poll in milliseconds (default: 3000)
 * @returns Array of currently active agent work entries
 */
export function useActiveAgents(
  serverUrl: string | null | undefined,
  pollIntervalMs = 3000,
): ActiveAgentWork[] {
  const [agents, setAgents] = useState<ActiveAgentWork[]>([]);

  useEffect(() => {
    if (!serverUrl) {
      setAgents([]);
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${serverUrl}/api/agents/active`);
        if (res.ok && !cancelled) {
          const data: ActiveAgentWork[] = await res.json();
          setAgents(Array.isArray(data) ? data : []);
        }
      } catch {
        // Server unreachable or offline — silently ignore
      }
    }

    void poll();
    const id = setInterval(() => void poll(), pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverUrl, pollIntervalMs]);

  return agents;
}
