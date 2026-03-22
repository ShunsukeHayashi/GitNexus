export type NodeLabel =
  | 'Project'
  | 'Package'
  | 'Module'
  | 'Folder'
  | 'File'
  | 'Class'
  | 'Function'
  | 'Method'
  | 'Variable'
  | 'Interface'
  | 'Enum'
  | 'Decorator'
  | 'Import'
  | 'Type'
  | 'CodeElement'
  | 'Community'
  | 'Process';


export type NodeProperties = {
  name: string,
  filePath: string,
  /** Repository namespace — set when multi-repo graph is loaded (T012) */
  repoName?: string,
  startLine?: number,
  endLine?: number,
  language?: string,
  isExported?: boolean,
  // Community-specific properties
  heuristicLabel?: string,
  cohesion?: number,
  symbolCount?: number,
  keywords?: string[],
  description?: string,
  enrichedBy?: 'heuristic' | 'llm',
  // Process-specific properties
  processType?: 'intra_community' | 'cross_community',
  stepCount?: number,
  communities?: string[],
  entryPointId?: string,
  terminalId?: string,
  // Entry point scoring (computed by process detection)
  entryPointScore?: number,
  entryPointReason?: string,
}

export type RelationshipType =
  | 'CONTAINS'
  | 'CALLS'
  | 'INHERITS'
  | 'OVERRIDES'
  | 'IMPORTS'
  | 'USES'
  | 'DEFINES'
  | 'DECORATES'
  | 'IMPLEMENTS'
  | 'EXTENDS'
  | 'HAS_METHOD'
  | 'MEMBER_OF'
  | 'STEP_IN_PROCESS'
  /** T012: cross-repository function call resolved by the MCP router */
  | 'CROSS_REPO_CALL'

export interface GraphNode {
  id:  string,
  label: NodeLabel,
  properties: NodeProperties,
}

export interface GraphRelationship {
  id: string,
  sourceId: string,
  targetId: string,
  type: RelationshipType,
  /** Confidence score 0-1 (1.0 = certain, lower = uncertain resolution) */
  confidence: number,
  /** Resolution reason: 'import-resolved', 'same-file', 'fuzzy-global', or empty for non-CALLS */
  reason: string,
  /** Step number for STEP_IN_PROCESS relationships (1-indexed) */
  step?: number,
  /** Source repository name — set only for CROSS_REPO_CALL edges (T012) */
  sourceRepo?: string,
  /** Target repository name — set only for CROSS_REPO_CALL edges (T012) */
  targetRepo?: string,
}

// ---------------------------------------------------------------------------
// T025: Active Agent Work — represents an AI agent currently reading/writing a node
// ---------------------------------------------------------------------------

export interface ActiveAgentWork {
  agentId: string;
  nodeId: string;
  status: 'reading' | 'writing';
  avatar?: string;
  updatedAt?: number;
}

export interface KnowledgeGraph {
  nodes: GraphNode[],
  relationships: GraphRelationship[],
  nodeCount: number,
  relationshipCount: number,
  addNode: (node: GraphNode) => void,
  addRelationship: (relationship: GraphRelationship) => void,
}

// T023: Multiplayer presence — one entry per connected user
export interface UserPresence {
  userId: string;
  displayName: string;
  /** ID of the node the user is currently focused on */
  focusedNodeId?: string;
  /** IDs of nodes the user has selected */
  selectedNodeIds?: string[];
  /** CSS hex color auto-assigned by the server, e.g. "#f59e0b" */
  color: string;
  /** Unix ms timestamp of last update */
  updatedAt?: number;
}