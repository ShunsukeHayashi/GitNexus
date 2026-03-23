import {
  useEffect, useCallback, useMemo, useState,
  forwardRef, useImperativeHandle, useRef,
} from 'react';
import ForceGraph3D, { ForceGraphMethods } from 'react-force-graph-3d';
import * as THREE from 'three';
import { useAppState } from '../hooks/useAppState';
import {
  GraphNode, GraphLink,
  NODE_COLORS, EDGE_COLORS,
  DEFAULT_NODE_COLOR, DEFAULT_EDGE_COLOR,
  CROSS_REPO_EDGE_COLOR,
  BLAST_COLOR, SELECTED_COLOR, TOOL_COLOR, CITATION_COLOR, HIGHLIGHT_COLOR,
  buildNodeObject, getRepoColor,
} from '../lib/graphNodeUtils';
import { GraphCanvasOverlay } from './GraphCanvasOverlay';
import type { UserPresence } from '../core/graph/types';

export interface GraphCanvasHandle {
  focusNode: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// T012: cached dashed-line materials for CROSS_REPO_CALL edges.
// Keyed by color hex so we reuse materials across edges of the same color.
// ---------------------------------------------------------------------------
const _dashedMatCache = new Map<string, THREE.LineDashedMaterial>();

function _getCrossRepoMaterial(hexColor: string): THREE.LineDashedMaterial {
  if (!_dashedMatCache.has(hexColor)) {
    _dashedMatCache.set(hexColor, new THREE.LineDashedMaterial({
      color:       new THREE.Color(hexColor),
      dashSize:    6,
      gapSize:     3,
      linewidth:   2,
      transparent: true,
      opacity:     0.85,
    }));
  }
  return _dashedMatCache.get(hexColor)!;
}

/**
 * Build a Three.js dashed line for a CROSS_REPO_CALL link.
 * react-force-graph-3d calls linkThreeObject(link) and expects a THREE.Object3D.
 * The library places the object at the midpoint between source/target and updates
 * position automatically only when linkPositionUpdate is also provided.
 * We use a simple approach: create a line from source→target coords in link space.
 */
function buildCrossRepoLinkObject(link: GraphLink): THREE.Object3D {
  // Geometry will be updated by linkPositionUpdate; create empty geometry for now.
  const geometry = new THREE.BufferGeometry();
  geometry.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
  const mat = _getCrossRepoMaterial(CROSS_REPO_EDGE_COLOR);
  const line = new THREE.Line(geometry, mat);
  line.computeLineDistances(); // required for dashes
  return line;
}

export interface GraphCanvasProps {
  /** T023: list of currently active presence users from usePresence() hook */
  presenceUsers?: UserPresence[];
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(({ presenceUsers }, ref) => {
  const {
    graph,
    setSelectedNode,
    selectedNode: appSelectedNode,
    openCodePanel,
    isAIHighlightsEnabled,
    toggleAIHighlights,
    highlightedNodeIds,
    setHighlightedNodeIds,
    aiCitationHighlightedNodeIds,
    aiToolHighlightedNodeIds,
    blastRadiusNodeIds,
    visibleLabels,
    visibleEdgeTypes,
    animatedNodes,
  } = useAppState();

  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const [swarmLocks, setSwarmLocks] = useState<{file: string, agent: string}[]>([]);
  
  // Poll for agent locks
  useEffect(() => {
    const fetchLocks = async () => {
      try {
        const res = await fetch('/api/swarm-state');
        if (res.ok) {
          const data = await res.json();
          setSwarmLocks(data.locks || []);
        }
      } catch (e) { /* ignore */ }
    };
    fetchLocks();
    const interval = setInterval(fetchLocks, 2000);
    return () => clearInterval(interval);
  }, []);

  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; links: GraphLink[] }>({
    nodes: [],
    links: [],
  });

  const warmupTicks = useMemo(
    () => Math.min(50, Math.max(10, Math.ceil((graph?.nodes.length ?? 0) / 20))),
    [graph?.nodes.length],
  );

  useEffect(() => {
    if (!graph) return;

    const visibleLabelSet = new Set<string>(visibleLabels);
    const visibleEdgeSet  = new Set<string>(visibleEdgeTypes);
    const effectiveBlast  = isAIHighlightsEnabled ? blastRadiusNodeIds : new Set<string>();

    // T023: Build per-node presence look-up maps for O(1) access during node mapping.
    // focusMap:    nodeId → array of user colors that have this node focused
    // selectedMap: nodeId → array of user colors that have this node selected
    const focusMap    = new Map<string, string[]>();
    const selectedMap = new Map<string, string[]>();
    if (presenceUsers && presenceUsers.length > 0) {
      for (const user of presenceUsers) {
        if (user.focusedNodeId) {
          const arr = focusMap.get(user.focusedNodeId) ?? [];
          arr.push(user.color);
          focusMap.set(user.focusedNodeId, arr);
        }
        if (user.selectedNodeIds) {
          for (const nid of user.selectedNodeIds) {
            const arr = selectedMap.get(nid) ?? [];
            arr.push(user.color);
            selectedMap.set(nid, arr);
          }
        }
      }
    }

    const nodes: GraphNode[] = graph.nodes
      .filter(n => visibleLabelSet.size === 0 || visibleLabelSet.has(n.label))
      .map(n => {
        const isBlast    = effectiveBlast.has(n.id);
        const isSelected = appSelectedNode?.id === n.id;
        const isCitation = isAIHighlightsEnabled && aiCitationHighlightedNodeIds.has(n.id);
        const isTool     = isAIHighlightsEnabled && aiToolHighlightedNodeIds.has(n.id);
        const isHighlit  = highlightedNodeIds.has(n.id);

        const nodeColor = isBlast    ? BLAST_COLOR
                        : isSelected ? SELECTED_COLOR
                        : isTool     ? TOOL_COLOR
                        : isCitation ? CITATION_COLOR
                        : isHighlit  ? HIGHLIGHT_COLOR
                        : NODE_COLORS[n.label] ?? DEFAULT_NODE_COLOR;

        const animationType = animatedNodes.get(n.id)?.type;

        return {
          id:   n.id,
          name: n.properties.name,
          val:  n.label === 'Project'   ? 30 : n.label === 'Package'   ? 20 : n.label === 'Module'    ? 15
              : n.label === 'Folder'    ? 10 : n.label === 'File'      ? 7  : n.label === 'Class'     ? 9
              : n.label === 'Interface' ? 8  : n.label === 'Function'  ? 4  : n.label === 'Method'    ? 3  : 2,
          color: nodeColor,
          glow:  isBlast || isSelected || isCitation || isTool || isHighlit,
          animationType,
          // T012: propagate repoName for cluster force grouping
          repoName: n.properties.repoName,
          raw:   n,
          // T023: attach presence info so buildNodeObject can render rings/tints
          presenceFocusColors:    focusMap.get(n.id),
          presenceSelectedColors: selectedMap.get(n.id),
        };
      });

    const links: GraphLink[] = graph.relationships
      .filter(r => visibleEdgeSet.size === 0 || visibleEdgeSet.has(r.type))
      .map(r => {
        const isCrossRepo = r.type === 'CROSS_REPO_CALL';
        return {
          source: r.sourceId,
          target: r.targetId,
          color:  EDGE_COLORS[r.type] ?? DEFAULT_EDGE_COLOR,
          // T012: flag cross-repo edges for custom Three.js dashed rendering
          isCrossRepo,
          sourceRepo: isCrossRepo ? r.sourceRepo : undefined,
          targetRepo: isCrossRepo ? r.targetRepo : undefined,
        };
      });

    setGraphData({ nodes, links });
  }, [
    graph,
    appSelectedNode,
    highlightedNodeIds,
    blastRadiusNodeIds,
    aiCitationHighlightedNodeIds,
    aiToolHighlightedNodeIds,
    isAIHighlightsEnabled,
    visibleLabels,
    visibleEdgeTypes,
    animatedNodes,
    presenceUsers,
  ]);

  // ---------------------------------------------------------------------------
  // T012: Repository clustering force.
  // After the graph data changes, inject a custom d3 force that gently pulls
  // nodes toward their cluster centre (one centre per unique repoName).
  // The force is applied in 3D (x, y, z) to match react-force-graph-3d.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current as any;

    // Collect unique repoNames from the current nodes
    const repoNames = new Set<string>();
    graphData.nodes.forEach(n => {
      if (n.repoName) repoNames.add(n.repoName);
    });

    if (repoNames.size < 2) {
      // Single repo or no repo info — remove the clustering force
      fg.d3Force('cluster', null);
      return;
    }

    // Assign fixed cluster centres spread in 3D space
    const repoList = Array.from(repoNames);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const spread = 150; // units in 3D space
    const clusterCentres = new Map<string, { x: number; y: number; z: number }>();
    repoList.forEach((repo, i) => {
      const angle  = i * goldenAngle;
      const radius = spread * Math.sqrt((i + 1) / repoList.length);
      const tz     = (i % 2 === 0 ? 1 : -1) * (spread * 0.3 * ((i + 1) / repoList.length));
      clusterCentres.set(repo, {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        z: tz,
      });
    });

    // Custom force: nudge nodes toward their cluster centre each tick
    const strength = 0.08;
    const clusterForce = (alpha: number) => {
      graphData.nodes.forEach((node: any) => {
        const repo = node.repoName as string | undefined;
        if (!repo) return;
        const centre = clusterCentres.get(repo);
        if (!centre) return;
        node.vx = (node.vx ?? 0) + (centre.x - (node.x ?? 0)) * strength * alpha;
        node.vy = (node.vy ?? 0) + (centre.y - (node.y ?? 0)) * strength * alpha;
        node.vz = (node.vz ?? 0) + (centre.z - (node.z ?? 0)) * strength * alpha;
      });
    };

    // Register as a named d3 force so it can be replaced on re-render
    fg.d3Force('cluster', clusterForce);
    fg.d3ReheatSimulation();
  }, [graphData]);

