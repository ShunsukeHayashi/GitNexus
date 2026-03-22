import type { GraphNode, GraphRelationship, RelationshipType } from '../graph/types.js';
import { IMPACT_RELATION_CONFIDENCE, isTestFilePath, VALID_RELATION_TYPES } from '../../mcp/local/local-backend.js';

export interface FederatedImpactParams {
  target: string;
  direction: 'upstream' | 'downstream';
  maxDepth?: number;
  relationTypes?: string[];
  includeTests?: boolean;
  minConfidence?: number;
  namespace?: string;
}

export interface FederatedImpactNode {
  depth: number;
  id: string;
  name: string;
  type: string;
  filePath: string;
  namespace?: string;
  relationType: string;
  confidence: number;
}

export interface FederatedGraphData {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}

type AdjacencyEntry = {
  nextId: string;
  relationship: GraphRelationship;
};

const DEFAULT_RELATION_TYPES: RelationshipType[] = [
  'CALLS',
  'IMPORTS',
  'EXTENDS',
  'IMPLEMENTS',
  'CROSS_REPO_CALL',
];

const confidenceForRelType = (relType: string | undefined): number =>
  IMPACT_RELATION_CONFIDENCE[relType ?? ''] ?? 0.5;

function buildAdjacency(
  relationships: GraphRelationship[],
  relationTypes: Set<string>,
  minConfidence: number,
): {
  incoming: Map<string, AdjacencyEntry[]>;
  outgoing: Map<string, AdjacencyEntry[]>;
} {
  const incoming = new Map<string, AdjacencyEntry[]>();
  const outgoing = new Map<string, AdjacencyEntry[]>();

  for (const relationship of relationships) {
    if (!relationTypes.has(relationship.type)) continue;
    if ((relationship.confidence ?? 0) < minConfidence) continue;

    const outgoingEntries = outgoing.get(relationship.sourceId) || [];
    outgoingEntries.push({ nextId: relationship.targetId, relationship });
    outgoing.set(relationship.sourceId, outgoingEntries);

    const incomingEntries = incoming.get(relationship.targetId) || [];
    incomingEntries.push({ nextId: relationship.sourceId, relationship });
    incoming.set(relationship.targetId, incomingEntries);
  }

  return { incoming, outgoing };
}

function normalizeRelationTypes(relationTypes?: string[]): Set<string> {
  const requested = relationTypes && relationTypes.length > 0
    ? relationTypes.filter((type) => VALID_RELATION_TYPES.has(type) || type === 'CROSS_REPO_CALL')
    : DEFAULT_RELATION_TYPES;
  return new Set(requested.length > 0 ? requested : DEFAULT_RELATION_TYPES);
}

function findTargets(
  nodes: GraphNode[],
  target: string,
  namespace?: string,
): GraphNode[] {
  return nodes.filter((node) => {
    const nameMatches = node.properties.name === target || node.id === target;
    if (!nameMatches) return false;
    if (!namespace) return true;
    return node.properties.namespace === namespace;
  });
}

function computeAffectedProcesses(
  impactedIds: Set<string>,
  relationships: GraphRelationship[],
  nodesById: Map<string, GraphNode>,
): Array<{ name: string; namespace?: string; hits: number; broken_at_step?: number; step_count?: number }> {
  const processHits = new Map<string, { name: string; namespace?: string; hits: number; broken_at_step?: number; step_count?: number }>();

  for (const relationship of relationships) {
    if (relationship.type !== 'STEP_IN_PROCESS') continue;
    if (!impactedIds.has(relationship.sourceId)) continue;

    const processNode = nodesById.get(relationship.targetId);
    if (!processNode) continue;

    const existing = processHits.get(processNode.id) || {
      name: processNode.properties.heuristicLabel || processNode.properties.name,
      namespace: processNode.properties.namespace,
      hits: 0,
      broken_at_step: relationship.step,
      step_count: processNode.properties.stepCount,
    };

    existing.hits += 1;
    if (relationship.step !== undefined) {
      existing.broken_at_step = existing.broken_at_step === undefined
        ? relationship.step
        : Math.min(existing.broken_at_step, relationship.step);
    }
    processHits.set(processNode.id, existing);
  }

  return Array.from(processHits.values()).sort((a, b) => b.hits - a.hits).slice(0, 20);
}

