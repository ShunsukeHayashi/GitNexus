import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { type GraphNode, type GraphRelationship } from '../core/graph/types.js';
import {
  parseGraphMetaJsonl,
  type GraphMetaRepoRecord,
} from '../core/federation/graph-meta.js';

export interface FederationSource {
  url: string;
  repo: string;
}

export interface NormalizedFederationSource extends FederationSource {
  mcpUrl: string;
}

export interface FederatedSourceResult extends NormalizedFederationSource {
  lineCount: number;
  repoCount: number;
  nodeCount: number;
  relationshipCount: number;
}

export interface FederatedGraphMetaResult {
  summary: {
    sourceCount: number;
    repoCount: number;
    nodeCount: number;
    relationshipCount: number;
  };
  sources: FederatedSourceResult[];
  repos: GraphMetaRepoRecord[];
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export type GraphMetaReader = (source: NormalizedFederationSource) => Promise<string>;

export function normalizeMcpUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Federation source url is required');
  }
  if (trimmed.endsWith('/api/mcp')) {
    return trimmed;
  }
  return `${trimmed}/api/mcp`;
}

function getTextContent(contents: Array<{ text?: string; blob?: string }>): string {
  const textEntry = contents.find((entry) => typeof entry.text === 'string');
  if (textEntry?.text) return textEntry.text;

  throw new Error('MCP resource did not return text content');
}

export async function readGraphMetaOverMcp(source: NormalizedFederationSource): Promise<string> {
  const client = new Client(
    { name: 'gitnexus-mcp-router', version: '1.0.0' },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(source.mcpUrl));

  await client.connect(transport);

  try {
    const result = await client.readResource({
      uri: `gitnexus://repo/${encodeURIComponent(source.repo)}/graph-meta`,
    });
    return getTextContent(result.contents);
  } finally {
    await transport.close();
  }
}

export async function aggregateRemoteGraphMeta(
  sources: FederationSource[],
  reader: GraphMetaReader = readGraphMetaOverMcp,
): Promise<FederatedGraphMetaResult> {
  const normalized = sources.map((source) => {
    if (!source.repo?.trim()) {
      throw new Error(`Federation source "${source.url}" is missing repo`);
    }

    return {
      url: source.url,
      repo: source.repo.trim(),
      mcpUrl: normalizeMcpUrl(source.url),
    };
  });

  const repos: GraphMetaRepoRecord[] = [];
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];
  const sourceResults: FederatedSourceResult[] = [];

  for (const source of normalized) {
    const jsonl = await reader(source);
    const parsed = parseGraphMetaJsonl(jsonl);
    const repoRecords = parsed.records.filter((record) => record.kind === 'repo');

    repos.push(...repoRecords.map((record) => record.repo));
    nodes.push(...parsed.nodes);
    relationships.push(...parsed.relationships);
    sourceResults.push({
      ...source,
      lineCount: parsed.records.length,
      repoCount: repoRecords.length,
      nodeCount: parsed.nodes.length,
      relationshipCount: parsed.relationships.length,
    });
  }

  return {
    summary: {
      sourceCount: sourceResults.length,
      repoCount: repos.length,
      nodeCount: nodes.length,
      relationshipCount: relationships.length,
    },
    sources: sourceResults,
    repos,
    nodes,
    relationships,
  };
}
