/**
 * MCPRouter
 *
 * Routes tool calls to LocalBackend or RemoteBackend based on repo resolution.
 * Maintains a registry of RemoteInstance configurations loaded from the
 * GITNEXUS_REMOTE_INSTANCES environment variable.
 *
 * GITNEXUS_REMOTE_INSTANCES format (JSON array):
 *   [{"id":"repo-a","url":"http://192.168.1.10:3000","label":"Backend"},...]
 */

import { RemoteBackend } from './remote/remote-backend.js';
import type {
  RemoteInstance,
  RemoteGraphMeta,
  AggregatedQueryResult,
} from '../core/graph/remote-types.js';

export class MCPRouter {
  private remoteBackend: RemoteBackend;

  constructor() {
    this.remoteBackend = new RemoteBackend();
  }

  /**
   * Parse the GITNEXUS_REMOTE_INSTANCES environment variable.
   * Returns an empty array on parse failure or when env var is unset.
   */
  private loadRemoteInstances(): RemoteInstance[] {
    const raw = process.env.GITNEXUS_REMOTE_INSTANCES;
    if (!raw?.trim()) return [];

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        console.warn('GitNexus MCPRouter: GITNEXUS_REMOTE_INSTANCES must be a JSON array');
        return [];
      }
      return parsed as RemoteInstance[];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`GitNexus MCPRouter: failed to parse GITNEXUS_REMOTE_INSTANCES: ${msg}`);
      return [];
    }
  }

  /**
   * List all configured remote instances with their reachability status.
   */
  async listRemoteInstances(): Promise<{ instances: RemoteInstance[]; reachable: boolean[] }> {
    const instances = this.loadRemoteInstances();

    if (instances.length === 0) {
      return { instances: [], reachable: [] };
    }

    const reachable = await Promise.all(
      instances.map(inst => this.remoteBackend.probe(inst.url))
    );

    return { instances, reachable };
  }

  /**
   * Fetch graph metadata from all configured remote instances.
   * Queries each instance in parallel; errors are silently skipped.
   */
  async fetchAllRemoteGraphMeta(): Promise<RemoteGraphMeta[]> {
    const instances = this.loadRemoteInstances();
    if (instances.length === 0) return [];

    const results = await Promise.all(
      instances.map(async (inst) => {
        const meta = await this.remoteBackend.fetchGraphMeta(inst.url);
        // Attach instance id to each entry
        return meta.map(m => ({ ...m, instanceId: inst.id }));
      })
    );

    return results.flat();
  }

  /**
   * Aggregate query results across all (or a subset of) reachable remote instances.
   *
   * @param query       - The concept or symbol to search for
   * @param instanceIds - Optional array of instance IDs to target; defaults to all
   * @param limit       - Max results per instance (default: 10)
   */
  async aggregateQuery(
    query: string,
    instanceIds?: string[],
    limit = 10
  ): Promise<AggregatedQueryResult[]> {
    const allInstances = this.loadRemoteInstances();
    const targets = instanceIds?.length
      ? allInstances.filter(inst => instanceIds.includes(inst.id))
      : allInstances;

    if (targets.length === 0) {
      return [];
    }

    const results = await Promise.all(
      targets.map(async (inst): Promise<AggregatedQueryResult[]> => {
        // Fetch the repo list for this instance first
        let repos: RemoteGraphMeta[] = [];
        try {
          repos = await this.remoteBackend.fetchGraphMeta(inst.url);
        } catch {
          return [
            {
              instanceId: inst.id,
              instanceUrl: inst.url,
              repoName: '*',
              results: [],
              error: 'Failed to fetch repo list',
            },
          ];
        }

        if (repos.length === 0) {
          return [
            {
              instanceId: inst.id,
              instanceUrl: inst.url,
              repoName: '*',
              results: [],
              error: 'No repos available on this instance',
            },
          ];
        }

        // Query each repo on this instance in parallel
        const repoResults = await Promise.all(
          repos.map(async (repo): Promise<AggregatedQueryResult> => {
            try {
              const queryResults = await this.remoteBackend.proxyQuery(
                inst.url,
                repo.repoName,
                query,
                limit
              );
              return {
                instanceId: inst.id,
                instanceUrl: inst.url,
                repoName: repo.repoName,
                results: queryResults,
              };
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              return {
                instanceId: inst.id,
                instanceUrl: inst.url,
                repoName: repo.repoName,
                results: [],
                error: msg,
              };
            }
          })
        );

        return repoResults;
      })
    );

    return results.flat();
  }
}