    const nodeThreeObject = useCallback((node: unknown) => {
    const gn = node as GraphNode;
    const baseObject = buildNodeObject(gn);
    
    // Agent Radar: Golden Aura for locked nodes
    const isLocked = swarmLocks.find(l => l.file === gn.id || (gn.filePath && l.file === gn.filePath));
    if (isLocked) {
      const geometry = new THREE.SphereGeometry(6, 16, 16);
      const material = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.4 });
      const aura = new THREE.Mesh(geometry, material);
      
      // Text badge for agent name
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const context = canvas.getContext('2d');
      if (context) {
        context.font = 'Bold 24px Arial';
        context.fillStyle = '#ff9900';
        context.textAlign = 'center';
        context.fillText(isLocked.agent, 128, 40);
        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(20, 5, 1);
        sprite.position.y = 8;
        aura.add(sprite);
      }
      
      baseObject.add(aura);
    }
    return baseObject;
  }, [swarmLocks]);

  // ---------------------------------------------------------------------------
  // T012: CROSS_REPO_CALL dashed-line Three.js object.
  // react-force-graph-3d supports linkThreeObject + linkPositionUpdate to render
  // custom Three.js objects in place of (or in addition to) the default line.
  // We use it to draw dashed lines for cross-repo edges.
  // ---------------------------------------------------------------------------
  const linkThreeObject = useCallback((link: unknown) => {
    const l = link as GraphLink;
    if (!l.isCrossRepo) return undefined as unknown as THREE.Object3D;
    return buildCrossRepoLinkObject(l);
  }, []);

  /**
   * Update the dashed-line geometry each simulation tick so the line tracks the
   * actual node positions set by the force simulation.
   */
  const linkPositionUpdate = useCallback((
    obj: THREE.Object3D,
    coords: { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } },
    link: unknown,
  ): boolean => {
    const l = link as GraphLink;
    if (!l.isCrossRepo || !obj) return false;

    const line = obj as THREE.Line;
    const start = new THREE.Vector3(coords.start.x, coords.start.y, coords.start.z);
    const end   = new THREE.Vector3(coords.end.x,   coords.end.y,   coords.end.z);

    line.geometry.setFromPoints([start, end]);
    line.computeLineDistances(); // refresh dash offsets
    return true; // tell the library we handled position update
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (!node?.raw) return;
    setSelectedNode(node.raw);
    openCodePanel();

    const distance  = 60;
    const dist      = Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0);
    const distRatio = dist > 0 ? 1 + distance / dist : 2.5;
    fgRef.current?.cameraPosition(
      { x: (node.x ?? 0) * distRatio, y: (node.y ?? 0) * distRatio, z: (node.z ?? 0) * distRatio },
      node as any,
      1500,
    );
  }, [setSelectedNode, openCodePanel]);

  useImperativeHandle(ref, () => ({
    focusNode: (nodeId: string) => {
      const liveNodes = (fgRef.current as any)?.graphData()?.nodes as GraphNode[] | undefined;
      const node = liveNodes?.find((n: GraphNode) => n.id === nodeId);
      if (node) handleNodeClick(node);
    },
  }), [handleNodeClick]);

  const handleClearSelection = useCallback(() => {
    setSelectedNode(null);
    setHighlightedNodeIds(new Set());
  }, [setSelectedNode, setHighlightedNodeIds]);

  const handleZoomIn = useCallback(() => {
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) fgRef.current?.cameraPosition(
      { x: pos.x * 0.8, y: pos.y * 0.8, z: pos.z * 0.8 }, undefined, 400,
    );
  }, []);

  const handleZoomOut = useCallback(() => {
    const pos = (fgRef.current as any)?.cameraPosition() as { x: number; y: number; z: number } | undefined;
    if (pos) fgRef.current?.cameraPosition(
      { x: pos.x * 1.25, y: pos.y * 1.25, z: pos.z * 1.25 }, undefined, 400,
    );
  }, []);

  const handleResetCamera = useCallback(() => {
    fgRef.current?.cameraPosition({ x: 0, y: 0, z: 400 }, undefined, 800);
  }, []);

  const handleToggleAIHighlights = useCallback(() => {
    if (isAIHighlightsEnabled) setHighlightedNodeIds(new Set());
    toggleAIHighlights();
  }, [isAIHighlightsEnabled, setHighlightedNodeIds, toggleAIHighlights]);

  // ---------------------------------------------------------------------------
  // T012: Compute the set of distinct repoNames present in current graphData
  // for the overlay legend.
  // ---------------------------------------------------------------------------
  const repoNames = useMemo(() => {
    const names = new Set<string>();
    graphData.nodes.forEach(n => { if (n.repoName) names.add(n.repoName); });
    return names;
  }, [graphData.nodes]);

  return (
    <div className="relative w-full h-full bg-void overflow-hidden">
      <ForceGraph3D
        ref={fgRef as any}
        graphData={graphData as any}
        nodeId="id"
        nodeLabel="name"
        nodeColor="color"
        nodeVal="val"
        nodeThreeObject={nodeThreeObject as any}
        linkColor="color"
        backgroundColor="#f2f2f7"
        onNodeClick={handleNodeClick as any}
        enableNodeDrag={false}
        linkOpacity={0.6}
        linkWidth={1.0}
        warmupTicks={warmupTicks}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        linkDirectionalParticleColor="color"
        // T012: custom Three.js dashed line for CROSS_REPO_CALL edges
        linkThreeObject={linkThreeObject as any}
        linkPositionUpdate={linkPositionUpdate as any}
      />

      <GraphCanvasOverlay
        selectedNode={appSelectedNode}
        onClearSelection={handleClearSelection}
        isAIHighlightsEnabled={isAIHighlightsEnabled}
        onToggleAIHighlights={handleToggleAIHighlights}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetCamera={handleResetCamera}
        presenceUsers={presenceUsers}
        repoNames={repoNames}
      />
    </div>
  );
});

GraphCanvas.displayName = 'GraphCanvas';
