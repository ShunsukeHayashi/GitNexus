/**
 * RemoteBackend
 *
 * Fetches /api/repos metadata and proxies MCP tool calls to remote GitNexus instances.
 * Uses native fetch (Node.js v18+). Results are cached for CACHE_TTL_MS.
 */

import type { RemoteGraphMeta } from '../../core/graph/remote-types.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  data: RemoteGraphMeta[];
  expiresAt: number;
}

export class RemoteBackend {
  private metaCache = new Map<string, CacheEntry>();

  /**
   * Fetch repo list from a remote GitNexus instance.
   * Caches results for CACHE_TTL_MS.
   */
  async fetchGraphMeta(instanceUrl: string): Promise<RemoteGraphMeta[]> {
    const now = Date.now();
    const cached = this.metaCache.get(instanceUrl);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(`${instanceUrl}/api/repos`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.warn(`GitNexus RemoteBackend: ${instanceUrl}/api/repos responded ${response.status}`);
        return [];
      }

      const raw = await response.json() as unknown[];

      // Map raw response to RemoteGraphMeta shape
      const meta: RemoteGraphMeta[] = raw.map((item: any) => ({
        instanceId: item.instanceId ?? instanceUrl,
        instanceUrl,
        repoId: item.id ?? item.name ?? '',
        repoName: item.name ?? item.id ?? '',
        repoPath: item.path ?? item.repoPath ?? '',
        symbolCount: item.stats?.symbolCount ?? item.symbolCount ?? 0,
        relationCount: item.stats?.relationCount ?? item.relationCount ?? 0,
        indexedAt: item.indexedAt ?? new Date().toISOString(),
      }));

      this.metaCache.set(instanceUrl, { data: meta, expiresAt: now + CACHE_TTL_MS });
      return meta;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`GitNexus RemoteBackend: failed to fetch meta from ${instanceUrl}: ${msg}`);
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Proxy a query to a remote instance's search endpoint.
   * First tries /api/repo/{name}/search, then falls back to JSON-RPC /mcp.
   */
  async proxyQuery(instanceUrl: string, repoName: string, query: string, limit = 10): Promise<unknown[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      // Attempt 1: REST endpoint
      const restUrl = `${instanceUrl}/api/repo/${encodeURIComponent(repoName)}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const restResponse = await fetch(restUrl, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (restResponse.ok) {
        const data = await restResponse.json() as unknown;
        if (Array.isArray(data)) return data;
        // Some endpoints wrap results
        const wrapped = data as any;
        if (Array.isArray(wrapped?.results)) return wrapped.results as unknown[];
        if (Array.isArray(wrapped?.data)) return wrapped.data as unknown[];
      }
    } catch {
      // Fall through to JSON-RPC attempt
    }

    // Attempt 2: MCP JSON-RPC endpoint
    const rpcController = new AbortController();
    const rpcTimeoutId = setTimeout(() => rpcController.abort(), 10_000);

    try {
      const rpcResponse = await fetch(`${instanceUrl}/mcp`, {
        method: 'POST',
        signal: rpcController.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'gitnexus_query',
          params: { query, repo: repoName, limit },
        }),
      });

      if (rpcResponse.ok) {
        const rpc = await rpcResponse.json() as any;
        if (rpc?.result) {
          if (Array.isArray(rpc.result)) return rpc.result as unknown[];
          const r = rpc.result as any;
          if (Array.isArray(r?.results)) return r.results as unknown[];
          if (Array.isArray(r?.processes)) return r.processes as unknown[];
          return [rpc.result];
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`GitNexus RemoteBackend: proxyQuery failed for ${instanceUrl}/${repoName}: ${msg}`);
    } finally {
      clearTimeout(rpcTimeoutId);
    }

    clearTimeout(timeoutId);
    return [];
  }

  /**
   * Probe whether a remote instance is reachable.
   * Sends GET /api/repos with a 3-second timeout.
   */
  async probe(instanceUrl: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_000);

    try {
      const response = await fetch(`${instanceUrl}/api/repos`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
