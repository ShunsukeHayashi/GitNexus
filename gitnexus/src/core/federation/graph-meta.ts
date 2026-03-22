import path from 'path';
import { type GraphNode, type GraphRelationship } from '../graph/types.js';
import { executeQuery, withLbugDb } from '../lbug/lbug-adapter.js';
import { NODE_TABLES } from '../lbug/schema.js';
import type { RepoMeta } from '../../storage/repo-manager.js';

export interface GraphMetaRepoRecord {
  name: string;
  namespace: string;
  repoPath?: string;
  indexedAt?: string;
  lastCommit?: string;
  stats?: RepoMeta['stats'];
}

export interface GraphMetaSnapshot {
  repo: GraphMetaRepoRecord;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

export type GraphMetaJsonlRecord =
  | { kind: 'repo'; repo: GraphMetaRepoRecord }
  | { kind: 'node'; node: GraphNode }
  | { kind: 'relationship'; relationship: GraphRelationship };

const buildNodeQuery = (table: string): string => {
  if (table === 'File') {
    return 'MATCH (n:File) RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.namespace AS namespace';
  }
  if (table === 'Folder') {
    return 'MATCH (n:Folder) RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.namespace AS namespace';
  }
  if (table === 'Community') {
    return 'MATCH (n:Community) RETURN n.id AS id, n.label AS label, n.namespace AS namespace, n.heuristicLabel AS heuristicLabel, n.cohesion AS cohesion, n.symbolCount AS symbolCount';
  }
  if (table === 'Process') {
    return 'MATCH (n:Process) RETURN n.id AS id, n.label AS label, n.namespace AS namespace, n.heuristicLabel AS heuristicLabel, n.processType AS processType, n.stepCount AS stepCount, n.communities AS communities, n.entryPointId AS entryPointId, n.terminalId AS terminalId';
  }

  return `MATCH (n:${table}) RETURN n.id AS id, n.name AS name, n.filePath AS filePath, n.namespace AS namespace, n.startLine AS startLine, n.endLine AS endLine`;
};

export async function buildGraphMetaSnapshot(
  lbugPath: string,
  repo: Omit<GraphMetaRepoRecord, 'namespace'> & { namespace?: string },
): Promise<GraphMetaSnapshot> {
  const nodes: GraphNode[] = [];
  const namespace = repo.namespace || path.basename(path.resolve(repo.repoPath || repo.name));

  await withLbugDb(lbugPath, async () => {
    for (const table of NODE_TABLES) {
      try {
        const rows = await executeQuery(buildNodeQuery(table));
        for (const row of rows) {
          nodes.push({
            id: row.id ?? row[0],
            label: table as GraphNode['label'],
            properties: {
              name: row.name ?? row.label ?? row[1],
              filePath: row.filePath ?? row[2] ?? '',
              namespace: row.namespace || namespace,
              startLine: row.startLine,
              endLine: row.endLine,
              heuristicLabel: row.heuristicLabel,
              cohesion: row.cohesion,
              symbolCount: row.symbolCount,
              processType: row.processType,
              stepCount: row.stepCount,
              communities: row.communities,
              entryPointId: row.entryPointId,
              terminalId: row.terminalId,
            },
          });
        }
      } catch {
        // Empty tables are valid in sparse graphs.
      }
    }
  });

  const relationships = await withLbugDb(lbugPath, async () => {
    const rels: GraphRelationship[] = [];
    const rows = await executeQuery(
      'MATCH (a)-[r:CodeRelation]->(b) RETURN a.id AS sourceId, b.id AS targetId, r.type AS type, r.confidence AS confidence, r.reason AS reason, r.step AS step'
    );

    for (const row of rows) {
      rels.push({
        id: `${row.sourceId}_${row.type}_${row.targetId}`,
        type: row.type,
        sourceId: row.sourceId,
        targetId: row.targetId,
        confidence: row.confidence,
        reason: row.reason,
        step: row.step,
      });
    }

    return rels;
  });

  return {
    repo: {
      ...repo,
      namespace,
    },
    nodes,
    relationships,
  };
}

export function serializeGraphMetaJsonl(snapshot: GraphMetaSnapshot): string {
  const lines: string[] = [
    JSON.stringify({ kind: 'repo', repo: snapshot.repo } satisfies GraphMetaJsonlRecord),
  ];

  for (const node of snapshot.nodes) {
    lines.push(JSON.stringify({ kind: 'node', node } satisfies GraphMetaJsonlRecord));
  }

  for (const relationship of snapshot.relationships) {
    lines.push(JSON.stringify({ kind: 'relationship', relationship } satisfies GraphMetaJsonlRecord));
  }

  return lines.join('\n');
}

export function parseGraphMetaJsonl(jsonl: string): GraphMetaSnapshot & { records: GraphMetaJsonlRecord[] } {
  const repos: GraphMetaRepoRecord[] = [];
  const nodes: GraphNode[] = [];
  const relationships: GraphRelationship[] = [];
  const records: GraphMetaJsonlRecord[] = [];

  for (const [index, rawLine] of jsonl.split('\n').entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    let record: GraphMetaJsonlRecord;
    try {
      record = JSON.parse(line) as GraphMetaJsonlRecord;
    } catch (error) {
      throw new Error(`Invalid graph-meta JSONL at line ${index + 1}: ${(error as Error).message}`);
    }

    if (record.kind === 'repo') {
      repos.push(record.repo);
      records.push(record);
      continue;
    }
    if (record.kind === 'node') {
      nodes.push(record.node);
      records.push(record);
      continue;
    }
    if (record.kind === 'relationship') {
      relationships.push(record.relationship);
      records.push(record);
      continue;
    }

    throw new Error(`Unsupported graph-meta record kind at line ${index + 1}`);
  }

  return {
    repo: repos[0] || {
      name: 'unknown',
      namespace: 'unknown',
    },
    nodes,
    relationships,
    records,
  };
}