function computeAffectedModules(
  impactedIds: Set<string>,
  directIds: Set<string>,
  relationships: GraphRelationship[],
  nodesById: Map<string, GraphNode>,
): Array<{ name: string; namespace?: string; hits: number; impact: 'direct' | 'indirect' }> {
  const moduleHits = new Map<string, { name: string; namespace?: string; hits: number; impact: 'direct' | 'indirect' }>();
  const directModules = new Set<string>();

  for (const relationship of relationships) {
    if (relationship.type !== 'MEMBER_OF') continue;
    const communityNode = nodesById.get(relationship.targetId);
    if (!communityNode) continue;

    if (impactedIds.has(relationship.sourceId)) {
      const key = communityNode.id;
      const existing = moduleHits.get(key) || {
        name: communityNode.properties.heuristicLabel || communityNode.properties.name,
        namespace: communityNode.properties.namespace,
        hits: 0,
        impact: 'indirect' as const,
      };
      existing.hits += 1;
      moduleHits.set(key, existing);
    }

    if (directIds.has(relationship.sourceId)) {
      directModules.add(communityNode.id);
    }
  }

  return Array.from(moduleHits.entries())
    .map(([communityId, hit]) => ({
      ...hit,
      impact: directModules.has(communityId) ? 'direct' as const : 'indirect' as const,
    }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 20);
}

function computeRisk(
  directCount: number,
  processCount: number,
  moduleCount: number,
  repoCount: number,
  impactedCount: number,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (directCount >= 30 || processCount >= 5 || moduleCount >= 5 || repoCount >= 3 || impactedCount >= 200) {
    return 'CRITICAL';
  }
  if (directCount >= 15 || processCount >= 3 || moduleCount >= 3 || repoCount >= 2 || impactedCount >= 100) {
    return 'HIGH';
  }
  if (directCount >= 5 || impactedCount >= 30 || repoCount >= 2) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function calculateFederatedImpact(
  graph: FederatedGraphData,
  params: FederatedImpactParams,
): any {
  const maxDepth = params.maxDepth || 3;
  const relationTypes = normalizeRelationTypes(params.relationTypes);
  const includeTests = params.includeTests ?? false;
  const minConfidence = params.minConfidence ?? 0;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const targets = findTargets(graph.nodes, params.target, params.namespace);

  if (targets.length === 0) {
    return { error: `Target '${params.target}' not found` };
  }
  if (targets.length > 1) {
    return {
      error: `Target '${params.target}' is ambiguous across repositories. Specify namespace.`,
      candidates: targets.map((node) => ({
        id: node.id,
        name: node.properties.name,
        type: node.label,
        filePath: node.properties.filePath,
        namespace: node.properties.namespace,
      })),
    };
  }

  const targetNode = targets[0];
  const { incoming, outgoing } = buildAdjacency(graph.relationships, relationTypes, minConfidence);
  const adjacency = params.direction === 'upstream' ? incoming : outgoing;

  const impacted: FederatedImpactNode[] = [];
  const grouped: Record<number, FederatedImpactNode[]> = {};
  const visited = new Set<string>([targetNode.id]);
  let frontier = [targetNode.id];

  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const sourceId of frontier) {
      const related = adjacency.get(sourceId) || [];
      for (const entry of related) {
        const node = nodesById.get(entry.nextId);
        if (!node) continue;
        if (!includeTests && isTestFilePath(node.properties.filePath || '')) continue;
        if (visited.has(node.id)) continue;

        visited.add(node.id);
        nextFrontier.push(node.id);

        const confidence = entry.relationship.confidence > 0
          ? entry.relationship.confidence
          : confidenceForRelType(entry.relationship.type);
        const item: FederatedImpactNode = {
          depth,
          id: node.id,
          name: node.properties.name,
          type: node.label,
          filePath: node.properties.filePath || '',
          namespace: node.properties.namespace,
          relationType: entry.relationship.type,
          confidence,
        };
        impacted.push(item);
        const bucket = grouped[depth] || [];
        bucket.push(item);
        grouped[depth] = bucket;
      }
    }

    frontier = nextFrontier;
  }

  const impactedIds = new Set(impacted.map((item) => item.id));
  const directIds = new Set((grouped[1] || []).map((item) => item.id));
  const affectedProcesses = computeAffectedProcesses(impactedIds, graph.relationships, nodesById);
  const affectedModules = computeAffectedModules(impactedIds, directIds, graph.relationships, nodesById);
  const affectedRepos = Array.from(new Set(impacted.map((item) => item.namespace).filter(Boolean))) as string[];
  const risk = computeRisk(
    (grouped[1] || []).length,
    affectedProcesses.length,
    affectedModules.length,
    affectedRepos.length,
    impacted.length,
  );

  return {
    target: {
      id: targetNode.id,
      name: targetNode.properties.name,
      type: targetNode.label,
      filePath: targetNode.properties.filePath,
      namespace: targetNode.properties.namespace,
    },
    direction: params.direction,
    impactedCount: impacted.length,
    risk,
    summary: {
      direct: (grouped[1] || []).length,
      processes_affected: affectedProcesses.length,
      modules_affected: affectedModules.length,
      repos_affected: affectedRepos.length,
    },
    affected_processes: affectedProcesses,
    affected_modules: affectedModules,
    affected_repos: affectedRepos,
    byDepth: grouped,
  };
}
