/**
 * Remote Instance Types
 *
 * Types for cross-repo MCP aggregation.
 * Used by RemoteBackend and MCPRouter to communicate with external GitNexus instances.
 */

export interface RemoteInstance {
  id: string;
  url: string;         // e.g. "http://192.168.1.10:3000"
  label?: string;
  repoNames?: string[];
}

export interface RemoteGraphMeta {
  instanceId: string;
  instanceUrl: string;
  repoId: string;
  repoName: string;
  repoPath: string;
  symbolCount: number;
  relationCount: number;
  indexedAt: string;   // ISO timestamp
}

export interface AggregatedQueryResult {
  instanceId: string;
  instanceUrl: string;
  repoName: string;
  results: unknown[];  // same shape as local query results
  error?: string;
}
